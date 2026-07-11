import { Request, Response } from 'express';
import prisma from '../models/db';
import { AuthRequest } from '../middlewares/auth';
import { Decimal } from '@prisma/client/runtime/library';
import * as ExcelJS from 'exceljs';
import { logInvoiceAction } from '../services/audit.service';
import { getNcfTypesForMode, getNextNcfNumber, resolveTraditionalType, migrateNcfSequences, NCF_PREFIXES } from '../services/ncf.service';

// ==========================================
// HELPER FUNCTIONS FOR LIMITS & LOGS
// ==========================================

async function checkInvoiceLimit(userId: number, companyId: number): Promise<boolean> {
  const settings = await prisma.companySettings.findFirst({
    where: { user_id: userId },
  });

  if (!settings) return true;

  const limits = settings.monthly_invoice_limit;
  if (limits === -1) return true; // Ilimitado

  // Contar facturas del mes actual
  const startOfMonth = new Date();
  startOfMonth.setDate(1);
  startOfMonth.setHours(0, 0, 0, 0);

  const monthlyCount = await prisma.invoice.count({
    where: {
      user_id: userId,
      company_id: companyId,
      created_at: {
        gte: startOfMonth,
      },
    },
  });

  return monthlyCount < limits;
}

async function checkProductLimit(userId: number, companyId: number): Promise<boolean> {
  const settings = await prisma.companySettings.findFirst({
    where: { user_id: userId },
  });

  if (!settings) return true;

  const limits = settings.plan_type === 'starter' ? 20 : 1000; // Por defecto límite de 20 para starter

  const currentCount = await prisma.productService.count({
    where: {
      user_id: userId,
      company_id: companyId,
      is_active: true,
    },
  });

  return currentCount < limits;
}

async function logUsage(userId: number, action: string, extraData?: any) {
  // Guardamos registros en usage_logs o usage_analytics
  try {
    // Si queremos actualizar analíticas mensuales en usage_analytics
    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);

    const endOfMonth = new Date(startOfMonth);
    endOfMonth.setMonth(endOfMonth.getMonth() + 1);
    endOfMonth.setDate(0);
    endOfMonth.setHours(23, 59, 59, 999);

    let analytic = await prisma.usageAnalytics.findFirst({
      where: {
        user_id: userId,
        period_start: startOfMonth,
      },
    });

    if (!analytic) {
      await prisma.usageAnalytics.create({
        data: {
          user_id: userId,
          period_start: startOfMonth,
          period_end: endOfMonth,
          invoices_created: action === 'invoice_created' ? 1 : 0,
          total_revenue: action === 'invoice_created' && extraData?.revenue ? new Decimal(extraData.revenue) : new Decimal(0),
          clients_active: 1,
          alanube_requests: action === 'alanube_sent' ? 1 : 0,
          plan_invoice_limit: 50,
          plan_user_limit: 1,
        },
      });
    } else {
      await prisma.usageAnalytics.update({
        where: { id: analytic.id },
        data: {
          invoices_created: action === 'invoice_created' ? { increment: 1 } : undefined,
          total_revenue: action === 'invoice_created' && extraData?.revenue ? { increment: new Decimal(extraData.revenue) } : undefined,
          alanube_requests: action === 'alanube_sent' ? { increment: 1 } : undefined,
        },
      });
    }
  } catch (error) {
    console.error('⚠️ Error guardando log de uso:', error);
  }
}

export async function generateInvoiceNumber(userId: number, companyId: number): Promise<string> {
  const company = await prisma.company.findUnique({
    where: { id: companyId },
  });

  const prefix = company?.invoice_prefix || 'FACT-';
  let nextNum = company?.next_invoice_number || 1;

  const lastInvoice = await prisma.invoice.findFirst({
    where: {
      company_id: companyId,
    },
    orderBy: { id: 'desc' },
  });

  if (lastInvoice && lastInvoice.invoice_number) {
    try {
      const parts = lastInvoice.invoice_number.split('-');
      const numPart = parts.length > 1 ? parts[1] : lastInvoice.invoice_number.replace(/^\D+/g, '');
      const lastNum = parseInt(numPart, 10);
      if (!isNaN(lastNum) && lastNum >= nextNum) {
        nextNum = lastNum + 1;
      }
    } catch (err) {
      // Ignorar error de parsing
    }
  }

  // Actualizar next_invoice_number en Company para mantener la consistencia
  await prisma.company.update({
    where: { id: companyId },
    data: { next_invoice_number: nextNum + 1 },
  });

  // También actualizar en companySettings legacy por consistencia
  const settings = await prisma.companySettings.findFirst({
    where: { user_id: userId },
  });
  if (settings) {
    await prisma.companySettings.update({
      where: { id: settings.id },
      data: { next_invoice_number: nextNum + 1 },
    });
  }

  return `${prefix}${nextNum.toString().padStart(6, '0')}`;
}

// ==========================================
// CONTROLLERS
// ==========================================

export async function getCompanySettings(req: AuthRequest, res: Response) {
  if (!req.user) {
    return res.status(401).json({ detail: 'No autorizado' });
  }

  try {
    const company = await prisma.company.findFirst({
      where: { id: req.user.company_id },
    });

    let settings = await prisma.companySettings.findFirst({
      where: { user_id: req.user.id },
    });

    if (!settings) {
      // Crear configuración inicial por defecto
      settings = await prisma.companySettings.create({
        data: {
          user_id: req.user.id,
          company_name: company?.name || req.user.email.split('@')[0],
          company_rnc: company?.rnc || '132109122', // Por defecto sandbox
          required_client_fields: JSON.stringify(['name', 'rnc', 'email']),
          client_custom_fields: JSON.stringify([]),
          invoice_template: 'default',
          default_currency: 'DOP',
          tax_percentage: new Decimal(18.0),
          plan_type: 'starter',
          monthly_invoice_limit: 50,
          user_limit: 1,
        },
      });
    }
    // Leer rangos NCF desde Company (per-company) con fallback a CompanySettings (legacy)
    const mode = company?.invoicing_mode || 'electronica';
    const defaultRanges = mode === 'tradicional'
      ? [
          { type: 'B01', prefix: 'B01', next: 1, end: 100 },
          { type: 'B02', prefix: 'B02', next: 1, end: 100 },
          { type: 'B03', prefix: 'B03', next: 1, end: 50 },
          { type: 'B04', prefix: 'B04', next: 1, end: 50 },
        ]
      : [
          { type: 'E31', prefix: 'E31', next: 1, end: 10 },
          { type: 'E32', prefix: 'E32', next: 1, end: 15 },
          { type: 'E33', prefix: 'E33', next: 1, end: 5 },
          { type: 'E34', prefix: 'E34', next: 1, end: 5 },
          { type: 'E41', prefix: 'E41', next: 1, end: 5 },
          { type: 'E43', prefix: 'E43', next: 1, end: 5 },
          { type: 'E44', prefix: 'E44', next: 1, end: 5 },
          { type: 'E45', prefix: 'E45', next: 1, end: 5 },
          { type: 'E46', prefix: 'E46', next: 1, end: 5 },
          { type: 'E47', prefix: 'E47', next: 1, end: 5 },
        ];

    let ncfRanges = defaultRanges;
    if (company?.ncf_ranges) {
      try {
        const parsed = JSON.parse(company.ncf_ranges);
        if (Array.isArray(parsed) && parsed.length > 0) {
          const validTypes = getNcfTypesForMode(mode);
          const filtered = parsed.filter((r: any) => validTypes.includes(r.type || r.prefix));
          if (filtered.length > 0) {
            ncfRanges = filtered;
          }
        }
      } catch (e) { }
    }

    // Sobrescribir con los valores en vivo de la tabla ncfSequence
    if (company?.id) {
      const liveSequences = await prisma.ncfSequence.findMany({
        where: { company_id: company.id },
      });
      const liveMap = new Map(liveSequences.map(s => [s.type, s]));

      ncfRanges = ncfRanges.map((range: any) => {
        const live = liveMap.get(range.type);
        if (live) {
          return {
            ...range,
            next: live.next,
            end: live.end,
          };
        }
        return range;
      });
    }

    return res.status(200).json({
      company_id: company?.id || settings.id,
      company_name: company?.name || settings.company_name,
      company_rnc: company?.rnc || settings.company_rnc,
      company_address: company?.address || settings.company_address || '',
      company_phone: company?.phone || settings.company_phone || '',
      company_email: company?.email || settings.company_email || '',
      required_client_fields: settings.required_client_fields ? JSON.parse(settings.required_client_fields) : [],
      client_custom_fields: ncfRanges,
      invoice_template: settings.invoice_template,
      currency: settings.default_currency,
      tax_rate: Number(settings.tax_percentage),
      plan: settings.plan_type,
      next_invoice_number: company?.next_invoice_number || 1,
      invoice_prefix: company?.invoice_prefix || 'FACT-',
      alanube_company_id: company?.alanube_company_id || settings.alanube_company_id,
      fiscal_provider: company?.fiscal_provider || 'alanube',
      invoicing_mode: company?.invoicing_mode || 'electronica',
      electronic_start_date: company?.electronic_start_date || null,
      gae_company_id: company?.gae_company_id || null,
      certificate_name: company?.certificate_name || null,
      logo_url: company?.logo_url || null,
      limits: {
        invoices: settings.monthly_invoice_limit,
        users: settings.user_limit,
        products: 20,
      },
    });
  } catch (error: any) {
    console.error('❌ Error al obtener configuración de empresa:', error);
    return res.status(500).json({ detail: error.message });
  }
}

export async function updateCompanySettings(req: AuthRequest, res: Response) {
  if (!req.user) {
    return res.status(401).json({ detail: 'No autorizado' });
  }

  const { required_client_fields, client_custom_fields, invoice_template, currency, tax_rate, company_name, company_rnc, company_address, company_email, company_phone, next_invoice_number, invoice_prefix, logo_url } = req.body;

  try {
    let settings = await prisma.companySettings.findFirst({
      where: { user_id: req.user.id },
    });

    if (!settings) {
      settings = await prisma.companySettings.create({
        data: {
          user_id: req.user.id,
          company_name: company_name || req.user.email.split('@')[0],
          company_rnc: company_rnc || '132109122',
        },
      });
    }

    const updated = await prisma.companySettings.update({
      where: { id: settings.id },
      data: {
        company_name: company_name !== undefined ? company_name : settings.company_name,
        company_rnc: company_rnc !== undefined ? company_rnc : settings.company_rnc,
        company_address: company_address !== undefined ? company_address : settings.company_address,
        company_email: company_email !== undefined ? company_email : settings.company_email,
        company_phone: company_phone !== undefined ? company_phone : settings.company_phone,
        required_client_fields: required_client_fields !== undefined ? JSON.stringify(required_client_fields) : settings.required_client_fields,
        client_custom_fields: client_custom_fields !== undefined ? JSON.stringify(client_custom_fields) : settings.client_custom_fields,
        invoice_template: invoice_template !== undefined ? invoice_template : settings.invoice_template,
        default_currency: currency !== undefined ? currency : settings.default_currency,
        tax_percentage: tax_rate !== undefined ? new Decimal(tax_rate) : settings.tax_percentage,
        updated_at: new Date(),
      },
    });

    // También guardar rangos NCF y numeración en Company (per-company)
    if (req.user.company_id) {
      await prisma.company.update({
        where: { id: req.user.company_id },
        data: {
          name: company_name !== undefined ? company_name : undefined,
          rnc: company_rnc !== undefined ? company_rnc : undefined,
          address: company_address !== undefined ? company_address : undefined,
          phone: company_phone !== undefined ? company_phone : undefined,
          email: company_email !== undefined ? company_email : undefined,
          ncf_ranges: client_custom_fields !== undefined ? JSON.stringify(client_custom_fields) : undefined,
          next_invoice_number: next_invoice_number !== undefined ? next_invoice_number : undefined,
          invoice_prefix: invoice_prefix !== undefined ? invoice_prefix : undefined,
          logo_url: logo_url !== undefined ? logo_url : undefined,
        },
      });

      // Sincronizar los rangos con la tabla ncfSequence
      await migrateNcfSequences(req.user.company_id);
    }

    return res.status(200).json({ message: 'Configuración actualizada exitosamente', data: updated });
  } catch (error: any) {
    console.error('❌ Error al actualizar configuración de empresa:', error);
    return res.status(500).json({ detail: error.message });
  }
}

const VALID_MODES = ['tradicional', 'electronica', 'transicion'];

export async function updateInvoicingMode(req: AuthRequest, res: Response) {
  if (!req.user) {
    return res.status(401).json({ detail: 'No autorizado' });
  }

  const { invoicing_mode } = req.body;
  const companyId = req.user.company_id;

  if (!companyId) {
    return res.status(400).json({ detail: 'No hay empresa activa' });
  }

  if (!invoicing_mode || !VALID_MODES.includes(invoicing_mode)) {
    return res.status(400).json({ detail: `Modalidad inválida. Use: ${VALID_MODES.join(', ')}` });
  }

  try {
    const data: any = { invoicing_mode };

    // Si cambia a electrónica y no tiene fecha de inicio, establecerla ahora
    if (invoicing_mode === 'electronica') {
      const company = await prisma.company.findUnique({ where: { id: companyId } });
      if (company && !company.electronic_start_date) {
        data.electronic_start_date = new Date();
      }
    }

    await prisma.company.update({
      where: { id: companyId },
      data,
    });

    // 1. Eliminar secuencias que ya no son válidas para la nueva modalidad
    const validTypes = getNcfTypesForMode(invoicing_mode);
    const existingSeqs = await prisma.ncfSequence.findMany({
      where: { company_id: companyId },
    });
    for (const seq of existingSeqs) {
      if (!validTypes.includes(seq.type)) {
        await prisma.ncfSequence.delete({
          where: { company_id_type: { company_id: companyId, type: seq.type } },
        });
      }
    }

    // 2. Para cada tipo válido de la nueva modalidad, inicializar/sincronizar leyendo
    // la última factura emitida en la base de datos para esta empresa
    for (const type of validTypes) {
      const prefix = NCF_PREFIXES[type];
      if (!prefix) continue;

      const lastInvoice = await prisma.invoice.findFirst({
        where: {
          company_id: companyId,
          ncf: {
            startsWith: prefix,
          },
        },
        orderBy: {
          id: 'desc',
        },
      });

      let lastDbNumber = 0;
      if (lastInvoice && lastInvoice.ncf) {
        const correlativeStr = lastInvoice.ncf.slice(prefix.length);
        const parsedNum = parseInt(correlativeStr, 10);
        if (!isNaN(parsedNum)) {
          lastDbNumber = parsedNum;
        }
      }

      const nextFromDb = lastDbNumber + 1;

      // Buscar si ya existe la secuencia en la BD
      const existing = await prisma.ncfSequence.findUnique({
        where: { company_id_type: { company_id: companyId, type } },
      });

      const finalNext = existing ? Math.max(existing.next, nextFromDb) : nextFromDb;

      await prisma.ncfSequence.upsert({
        where: { company_id_type: { company_id: companyId, type } },
        create: {
          company_id: companyId,
          type,
          prefix,
          next: finalNext,
          end: 999999,
        },
        update: {
          next: finalNext,
        },
      });
    }

    // 3. Sincronizar también el siguiente número de factura (next_invoice_number) de la empresa
    const lastInvoiceAny = await prisma.invoice.findFirst({
      where: { company_id: companyId },
      orderBy: { id: 'desc' },
    });

    let nextInvoiceNum = 1;
    if (lastInvoiceAny && lastInvoiceAny.invoice_number) {
      try {
        const parts = lastInvoiceAny.invoice_number.split('-');
        const numPart = parts.length > 1 ? parts[1] : lastInvoiceAny.invoice_number.replace(/^\D+/g, '');
        const lastNum = parseInt(numPart, 10);
        if (!isNaN(lastNum)) {
          nextInvoiceNum = lastNum + 1;
        }
      } catch (err) {
        // Ignorar
      }
    }

    await prisma.company.update({
      where: { id: companyId },
      data: {
        next_invoice_number: nextInvoiceNum,
      },
    });

    return res.status(200).json({ message: 'Modalidad de facturación actualizada y secuencias sincronizadas', invoicing_mode });
  } catch (error: any) {
    console.error('❌ Error al actualizar modalidad de facturación:', error);
    return res.status(500).json({ detail: error.message });
  }
}

export async function getProducts(req: AuthRequest, res: Response) {
  if (!req.user) {
    return res.status(401).json({ detail: 'No autorizado' });
  }

  const { category } = req.query;

  try {
    console.log(`🔍 Buscando productos del catálogo para company_id: ${req.user.company_id}`);
    const products = await prisma.productService.findMany({
      where: {
        company_id: req.user.company_id || undefined,
        is_active: true,
        category: category ? String(category) : undefined,
      },
    });

    const formatted = products.map((p: { id: any; type: any; name: any; description: any; unit_price: any; category: any; code: any; tax_percentage: any; }) => ({
      id: p.id,
      type: p.type,
      name: p.name,
      description: p.description,
      price: Number(p.unit_price),
      category: p.category,
      sku: p.code,
      tax_rate: Number(p.tax_percentage),
    }));

    return res.status(200).json(formatted);
  } catch (error: any) {
    console.error('❌ Error al obtener productos:', error);
    return res.status(500).json({ detail: error.message });
  }
}

export async function createProduct(req: AuthRequest, res: Response) {
  if (!req.user) {
    return res.status(401).json({ detail: 'No autorizado' });
  }

  const { type, name, description, price, category, sku, tax_rate } = req.body;

  if (!name || price === undefined) {
    return res.status(400).json({ detail: 'Nombre y precio son requeridos' });
  }

  try {
    if (!(await checkProductLimit(req.user.id, req.user.company_id))) {
      return res.status(403).json({ detail: 'Límite de productos alcanzado para su plan' });
    }

    const newProduct = await prisma.productService.create({
      data: {
        user_id: req.user.id,
        company_id: req.user.company_id,
        type: type || 'service',
        name,
        description,
        unit_price: new Decimal(price),
        category,
        code: sku,
        tax_percentage: tax_rate !== undefined ? new Decimal(tax_rate) : new Decimal(18.0),
      },
    });

    return res.status(200).json({ id: newProduct.id, message: 'Producto creado exitosamente' });
  } catch (error: any) {
    console.error('❌ Error al crear producto:', error);
    return res.status(500).json({ detail: error.message });
  }
}

export async function updateProduct(req: AuthRequest, res: Response) {
  if (!req.user) {
    return res.status(401).json({ detail: 'No autorizado' });
  }

  const productId = parseInt(req.params.product_id, 10);
  if (isNaN(productId)) {
    return res.status(400).json({ detail: 'ID de producto inválido' });
  }

  const { type, name, description, price, category, sku, tax_rate } = req.body;

  try {
    const product = await prisma.productService.findFirst({
      where: { id: productId, company_id: req.user.company_id || undefined },
    });

    if (!product) {
      return res.status(404).json({ detail: 'Producto no encontrado' });
    }

    await prisma.productService.update({
      where: { id: productId },
      data: {
        type: type !== undefined ? type : product.type,
        name: name !== undefined ? name : product.name,
        description: description !== undefined ? description : product.description,
        unit_price: price !== undefined ? new Decimal(price) : product.unit_price,
        category: category !== undefined ? category : product.category,
        code: sku !== undefined ? sku : product.code,
        tax_percentage: tax_rate !== undefined ? new Decimal(tax_rate) : product.tax_percentage,
      },
    });

    return res.status(200).json({ message: 'Producto actualizado exitosamente' });
  } catch (error: any) {
    console.error('❌ Error al actualizar producto:', error);
    return res.status(500).json({ detail: error.message });
  }
}

export async function deleteProduct(req: AuthRequest, res: Response) {
  if (!req.user) {
    return res.status(401).json({ detail: 'No autorizado' });
  }

  const productId = parseInt(req.params.product_id, 10);
  if (isNaN(productId)) {
    return res.status(400).json({ detail: 'ID de producto inválido' });
  }

  try {
    const product = await prisma.productService.findFirst({
      where: { id: productId, company_id: req.user.company_id || undefined },
    });

    if (!product) {
      return res.status(404).json({ detail: 'Producto no encontrado' });
    }

    await prisma.productService.update({
      where: { id: productId },
      data: { is_active: false },
    });

    return res.status(200).json({ message: 'Producto eliminado exitosamente' });
  } catch (error: any) {
    console.error('❌ Error al eliminar producto:', error);
    return res.status(500).json({ detail: error.message });
  }
}

export async function getInvoice(req: AuthRequest, res: Response) {
  if (!req.user) return res.status(401).json({ detail: 'No autorizado' });

  const invoiceId = parseInt(req.params.id, 10);
  if (isNaN(invoiceId)) return res.status(400).json({ detail: 'ID de factura inválido' });

  try {
    const invoice = await prisma.invoice.findFirst({
      where: {
        id: invoiceId,
        company_id: req.user.company_id || undefined,
      },
      include: { client: true, items: true, user: true },
    });
    if (!invoice) return res.status(404).json({ detail: 'Factura no encontrada' });

    let flete = 0, otros = 0;
    try {
      if (invoice.custom_fields) {
        const parsed = JSON.parse(invoice.custom_fields);
        flete = Number(parsed.flete_amount || 0);
        otros = Number(parsed.otros_amount || 0);
      }
    } catch { }

    return res.status(200).json({
      id: invoice.id,
      number: invoice.invoice_number,
      client_id: invoice.client_id,
      client_name: invoice.client.name,
      client_rnc: invoice.client.rnc,
      description: invoice.description,
      subtotal: Number(invoice.subtotal),
      tax_amount: Number(invoice.tax_amount),
      discount_amount: Number(invoice.discount_amount),
      flete_amount: flete,
      otros_amount: otros,
      total: Number(invoice.total_amount),
      currency: invoice.currency,
      status: invoice.status,
      created_by: invoice.user?.username || '',
      created_at: invoice.created_at.toISOString(),
      ncf: invoice.ncf,
      due_date: invoice.due_date?.toISOString(),
      notes: invoice.notes,
      custom_fields: invoice.custom_fields,
      items: invoice.items.map((item: any) => ({
        id: item.id,
        description: item.description || item.item_name,
        quantity: Number(item.quantity),
        unit_price: Number(item.unit_price),
        tax_rate: Number(item.tax_percentage),
        billing_indicator: item.billing_indicator,
        good_service_indicator: item.good_service_indicator,
        unit_of_measure: item.unit_of_measure,
        total: Number(item.total_amount),
      })),
    });
  } catch (error: any) {
    console.error('❌ Error al obtener factura:', error);
    return res.status(500).json({ detail: error.message });
  }
}

export async function updateInvoice(req: AuthRequest, res: Response) {
  if (!req.user) return res.status(401).json({ detail: 'No autorizado' });

  const invoiceId = parseInt(req.params.id, 10);
  if (isNaN(invoiceId)) return res.status(400).json({ detail: 'ID de factura inválido' });

  const {
    client_id, description, currency, due_date, notes,
    custom_fields, items, discount_amount, flete_amount, otros_amount,
    document_type, reference_ncf,
  } = req.body;

  try {
    const invoice = await prisma.invoice.findFirst({
      where: {
        id: invoiceId,
        company_id: req.user.company_id || undefined,
      },
    });
    if (!invoice) return res.status(404).json({ detail: 'Factura no encontrada' });
    if (invoice.status !== 'draft') {
      return res.status(400).json({ detail: 'Solo se pueden editar facturas en estado borrador' });
    }
    if (!client_id || !items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ detail: 'client_id y al menos un item son requeridos' });
    }

    const client = await prisma.client.findFirst({
      where: { id: Number(client_id), company_id: req.user.company_id },
    });
    if (!client) return res.status(404).json({ detail: 'Cliente no encontrado' });

    let calculatedSubtotal = 0;
    let calculatedTax = 0;
    const itemsData = items.map((item: any, idx: number) => {
      const qty = Number(item.quantity) || 1;
      const price = Number(item.unit_price) || 0;
      const taxPct = Number(item.tax_rate) || 0;
      const subtotal = qty * price;
      const tax = subtotal * (taxPct / 100);
      calculatedSubtotal += subtotal;
      calculatedTax += tax;
      return {
        line_number: idx + 1,
        item_code: item.sku || null,
        item_name: item.name || item.description || '',
        description: item.description || '',
        quantity: new Decimal(qty),
        unit_price: new Decimal(price),
        tax_percentage: new Decimal(taxPct),
        subtotal: new Decimal(subtotal),
        tax_amount: new Decimal(tax),
        total_amount: new Decimal(subtotal + tax),
        billing_indicator: item.billing_indicator || 1,
        good_service_indicator: item.good_service_indicator || 2,
        unit_of_measure: item.unit_of_measure || 'UND',
      };
    });

    const discount = discount_amount ? Number(discount_amount) : 0;
    const flete = flete_amount ? Number(flete_amount) : 0;
    const otros = otros_amount ? Number(otros_amount) : 0;
    const calculatedTotal = calculatedSubtotal + calculatedTax - discount + flete + otros;
    if (calculatedTotal <= 0) {
      return res.status(400).json({ detail: 'El monto total de la factura debe ser mayor a cero' });
    }

    await prisma.$transaction(async (tx: any) => {
      await tx.invoiceItem.deleteMany({ where: { invoice_id: invoiceId } });
      await tx.invoice.update({
        where: { id: invoiceId },
        data: {
          client_id: client.id,
          description: description || 'Factura de venta',
          amount: new Decimal(calculatedTotal),
          subtotal: new Decimal(calculatedSubtotal),
          tax_amount: new Decimal(calculatedTax),
          discount_amount: new Decimal(discount),
          total_amount: new Decimal(calculatedTotal),
          currency: currency || 'DOP',
          due_date: due_date ? new Date(due_date) : undefined,
          notes,
          document_type: document_type || null,
          reference_ncf: reference_ncf || null,
          custom_fields: custom_fields ? JSON.stringify(custom_fields) : null,
        },
      });
      await tx.invoiceItem.createMany({
        data: itemsData.map((item) => ({ ...item, invoice_id: invoiceId })),
      });
    });

    // Generar NCF si la factura no tiene uno (ej. comprobantes tradicionales creados antes del fix)
    if (!invoice.ncf) {
      const company = await prisma.company.findUnique({ where: { id: req.user.company_id } });
      if (company && company.invoicing_mode === 'tradicional') {
        let docTypeName = 'Factura de Crédito Fiscal';
        try {
          const parsed = typeof custom_fields === 'object' ? custom_fields : JSON.parse(custom_fields || '{}');
          docTypeName = parsed.documento_tipo || docTypeName;
        } catch (_) {}
        const traditionalPrefix = resolveTraditionalType(docTypeName);
        const ncf = await getNextNcfNumber(req.user.company_id, traditionalPrefix);
        await prisma.invoice.update({
          where: { id: invoiceId },
          data: { ncf },
        });
      }
    }

    logInvoiceAction(invoiceId, req.user.id, 'updated', invoice.status, 'draft', 'Factura actualizada');
    return res.status(200).json({ id: invoiceId, message: 'Factura actualizada exitosamente' });
  } catch (error: any) {
    console.error('❌ Error al actualizar factura:', error);
    return res.status(500).json({ detail: error.message });
  }
}

export async function deleteInvoice(req: AuthRequest, res: Response) {
  if (!req.user) return res.status(401).json({ detail: 'No autorizado' });

  const invoiceId = parseInt(req.params.id, 10);
  if (isNaN(invoiceId)) return res.status(400).json({ detail: 'ID de factura inválido' });

  try {
    const invoice = await prisma.invoice.findFirst({
      where: {
        id: invoiceId,
        company_id: req.user.company_id || undefined,
      },
    });
    if (!invoice) return res.status(404).json({ detail: 'Factura no encontrada' });
    if (invoice.status !== 'draft' && invoice.status !== 'error') {
      return res.status(400).json({ detail: 'Solo se pueden eliminar facturas en borrador o con error' });
    }

    logInvoiceAction(invoiceId, req.user.id, 'deleted', invoice.status, undefined, 'Factura eliminada');
    await prisma.invoiceItem.deleteMany({ where: { invoice_id: invoiceId } });
    await prisma.invoice.delete({ where: { id: invoiceId } });

    return res.status(200).json({ message: 'Factura eliminada exitosamente' });
  } catch (error: any) {
    console.error('❌ Error al eliminar factura:', error);
    return res.status(500).json({ detail: error.message });
  }
}

export async function getInvoices(req: AuthRequest, res: Response) {
  if (!req.user) {
    return res.status(401).json({ detail: 'No autorizado' });
  }

  const { status, limit, offset } = req.query;
  const parseLimit = limit ? parseInt(String(limit), 10) : 50;
  const parseOffset = offset ? parseInt(String(offset), 10) : 0;

  try {
    const invoices = await prisma.invoice.findMany({
      where: {
        company_id: req.user.company_id || undefined,
        status: status ? String(status) : undefined,
        user_id: req.user.is_super_admin ? undefined : req.user.id,
      },
      include: {
        client: true,
        items: true,
        user: true,
      },
      take: parseLimit,
      skip: parseOffset,
      orderBy: { id: 'desc' },
    });

    const result = invoices.map((inv: any) => {
      let flete = 0;
      let otros = 0;
      try {
        if (inv.custom_fields) {
          const parsed = JSON.parse(inv.custom_fields);
          flete = Number(parsed.flete_amount || 0);
          otros = Number(parsed.otros_amount || 0);
        }
      } catch (e) { }

      return {
        id: inv.id,
        number: inv.invoice_number,
        client_name: inv.client.name,
        client_rnc: inv.client.rnc,
        subtotal: Number(inv.subtotal),
        tax_amount: Number(inv.tax_amount),
        discount_amount: Number(inv.discount_amount),
        flete_amount: flete,
        otros_amount: otros,
        total: Number(inv.total_amount),
        currency: inv.currency,
        status: inv.status,
        created_by: inv.user?.username || '',
        created_at: inv.created_at.toISOString(),
        document_type: inv.document_type,
        reference_ncf: inv.reference_ncf,
        ncf: inv.ncf || (function () {
          try {
            if (inv.custom_fields) {
              const parsed = JSON.parse(inv.custom_fields);
              return parsed.ncf_comprobante || parsed.alanube_response?.ncf || null;
            }
          } catch (e) { }
          return null;
        })(),
        custom_fields: inv.custom_fields,
        items: inv.items.map((item: any) => ({
          id: item.id,
          description: item.description || item.item_name,
          quantity: Number(item.quantity),
          unit_price: Number(item.unit_price),
          tax_rate: Number(item.tax_percentage),
          total: Number(item.total_amount),
        })),
      };
    });

    return res.status(200).json(result);
  } catch (error: any) {
    console.error('❌ Error al obtener facturas:', error);
    return res.status(500).json({ detail: error.message });
  }
}

export async function createInvoiceWithItems(req: AuthRequest, res: Response) {
  if (!req.user) {
    return res.status(401).json({ detail: 'No autorizado' });
  }

  const userId = req.user.id;
  const companyId = req.user.company_id;

  const {
    client_id,
    description,
    currency,
    due_date,
    notes,
    custom_fields,
    items,
    discount_amount,
    flete_amount,
    otros_amount,
    document_type,
    reference_ncf,
    modification_code,
  } = req.body;

  if (!client_id || !items || !Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ detail: 'client_id y al menos un item son requeridos' });
  }

  try {
    if (!(await checkInvoiceLimit(userId, companyId))) {
      return res.status(403).json({ detail: 'Límite de facturas alcanzado para su plan' });
    }

    const client = await prisma.client.findFirst({
      where: { id: client_id, company_id: companyId },
    });

    if (!client) {
      return res.status(404).json({ detail: 'Cliente no encontrado' });
    }

    // Calcular montos y subtotales
    let calculatedSubtotal = 0;
    let calculatedTax = 0;

    const itemsData = items.map((item: any, index: number) => {
      const quantity = item.quantity !== undefined ? Number(item.quantity) : 1;
      const unitPrice = Number(item.unit_price);
      const taxRate = item.tax_rate !== undefined ? Number(item.tax_rate) : 18.0;

      const subtotal = quantity * unitPrice;
      const taxAmount = (subtotal * taxRate) / 100;
      const totalAmount = subtotal + taxAmount;

      calculatedSubtotal += subtotal;
      calculatedTax += taxAmount;

      return {
        line_number: index + 1,
        item_code: item.sku || item.item_code || '001',
        item_name: item.name || item.description || 'Artículo',
        description: item.description || '',
        quantity: new Decimal(quantity),
        unit_price: new Decimal(unitPrice),
        tax_percentage: new Decimal(taxRate),
        subtotal: new Decimal(subtotal),
        tax_amount: new Decimal(taxAmount),
        total_amount: new Decimal(totalAmount),
        billing_indicator: item.billing_indicator || 1,
        good_service_indicator: item.good_service_indicator || 2, // 2=servicio por defecto
        unit_of_measure: item.unit_of_measure || 'UND',
      };
    });

    const discount = discount_amount ? Number(discount_amount) : 0;
    const flete = flete_amount ? Number(flete_amount) : 0;
    const otros = otros_amount ? Number(otros_amount) : 0;

    const calculatedTotal = calculatedSubtotal + calculatedTax - discount + flete + otros;
    if (calculatedTotal <= 0) {
      return res.status(400).json({ detail: 'El monto total de la factura debe ser mayor a cero' });
    }
    const invoiceNumber = await generateInvoiceNumber(userId, companyId);

    // Crear factura e items en una sola transacción
    const newInvoice = await prisma.$transaction(async (tx: any) => {
      const inv = await tx.invoice.create({
        data: {
          user_id: userId,
          company_id: companyId,
          client_id: client.id,
          invoice_number: invoiceNumber,
          description: description || 'Factura de venta',
          amount: new Decimal(calculatedTotal),
          subtotal: new Decimal(calculatedSubtotal),
          tax_amount: new Decimal(calculatedTax),
          discount_amount: new Decimal(discount),
          total_amount: new Decimal(calculatedTotal),
          currency: currency || 'DOP',
          status: 'draft',
          due_date: due_date ? new Date(due_date) : undefined,
          notes,
          document_type: document_type || null,
          reference_ncf: reference_ncf || null,
          custom_fields: custom_fields ? JSON.stringify(custom_fields) : null,
        },
      });

      await tx.invoiceItem.createMany({
        data: itemsData.map((item) => ({
          ...item,
          invoice_id: inv.id,
        })),
      });

      return inv;
    });

    await logUsage(userId, 'invoice_created', { revenue: calculatedTotal });
    logInvoiceAction(newInvoice.id, userId, 'created', undefined, 'draft', `Factura creada por $${calculatedTotal}`);

    // Generar NCF automático para comprobantes tradicionales (B01-B04)
    const company = await prisma.company.findUnique({ where: { id: companyId } });
    if (company && company.invoicing_mode === 'tradicional') {
      let docTypeName = 'Factura de Crédito Fiscal';
      try {
        if (custom_fields && typeof custom_fields === 'object') {
          docTypeName = custom_fields.documento_tipo || docTypeName;
        }
      } catch (_) {}
      const traditionalPrefix = resolveTraditionalType(docTypeName);
      const ncf = await getNextNcfNumber(companyId, traditionalPrefix);
      await prisma.invoice.update({
        where: { id: newInvoice.id },
        data: { ncf, status: 'draft' },
      });
    }

    const finalInvoice = await prisma.invoice.findUnique({ where: { id: newInvoice.id } });
    return res.status(200).json({ id: newInvoice.id, number: newInvoice.invoice_number, ncf: finalInvoice?.ncf || null });
  } catch (error: any) {
    console.error('❌ Error al crear factura con items:', error);
    return res.status(500).json({ detail: error.message });
  }
}

export async function getDashboardData(req: AuthRequest, res: Response) {
  if (!req.user) {
    return res.status(401).json({ detail: 'No autorizado' });
  }

  const { period } = req.query; // month, quarter, year
  const periodType = period || 'month';

  try {
    const endDate = new Date();
    const startDate = new Date();

    if (periodType === 'month') {
      startDate.setDate(endDate.getDate() - 30);
    } else if (periodType === 'quarter') {
      startDate.setDate(endDate.getDate() - 90);
    } else {
      startDate.setDate(endDate.getDate() - 365);
    }

    // Consultar facturas del periodo
    const invoices = await prisma.invoice.findMany({
      where: {
        company_id: req.user.company_id || undefined,
        created_at: { gte: startDate },
      },
      include: {
        items: true,
        client: true,
      },
    });

    // Filtrar por modalidad (solo facturas que correspondan al modo de facturación)
    let filteredInvoices = invoices;
    if (!req.user.is_super_admin) {
      const company = await prisma.company.findUnique({ where: { id: req.user.company_id } });
      const mode = company?.invoicing_mode || 'electronica';
      if (mode !== 'transicion') {
        filteredInvoices = filteredInvoices.filter((inv: any) => {
          if (inv.ncf && inv.ncf.length > 0) {
            if (inv.ncf.startsWith('B')) return mode === 'tradicional';
            if (inv.ncf.startsWith('E')) return mode === 'electronica';
          }
          return true;
        });
      }
    }

    const totalInvoices = filteredInvoices.length;
    const totalAmount = filteredInvoices.reduce((acc: number, inv: { total_amount: any; }) => acc + Number(inv.total_amount), 0);
    const paidInvoices = filteredInvoices.filter((inv: { status: string; }) => inv.status === 'paid').length;

    // Clientes únicos
    const uniqueClientsSet = new Set(filteredInvoices.map((inv: { client: { rnc: any; }; }) => inv.client.rnc));
    const uniqueClients = uniqueClientsSet.size;

    // Productos más vendidos (agrupados en Node.js)
    const productSalesMap: { [name: string]: number } = {};
    filteredInvoices.forEach((inv: { items: any[]; }) => {
      inv.items.forEach((item: { description: any; item_name: any; quantity: any; }) => {
        const name = item.description || item.item_name;
        productSalesMap[name] = (productSalesMap[name] || 0) + Number(item.quantity);
      });
    });

    const topProducts = Object.entries(productSalesMap)
      .map(([name, quantity]) => ({ name, quantity }))
      .sort((a, b) => b.quantity - a.quantity)
      .slice(0, 5);

    // Obtener límites
    const settings = await prisma.companySettings.findFirst({
      where: { user_id: req.user.id },
    });

    const currentPlan = settings ? settings.plan_type : 'starter';
    const invoiceLimit = settings ? settings.monthly_invoice_limit : 50;

    // Uso mensual actual
    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);

    const monthlyInvoices = await prisma.invoice.count({
      where: {
        company_id: req.user.company_id || undefined,
        created_at: { gte: startOfMonth },
      },
    });

    return res.status(200).json({
      period: periodType,
      summary: {
        total_invoices: totalInvoices,
        total_amount: totalAmount,
        paid_invoices: paidInvoices,
        payment_rate: totalInvoices > 0 ? (paidInvoices / totalInvoices) * 100 : 0,
        unique_clients: uniqueClients,
      },
      top_products: topProducts,
      plan_usage: {
        current_plan: currentPlan,
        monthly_invoices: monthlyInvoices,
        invoice_limit: invoiceLimit,
        usage_percentage: invoiceLimit > 0 ? (monthlyInvoices / invoiceLimit) * 100 : 0,
      },
    });
  } catch (error: any) {
    console.error('❌ Error en dashboard:', error);
    return res.status(500).json({ detail: error.message });
  }
}

export async function exportSalesReportToExcel(req: AuthRequest, res: Response) {
  if (!req.user) {
    return res.status(401).json({ detail: 'No autorizado' });
  }

  const { start_date, end_date, document_type, is_credit } = req.query;

  if (!start_date || !end_date) {
    return res.status(400).json({ detail: 'start_date y end_date son requeridos' });
  }

  try {
    const start = new Date(String(start_date));
    const end = new Date(String(end_date));

    const invoices = await prisma.invoice.findMany({
      where: {
        company_id: req.user.company_id || undefined,
        created_at: {
          gte: start,
          lte: end,
        },
      },
      include: {
        client: { select: { name: true, rnc: true } },
        items: true,
      },
      orderBy: { created_at: 'asc' },
    });

    let filteredInvoices = invoices;

    // Filtrar por modalidad
    if (!req.user.is_super_admin) {
      const company = await prisma.company.findUnique({ where: { id: req.user.company_id } });
      const mode = company?.invoicing_mode || 'electronica';
      if (mode !== 'transicion') {
        filteredInvoices = filteredInvoices.filter((inv: any) => {
          if (inv.ncf && inv.ncf.length > 0) {
            if (inv.ncf.startsWith('B')) return mode === 'tradicional';
            if (inv.ncf.startsWith('E')) return mode === 'electronica';
          }
          return true;
        });
      }
    }

    if (document_type) {
      const docTypeStr = String(document_type).toLowerCase();
      filteredInvoices = filteredInvoices.filter((inv: any) => {
        try {
          const custom = inv.custom_fields ? JSON.parse(inv.custom_fields) : {};
          return String(custom.documento_tipo || '').toLowerCase() === docTypeStr;
        } catch { return false; }
      });
    }

    if (is_credit !== undefined && is_credit !== '') {
      const wantCredit = is_credit === 'true' || is_credit === '1';
      filteredInvoices = filteredInvoices.filter((inv: any) => {
        try {
          const custom = inv.custom_fields ? JSON.parse(inv.custom_fields) : {};
          return (custom.facturado_a_credito === true) === wantCredit;
        } catch { return false; }
      });
    }

    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'TonyCom2';
    workbook.created = new Date();
    const ws = workbook.addWorksheet('Reporte Ventas');

    ws.columns = [
      { header: '#', key: 'no', width: 6 },
      { header: 'Factura', key: 'number', width: 16 },
      { header: 'Fecha', key: 'date', width: 14 },
      { header: 'Cliente', key: 'client', width: 30 },
      { header: 'RNC', key: 'rnc', width: 12 },
      { header: 'NCF', key: 'ncf', width: 14 },
      { header: 'Estado', key: 'status', width: 14 },
      { header: 'Monto Total', key: 'total', width: 16 },
      { header: 'ITBIS', key: 'itbis', width: 14 },
      { header: 'Monto Exento', key: 'exento', width: 14 },
      { header: 'Creado por', key: 'createdBy', width: 18 },
    ];

    ws.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
    ws.getRow(1).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF1E40AF' },
    };
    ws.getRow(1).alignment = { horizontal: 'center' };

    let totalAmount = 0;
    let totalItbis = 0;
    let totalExento = 0;

    filteredInvoices.forEach((inv: any, idx: number) => {
      const custom = inv.custom_fields ? JSON.parse(inv.custom_fields) : {};
      const itbis = custom.itpis18 ?? 0;
      const exento = custom.monto_exento ?? 0;
      totalAmount += Number(inv.total_amount);
      totalItbis += Number(itbis);
      totalExento += Number(exento);

      const statusMap: Record<string, string> = {
        draft: 'Borrador', issued: 'Emitida', sent_to_alanube: 'Emitida',
        sent_to_dgii: 'Emitida', paid: 'Pagada', rejected_by_dgii: 'Rechazada',
        voided: 'Cancelada', error: 'Cancelada',
      };
      const row = ws.addRow([
        idx + 1,
        inv.number,
        inv.created_at ? new Date(inv.created_at).toLocaleDateString('es-DO') : '',
        inv.client?.name ?? '',
        inv.client?.rnc ?? '',
        inv.ncf ?? '',
        statusMap[inv.status] ?? inv.status,
        Number(inv.total_amount),
        Number(itbis),
        Number(exento),
        inv.created_by ?? '',
      ]);
      row.alignment = { vertical: 'middle' };
      if (idx % 2 === 0) {
        row.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF0F4FF' } };
      }
    });

    const totalRow = ws.addRow([
      '', 'TOTALES', '', '', '', '', '',
      totalAmount, totalItbis, totalExento, '',
    ]);
    totalRow.font = { bold: true };
    totalRow.eachCell(cell => {
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE2E8F0' } };
    });

    ws.addRow([]);

    // Resumen
    const paidCount = filteredInvoices.filter((i: any) => i.status === 'paid').length;
    ws.addRow(['Resumen']);
    ws.addRow(['Total Facturas', filteredInvoices.length]);
    ws.addRow(['Total Pagadas', paidCount]);
    ws.addRow(['Total Pendientes', filteredInvoices.length - paidCount]);
    ws.addRow(['Monto Total Facturado', totalAmount]);
    ws.addRow(['ITBIS Total', totalItbis]);
    ws.addRow(['Monto Exento Total', totalExento]);

    const fileName = `reporte_ventas_${String(start_date)}_${String(end_date)}.xlsx`;
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    await workbook.xlsx.write(res);
    res.end();
  } catch (error: any) {
    console.error('❌ Error exportando Excel:', error);
    return res.status(500).json({ detail: error.message });
  }
}

export async function getDetailedSalesReport(req: AuthRequest, res: Response) {
  if (!req.user) {
    return res.status(401).json({ detail: 'No autorizado' });
  }

  const { start_date, end_date, document_type, is_credit } = req.query;

  if (!start_date || !end_date) {
    return res.status(400).json({ detail: 'start_date y end_date son requeridos' });
  }

  try {
    const start = new Date(String(start_date));
    const end = new Date(String(end_date));

    // Fetch company info
    const company = req.user.is_super_admin
      ? null
      : await prisma.company.findUnique({ where: { id: req.user.company_id } });

    const invoices = await prisma.invoice.findMany({
      where: {
        company_id: req.user.company_id || undefined,
        created_at: { gte: start, lte: end },
      },
      include: {
        client: { select: { name: true, rnc: true } },
        items: true,
      },
      orderBy: { created_at: 'asc' },
    });

    let filteredInvoices = invoices;

    // Filtrar por modalidad
    if (!req.user.is_super_admin && company) {
      const mode = company.invoicing_mode || 'electronica';
      if (mode !== 'transicion') {
        filteredInvoices = filteredInvoices.filter((inv: any) => {
          if (inv.ncf && inv.ncf.length > 0) {
            if (inv.ncf.startsWith('B')) return mode === 'tradicional';
            if (inv.ncf.startsWith('E')) return mode === 'electronica';
          }
          return true;
        });
      }
    }

    if (document_type) {
      const docTypeStr = String(document_type).toLowerCase();
      filteredInvoices = filteredInvoices.filter((inv: any) => {
        try {
          const custom = inv.custom_fields ? JSON.parse(inv.custom_fields) : {};
          return String(custom.documento_tipo || '').toLowerCase() === docTypeStr;
        } catch { return false; }
      });
    }

    if (is_credit !== undefined && is_credit !== '') {
      const wantCredit = is_credit === 'true' || is_credit === '1';
      filteredInvoices = filteredInvoices.filter((inv: any) => {
        try {
          const custom = inv.custom_fields ? JSON.parse(inv.custom_fields) : {};
          return (custom.facturado_a_credito === true) === wantCredit;
        } catch { return false; }
      });
    }

    const statusMap: Record<string, string> = {
      draft: 'Borrador', issued: 'Emitida', sent_to_alanube: 'Emitida',
      sent_to_dgii: 'Emitida', paid: 'Pagada', rejected_by_dgii: 'Rechazada',
      voided: 'Cancelada', error: 'Cancelada',
    };

    const data = filteredInvoices.map((inv: any, idx: number) => {
      const custom = inv.custom_fields ? JSON.parse(inv.custom_fields) : {};
      return {
        index: idx + 1,
        number: inv.number,
        ncf: inv.ncf ?? '',
        date: inv.created_at ? new Date(inv.created_at).toISOString() : '',
        client_name: inv.client?.name ?? '',
        client_rnc: inv.client?.rnc ?? '',
        status: statusMap[inv.status] ?? inv.status,
        status_raw: inv.status,
        total_amount: Number(inv.total_amount),
        itbis: Number(custom.itpis18 ?? 0),
        exento: Number(custom.monto_exento ?? 0),
        created_by: inv.created_by ?? '',
      };
    });

    const totalAmount = data.reduce((sum: number, inv: any) => sum + inv.total_amount, 0);
    const totalItbis = data.reduce((sum: number, inv: any) => sum + inv.itbis, 0);
    const totalExento = data.reduce((sum: number, inv: any) => sum + inv.exento, 0);
    const paidCount = data.filter((inv: any) => inv.status_raw === 'paid').length;

    return res.status(200).json({
      company: company ? {
        name: company.name,
        rnc: company.rnc,
        invoicing_mode: company.invoicing_mode,
      } : null,
      period: {
        start_date: String(start_date),
        end_date: String(end_date),
      },
      summary: {
        total_invoices: data.length,
        paid_invoices: paidCount,
        pending_invoices: data.length - paidCount,
        total_amount: totalAmount,
        total_itbis: totalItbis,
        total_exento: totalExento,
      },
      data,
    });
  } catch (error: any) {
    console.error('❌ Error en reporte detallado:', error);
    return res.status(500).json({ detail: error.message });
  }
}

export async function getSalesReport(req: AuthRequest, res: Response) {
  if (!req.user) {
    return res.status(401).json({ detail: 'No autorizado' });
  }

  const { start_date, end_date, group_by, document_type, is_credit } = req.query;

  if (!start_date || !end_date) {
    return res.status(400).json({ detail: 'start_date y end_date son requeridos' });
  }

  const groupBy = group_by || 'day';

  try {
    const start = new Date(String(start_date));
    const end = new Date(String(end_date));

    const invoices = await prisma.invoice.findMany({
      where: {
        company_id: req.user.company_id || undefined,
        created_at: {
          gte: start,
          lte: end,
        },
      },
    });

    // Filtrar por modalidad (solo facturas que correspondan al modo de facturación)
    let filteredInvoices = invoices;

    if (!req.user.is_super_admin) {
      const company = await prisma.company.findUnique({ where: { id: req.user.company_id } });
      const mode = company?.invoicing_mode || 'electronica';
      if (mode !== 'transicion') {
        filteredInvoices = filteredInvoices.filter((inv: any) => {
          if (inv.ncf && inv.ncf.length > 0) {
            if (inv.ncf.startsWith('B')) return mode === 'tradicional';
            if (inv.ncf.startsWith('E')) return mode === 'electronica';
          }
          return true;
        });
      }
    }

    if (document_type) {
      const docTypeStr = String(document_type).toLowerCase();
      filteredInvoices = filteredInvoices.filter((inv: any) => {
        try {
          const custom = inv.custom_fields ? JSON.parse(inv.custom_fields) : {};
          return String(custom.documento_tipo || '').toLowerCase() === docTypeStr;
        } catch (e) {
          return false;
        }
      });
    }

    if (is_credit !== undefined && is_credit !== '') {
      const wantCredit = is_credit === 'true' || is_credit === '1';
      filteredInvoices = filteredInvoices.filter((inv: any) => {
        try {
          const custom = inv.custom_fields ? JSON.parse(inv.custom_fields) : {};
          const isCred = custom.facturado_a_credito === true;
          return isCred === wantCredit;
        } catch (e) {
          return false;
        }
      });
    }

    // Agrupar en Javascript
    const groups: { [key: string]: { count: number; total: number; paid: number } } = {};

    filteredInvoices.forEach((inv: { created_at: any; total_amount: any; status: string; }) => {
      let key = '';
      const date = inv.created_at;

      if (groupBy === 'day') {
        key = date.toISOString().split('T')[0];
      } else if (groupBy === 'month') {
        key = date.toISOString().substring(0, 7); // yyyy-MM
      } else {
        // week: calcular número de semana
        const oneJan = new Date(date.getFullYear(), 0, 1);
        const numberOfDays = Math.floor((date.getTime() - oneJan.getTime()) / (24 * 60 * 60 * 1000));
        const week = Math.ceil((date.getDay() + 1 + numberOfDays) / 7);
        key = `${date.getFullYear()}-W${week.toString().padStart(2, '0')}`;
      }

      if (!groups[key]) {
        groups[key] = { count: 0, total: 0, paid: 0 };
      }

      groups[key].count += 1;
      groups[key].total += Number(inv.total_amount);
      if (inv.status === 'paid') {
        groups[key].paid += Number(inv.total_amount);
      }
    });

    const data = Object.entries(groups)
      .map(([period, stats]) => ({
        period,
        invoice_count: stats.count,
        total_amount: stats.total,
        paid_amount: stats.paid,
        collection_rate: stats.total > 0 ? (stats.paid / stats.total) * 100 : 0,
      }))
      .sort((a, b) => a.period.localeCompare(b.period));

    return res.status(200).json({
      period: groupBy,
      data,
    });
  } catch (error: any) {
    console.error('❌ Error en reporte de ventas:', error);
    return res.status(500).json({ detail: error.message });
  }
}
