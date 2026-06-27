import { Request, Response } from 'express';
import { AuthRequest } from '../middlewares/auth';
import prisma from '../models/db';
import * as gaeService from '../services/gae.service';
import { getNextNcfNumber } from '../services/ncf.service';
import { getTypeInfo, resolveType } from '../services/alanube.service';
import { generateInvoiceNumber } from './commercial.controller';

function findValueByKeys(source: any, keys: string[]): string {
  if (!source || typeof source !== 'object') return '';
  for (const [key, value] of Object.entries(source)) {
    if (keys.includes(key.toLowerCase()) && value !== null && value !== undefined) {
      const text = String(value).trim();
      if (text) return text;
    }
  }
  for (const value of Object.values(source)) {
    if (value && typeof value === 'object') {
      const found = findValueByKeys(value, keys);
      if (found) return found;
    }
  }
  return '';
}

function findEcf(source: any): string {
  const direct = findValueByKeys(source, ['ecf', 'documentnumber', 'ncf', 'encf', 'e-ncf', 'enumber', 'generatedencf', 'submittedencf']);
  if (direct) return direct.toUpperCase();
  const serialized = JSON.stringify(source || {});
  const match = serialized.match(/\bE(?:31|32|33|34|41|43|44|45|46|47)\d{10}\b/i);
  return match ? match[0].toUpperCase() : '';
}

function findGaeQrUrl(source: any): string {
  return findValueByKeys(source, ['qrurl', 'qr_url', 'ecfurl', 'url', 'pdfurl', 'pdf_url']);
}

export async function ecoCheck(req: AuthRequest, res: Response) {
  if (!req.user) {
    return res.status(401).json({ detail: 'No autorizado' });
  }

  try {
    const result = await gaeService.ecoCheck();
    return res.status(result.success ? 200 : 502).json(result);
  } catch (error: any) {
    return res.status(500).json({ detail: error.message });
  }
}

export async function getCompanyInfo(req: AuthRequest, res: Response) {
  if (!req.user) {
    return res.status(401).json({ detail: 'No autorizado' });
  }

  try {
    const company = await prisma.company.findUnique({
      where: { id: req.user.company_id },
    });

    if (!company) {
      return res.status(404).json({ detail: 'Empresa no encontrada' });
    }

    return res.status(200).json({
      gae_company_id: company.gae_company_id,
      gae_seller_code: company.gae_seller_code,
      gae_environment: company.gae_environment,
      fiscal_provider: company.fiscal_provider,
      certificate_name: company.certificate_name,
      certificate_expiry: company.certificate_expiry,
    });
  } catch (error: any) {
    return res.status(500).json({ detail: error.message });
  }
}

export async function configureCompany(req: AuthRequest, res: Response) {
  if (!req.user) {
    return res.status(401).json({ detail: 'No autorizado' });
  }

  const { gae_company_id, seller_code, environment, certificate_name, certificate_content, certificate_password } = req.body;

  try {
    const company = await prisma.company.findUnique({
      where: { id: req.user.company_id },
    });

    if (!company) {
      return res.status(404).json({ detail: 'Empresa no encontrada' });
    }

    await prisma.company.update({
      where: { id: req.user.company_id },
      data: {
        gae_company_id: gae_company_id || company.gae_company_id,
        gae_seller_code: seller_code !== undefined ? seller_code : company.gae_seller_code,
        gae_environment: environment || company.gae_environment || 'Test',
        certificate_name: certificate_name || company.certificate_name,
        certificate_content: certificate_content || undefined,
        certificate_password: certificate_password || undefined,
        fiscal_provider: 'gae',
      },
    });

    return res.status(200).json({
      message: 'Configuración de GAE guardada exitosamente',
      gae_company_id: gae_company_id || company.gae_company_id,
    });
  } catch (error: any) {
    return res.status(500).json({ detail: `Error al configurar GAE: ${error.message}` });
  }
}

export async function updateCompany(req: AuthRequest, res: Response) {
  if (!req.user) {
    return res.status(401).json({ detail: 'No autorizado' });
  }

  const { gae_company_id, seller_code, environment, certificate_name, certificate_content, certificate_password, fiscal_provider } = req.body;

  try {
    const company = await prisma.company.findUnique({
      where: { id: req.user.company_id },
    });

    if (!company) {
      return res.status(404).json({ detail: 'Empresa no encontrada' });
    }

    const data: any = {};
    if (gae_company_id !== undefined) data.gae_company_id = gae_company_id;
    if (seller_code !== undefined) data.gae_seller_code = seller_code;
    if (environment !== undefined) data.gae_environment = environment;
    if (certificate_name !== undefined) data.certificate_name = certificate_name;
    if (certificate_content !== undefined) data.certificate_content = certificate_content;
    if (certificate_password !== undefined) data.certificate_password = certificate_password;
    if (fiscal_provider !== undefined) data.fiscal_provider = fiscal_provider;

    await prisma.company.update({
      where: { id: req.user.company_id },
      data,
    });

    return res.status(200).json({
      message: 'Configuración de GAE actualizada exitosamente',
    });
  } catch (error: any) {
    return res.status(500).json({ detail: `Error al actualizar GAE: ${error.message}` });
  }
}

export async function deleteCompany(req: AuthRequest, res: Response) {
  if (!req.user) {
    return res.status(401).json({ detail: 'No autorizado' });
  }

  try {
    const company = await prisma.company.findUnique({
      where: { id: req.user.company_id },
    });

    if (!company) {
      return res.status(404).json({ detail: 'Empresa no encontrada' });
    }

    await prisma.company.update({
      where: { id: req.user.company_id },
      data: {
        gae_company_id: null,
        gae_seller_code: null as any,
        gae_environment: 'Test',
        certificate_name: null as any,
        certificate_content: null as any,
        certificate_password: null as any,
        fiscal_provider: 'alanube',
      },
    });

    return res.status(200).json({
      message: 'Configuración de GAE eliminada exitosamente',
    });
  } catch (error: any) {
    return res.status(500).json({ detail: `Error al eliminar configuración GAE: ${error.message}` });
  }
}

export async function createInvoice(req: AuthRequest, res: Response) {
  if (!req.user) {
    return res.status(401).json({ detail: 'No autorizado' });
  }

  try {
    const company = await prisma.company.findUnique({
      where: { id: req.user.company_id },
    });

    if (!company || !company.gae_company_id) {
      return res.status(400).json({ detail: 'GAE no está configurado para esta empresa' });
    }

    const { buyerRnc, buyerBusinessName, issueDate, invoiceTotalAmount, totalTaxedAmount, description } = req.body;

    if (!buyerRnc || !buyerBusinessName) {
      return res.status(400).json({ detail: 'buyerRnc y buyerBusinessName son requeridos' });
    }

    // Generar NCF
    const encfNumber = await getNextNcfNumber(req.user.company_id, getTypeInfo('E32').prefix);

    // Buscar o crear cliente por RNC
    let client = await prisma.client.findFirst({
      where: { rnc: buyerRnc.trim(), company_id: req.user.is_super_admin ? undefined : req.user.company_id },
    });
    if (!client) {
      client = await prisma.client.create({
        data: {
          user_id: req.user.id,
          company_id: req.user.company_id,
          name: buyerBusinessName.trim(),
          rnc: buyerRnc.trim(),
          address: req.body.buyerAddress || '',
        },
      });
    }

    // Crear factura en DB
    const invoiceNumber = await generateInvoiceNumber(req.user.id, req.user.company_id);
    const amount = Number(invoiceTotalAmount) || 0;
    const invoice = await prisma.invoice.create({
      data: {
        user_id: req.user.id,
        company_id: req.user.company_id,
        client_id: client.id,
        invoice_number: invoiceNumber,
        description: description || `Factura GAE - ${buyerBusinessName}`,
        amount: amount,
        subtotal: Number(totalTaxedAmount) || amount,
        tax_amount: 0.0,
        discount_amount: 0.0,
        total_amount: amount,
        currency: 'DOP',
        status: 'draft',
        custom_fields: JSON.stringify({ documento_tipo: 'Factura de Consumo' }),
      },
    });

    // Construir payload GAE con el NCF generado
    const gaePayload: any = {
      ecf: encfNumber,
      ecfType: 'E32',
      sellerRnc: company.rnc,
      sellerCode: company.gae_seller_code || undefined,
      Enviroment: company.gae_environment || 'Test',
      buyerRnc: buyerRnc.trim(),
      buyerBusinessName: buyerBusinessName.trim(),
      buyerAddress: req.body.buyerAddress || client.address || '',
      issueDate: issueDate || new Date().toISOString().split('T')[0],
      InvoiceTotalAmount: amount,
      TotalTaxedAmount: Number(totalTaxedAmount) || amount,
      incomeType: '01',
      currencyType: 'DOP',
      items: req.body.items || [{
        lineNumber: 1,
        itemDescription: description || 'Servicio',
        serviceInd: '2',
        itemQuantity: 1,
        unitMeasure: 'UND',
        unitPrice: amount,
        itemAmount: amount,
        TaxTypes: 1,
      }],
    };

    const result = await gaeService.createGaeInvoice(gaePayload);
    const ecf = findEcf(result) || encfNumber;
    const qrUrl = findGaeQrUrl(result);

    const currentCustom = JSON.parse(invoice.custom_fields || '{}');
    const updatedCustom = {
      ...currentCustom,
      ncf_comprobante: ecf,
      qr_url: qrUrl || '',
      gae_response: result,
      gae_error: undefined,
    };

    await prisma.invoice.update({
      where: { id: invoice.id },
      data: {
        status: 'sent_to_alanube',
        ncf: ecf,
        custom_fields: JSON.stringify(updatedCustom),
      },
    });

    return res.status(200).json({
      success: true,
      message: `Factura creada exitosamente. ECF: ${ecf}`,
      data: {
        id: invoice.id,
        invoice_number: invoiceNumber,
        ecf,
        qr_url: qrUrl || '',
        client: buyerBusinessName,
        amount,
      },
    });
  } catch (error: any) {
    const errMsg = error.response ? JSON.stringify(error.response.data) : error.message;
    return res.status(error.response?.status || 500).json({
      detail: `Error de GAE: ${errMsg}`,
    });
  }
}

export async function transmitInvoice(req: AuthRequest, res: Response) {
  if (!req.user) {
    return res.status(401).json({ detail: 'No autorizado' });
  }

  const invoiceId = parseInt(req.params.invoice_id, 10);
  if (isNaN(invoiceId)) return res.status(400).json({ detail: 'ID de factura inválido' });

  try {
    const invoice = await prisma.invoice.findFirst({
      where: { id: invoiceId, company_id: req.user.is_super_admin ? undefined : req.user.company_id },
      include: { client: true, items: true },
    });

    if (!invoice) return res.status(404).json({ detail: 'Factura no encontrada' });
    if (invoice.ncf) {
      return res.status(400).json({ detail: 'Esta factura ya fue emitida fiscalmente. NCF: ' + invoice.ncf });
    }

    const company = await prisma.company.findUnique({
      where: { id: req.user.company_id },
    });
    if (!company || !company.gae_company_id) {
      return res.status(400).json({ detail: 'GAE no está configurado para esta empresa' });
    }

    const client = invoice.client;
    if (!client.rnc || client.rnc.trim() === '') {
      return res.status(400).json({ detail: `El cliente '${client.name}' no tiene un RNC configurado.` });
    }

    // Resolver tipo de documento
    let docType = 'E32';
    try {
      if (invoice.custom_fields) {
        const parsed = JSON.parse(invoice.custom_fields);
        if (parsed.documento_tipo) {
          const resolved = resolveType(parsed.documento_tipo);
          // Asegurar prefijo E para GAE
          docType = resolved.startsWith('E') ? resolved : 'E' + resolved;
        }
      }
    } catch (_) { }

    // Generar NCF
    const encfNumber = await getNextNcfNumber(req.user.company_id, docType);

    // Cálculos de montos detallados
    let totalTaxedAmount = 0;
    let totalExemptAmount = 0;
    const gaeItems = (invoice.items || []).map((item, index) => {
      const subtotal = Number(item.subtotal);
      const taxRate = Number(item.tax_percentage);
      const isTaxed = taxRate > 0;

      if (isTaxed) {
        totalTaxedAmount += subtotal;
      } else {
        totalExemptAmount += subtotal;
      }

      return {
        lineNumber: index + 1,
        itemDescription: item.description || item.item_name || 'Artículo',
        serviceInd: String(item.good_service_indicator || '2'),
        itemQuantity: Number(item.quantity),
        unitMeasure: item.unit_of_measure || 'UND',
        unitPrice: Number(item.unit_price),
        itemAmount: subtotal,
        TaxTypes: isTaxed ? 1 : 0, // 1 = ITBIS (18%), 0 = Exento
      };
    });

    // Fallback si no hay ítems
    if (gaeItems.length === 0) {
      const subtotal = Number(invoice.subtotal);
      const taxAmount = Number(invoice.tax_amount);
      if (taxAmount > 0) {
        totalTaxedAmount = subtotal;
      } else {
        totalExemptAmount = subtotal;
      }
      gaeItems.push({
        lineNumber: 1,
        itemDescription: invoice.description || 'Factura de venta',
        serviceInd: '2',
        itemQuantity: 1,
        unitMeasure: 'UND',
        unitPrice: subtotal,
        itemAmount: subtotal,
        TaxTypes: taxAmount > 0 ? 1 : 0,
      });
    }

    // Construir payload GAE
    const gaePayload: any = {
      ecf: encfNumber,
      ecfType: docType,
      sellerRnc: company.rnc,
      sellerCode: company.gae_seller_code || undefined,
      Enviroment: company.gae_environment || 'Test',
      buyerRnc: client.rnc.trim(),
      buyerBusinessName: client.name,
      buyerAddress: client.address || '',
      issueDate: new Date().toISOString().split('T')[0],
      InvoiceTotalAmount: Number(invoice.total_amount),
      TotalTaxedAmount: totalTaxedAmount,
      incomeType: '01',
      currencyType: 'DOP',
      items: gaeItems,
    };

    // Agregar TotalExemptAmount si existe monto exento
    if (totalExemptAmount > 0) {
      gaePayload.TotalExemptAmount = totalExemptAmount;
    }

    // Campos específicos para Nota de Crédito (E34)
    if (docType === 'E34') {
      gaePayload.creditNoteInd = 1;
      gaePayload.modifiedNcf = invoice.reference_ncf || '';
      gaePayload.rncNcfModified = company.rnc;
      gaePayload.modifDateNcf = new Date().toISOString().split('T')[0]; // Idealmente la fecha de la original
      gaePayload.modifReasonId = 1; // 1 = Anulación de factura
    }

    const result = await gaeService.createGaeInvoice(gaePayload);
    const ecf = findEcf(result) || encfNumber;
    const qrUrl = findGaeQrUrl(result);

    const currentCustom = JSON.parse(invoice.custom_fields || '{}');
    const updatedCustom = {
      ...currentCustom,
      ncf_comprobante: ecf,
      qr_url: qrUrl || '',
      gae_response: result,
      reference_nc: invoice.reference_ncf, // Asegurar persistencia de referencia
    };

    await prisma.invoice.update({
      where: { id: invoice.id },
      data: {
        status: 'sent_to_alanube',
        ncf: ecf,
        custom_fields: JSON.stringify(updatedCustom),
      },
    });

    return res.status(200).json({
      success: true,
      message: `Factura emitida exitosamente. ECF: ${ecf}`,
      data: {
        id: invoice.id,
        invoice_number: invoice.invoice_number,
        ecf,
        qr_url: qrUrl || '',
        client: client.name,
        amount: Number(invoice.total_amount),
      },
    });
  } catch (error: any) {
    const errMsg = error.response ? JSON.stringify(error.response.data) : error.message;
    return res.status(error.response?.status || 500).json({
      detail: `Error de GAE: ${errMsg}`,
    });
  }
}

export async function getInvoiceInfo(req: AuthRequest, res: Response) {
  if (!req.user) {
    return res.status(401).json({ detail: 'No autorizado' });
  }

  const { rnc, ecf } = req.query;

  if (!rnc || !ecf) {
    return res.status(400).json({ detail: 'rnc y ecf son requeridos' });
  }

  try {
    const result = await gaeService.getInvoiceInfo(rnc as string, ecf as string);
    return res.status(200).json(result);
  } catch (error: any) {
    const errMsg = error.response ? JSON.stringify(error.response.data) : error.message;
    return res.status(error.response?.status || 500).json({ detail: `Error de GAE: ${errMsg}` });
  }
}

export async function getInvoiceStatus(req: AuthRequest, res: Response) {
  if (!req.user) {
    return res.status(401).json({ detail: 'No autorizado' });
  }

  const { rnc, ecf } = req.query;

  if (!rnc || !ecf) {
    return res.status(400).json({ detail: 'rnc y ecf son requeridos' });
  }

  try {
    const result = await gaeService.getInvoiceStatus(rnc as string, ecf as string);
    return res.status(200).json(result);
  } catch (error: any) {
    const errMsg = error.response ? JSON.stringify(error.response.data) : error.message;
    return res.status(error.response?.status || 500).json({ detail: `Error de GAE: ${errMsg}` });
  }
}

export async function signFile(req: AuthRequest, res: Response) {
  if (!req.user) return res.status(401).json({ detail: 'No autorizado' });

  const { rnc } = req.body;
  if (!rnc) return res.status(400).json({ detail: 'rnc es requerido' });
  if (!req.file) return res.status(400).json({ detail: 'Archivo (file) es requerido' });

  try {
    const result = await gaeService.signFile(rnc, req.file.buffer, req.file.originalname);
    return res.status(200).json(result);
  } catch (error: any) {
    const errMsg = error.response ? JSON.stringify(error.response.data) : error.message;
    return res.status(error.response?.status || 500).json({ detail: `Error de GAE: ${errMsg}` });
  }
}

export async function createCommercialApproval(req: AuthRequest, res: Response) {
  if (!req.user) return res.status(401).json({ detail: 'No autorizado' });

  const { ecf, approved, buyerRnc, invoiceDocumentId, xmlFile } = req.body;
  if (!ecf || approved === undefined || !buyerRnc || !invoiceDocumentId) {
    return res.status(400).json({ detail: 'ecf, approved, buyerRnc e invoiceDocumentId son requeridos' });
  }

  try {
    const result = await gaeService.createCommercialApproval({ xmlFile, ecf, approved, buyerRnc, invoiceDocumentId });
    return res.status(200).json(result);
  } catch (error: any) {
    const errMsg = error.response ? JSON.stringify(error.response.data) : error.message;
    return res.status(error.response?.status || 500).json({ detail: `Error de GAE: ${errMsg}` });
  }
}

export async function getApprovalCommercialInfo(req: AuthRequest, res: Response) {
  if (!req.user) return res.status(401).json({ detail: 'No autorizado' });

  const { rnc, ecf } = req.query;
  if (!rnc || !ecf) return res.status(400).json({ detail: 'rnc y ecf son requeridos' });

  try {
    const result = await gaeService.getApprovalCommercialInfo(rnc as string, ecf as string);
    return res.status(200).json(result);
  } catch (error: any) {
    const errMsg = error.response ? JSON.stringify(error.response.data) : error.message;
    return res.status(error.response?.status || 500).json({ detail: `Error de GAE: ${errMsg}` });
  }
}
