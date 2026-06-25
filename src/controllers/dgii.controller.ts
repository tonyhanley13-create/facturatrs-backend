import { Response } from 'express';
import { AuthRequest } from '../middlewares/auth';
import prisma from '../models/db';
import * as dgiiService from '../services/dgii.service';
import { saveInvoiceFile } from '../services/storage.service';
import { getNcfSequences, saveNcfSequences, getDefaultSequences, buildEncfNumber, getTypeInfo, resolveType } from '../services/alanube.service';
import { generateInvoiceNumber } from './commercial.controller';

export async function testConnection(req: AuthRequest, res: Response) {
  if (!req.user) return res.status(401).json({ detail: 'No autorizado' });
  try {
    const company = await prisma.company.findUnique({ where: { id: req.user.company_id } });
    const result = await dgiiService.authenticateOnly(req.user.company_id, company?.dgii_environment);
    return res.status(result.success ? 200 : 400).json(result);
  } catch (error: any) {
    return res.status(500).json({ success: false, message: `Error: ${error.message}` });
  }
}

export async function getCompanyInfo(req: AuthRequest, res: Response) {
  if (!req.user) return res.status(401).json({ detail: 'No autorizado' });
  try {
    const company = await prisma.company.findUnique({ where: { id: req.user.company_id } });
    if (!company) return res.status(404).json({ detail: 'Empresa no encontrada' });
    return res.status(200).json({
      rnc: company.rnc,
      name: company.name,
      address: company.address,
      email: company.email,
      phone: company.phone,
      dgii_environment: company.dgii_environment,
      certificate_name: company.certificate_name,
      certificate_expiry: company.certificate_expiry,
      fiscal_provider: company.fiscal_provider,
    });
  } catch (error: any) {
    return res.status(500).json({ detail: error.message });
  }
}

export async function configureCompany(req: AuthRequest, res: Response) {
  if (!req.user) return res.status(401).json({ detail: 'No autorizado' });
  const { certificate_name, certificate_content, certificate_password, environment } = req.body;
  try {
    const company = await prisma.company.findUnique({ where: { id: req.user.company_id } });
    if (!company) return res.status(404).json({ detail: 'Empresa no encontrada' });

    let certificateExpiry: Date | null = null;
    if (certificate_content && certificate_password) {
      try {
        const { P12Reader } = require('dgii-ecf');
        const reader = new P12Reader(certificate_password);
        const info = reader.getCertificateInfoFromBase64(certificate_content);
        if (info?.validTo) {
          certificateExpiry = new Date(info.validTo);
        }
      } catch (_) { }
    }

    await prisma.company.update({
      where: { id: req.user.company_id },
      data: {
        certificate_name: certificate_name !== undefined ? certificate_name : company.certificate_name,
        certificate_content: certificate_content !== undefined ? certificate_content : company.certificate_content,
        certificate_password: certificate_password !== undefined ? certificate_password : company.certificate_password,
        certificate_expiry: certificateExpiry,
        dgii_environment: environment || company.dgii_environment || 'Test',
        fiscal_provider: certificate_content ? 'dgii' : company.fiscal_provider,
      },
    });

    const warnings: string[] = [];
    if (certificateExpiry) {
      const daysUntilExpiry = Math.floor((certificateExpiry.getTime() - Date.now()) / 86400000);
      if (daysUntilExpiry < 0) {
        warnings.push('El certificado digital está VENCIDO.');
      } else if (daysUntilExpiry < 30) {
        warnings.push(`El certificado digital vence en ${daysUntilExpiry} días.`);
      }
    }

    return res.status(200).json({
      success: true,
      message: 'Configuración DGII guardada exitosamente',
      certificate_expiry: certificateExpiry,
      warnings,
    });
  } catch (error: any) {
    return res.status(500).json({ detail: `Error al configurar DGII: ${error.message}` });
  }
}

export async function createInvoice(req: AuthRequest, res: Response) {
  if (!req.user) return res.status(401).json({ detail: 'No autorizado' });
  const { client_id, description, amount, document_type, reference_ncf, modification_code } = req.body;
  if (!client_id || !description || amount === undefined) {
    return res.status(400).json({ detail: 'client_id, description y amount son requeridos' });
  }
  if (Number(amount) <= 0) {
    return res.status(400).json({ detail: 'El monto de la factura debe ser mayor a cero' });
  }
  try {
    const company = await prisma.company.findUnique({ where: { id: req.user.company_id } });
    if (!company) return res.status(404).json({ detail: 'Empresa no encontrada' });
    if (!company.certificate_content) {
      return res.status(400).json({ detail: 'Certificado DGII no configurado. Configure el certificado primero.' });
    }
    const client = await prisma.client.findFirst({
      where: { id: Number(client_id), company_id: req.user.is_super_admin ? undefined : req.user.company_id },
    });
    if (!client) return res.status(404).json({ detail: 'Cliente no encontrado' });
    if (!client.rnc || client.rnc.trim() === '') {
      return res.status(400).json({ detail: `El cliente '${client.name}' no tiene RNC configurado.` });
    }
    const invoiceNumber = await generateInvoiceNumber(req.user.id, req.user.company_id);
    const invoice = await prisma.invoice.create({
      data: {
        user_id: req.user.id, company_id: req.user.company_id, client_id: client.id, invoice_number: invoiceNumber,
        description, amount: Number(amount), subtotal: Number(amount), tax_amount: 0.0, discount_amount: 0.0,
        total_amount: Number(amount), currency: 'DOP', status: 'draft',
        custom_fields: JSON.stringify({
          documento_tipo: document_type || 'Factura de Consumo',
          ...(reference_ncf ? { reference_ncf, modification_code: modification_code || '3' } : {}),
        }),
      },
    });
    const typeInfo = getTypeInfo(document_type);
    const sequences = await getNcfSequences(req.user.id, req.user.company_id);
    const resolved = sequences.length > 0 ? sequences : getDefaultSequences();
    const { encfNumber, updatedSequences } = buildEncfNumber(resolved, typeInfo.prefix);
    await saveNcfSequences(updatedSequences, req.user.company_id, req.user.id);
    const ecfType = parseInt(encfNumber.substring(1, 3), 10);
    const result = await dgiiService.sendInvoice(
      req.user.company_id, invoice.id, encfNumber, company.rnc, client.rnc, Number(amount), company.dgii_environment,
      typeInfo.prefix, reference_ncf, modification_code,
    );
    // Guardar archivos (local + cloud)
    saveInvoiceFile(req.user.company_id, invoice.id, 'signed_xml', result.signedXml).catch(() => {});
    const todayStr = result.firmaFecha.substring(0, 10);
    const qrUrl = dgiiService.generateQR(
      ecfType,
      company.rnc,
      client.rnc,
      encfNumber,
      Number(amount),
      todayStr,
      result.firmaFecha,
      result.securityCode,
      company.dgii_environment || 'Test',
    );

    // Consultar estado real en DGII (la respuesta inicial suele venir vacía)
    let dgiiEstado = result.estado;
    let dgiiCodigo = result.codigo;
    let dgiiMensajes = result.mensajes;
    if (result.trackId && dgiiEstado !== 'Aceptado' && dgiiEstado !== 'Aceptado Condicional') {
      try {
        await new Promise(r => setTimeout(r, 3000));
        const statusResult = await dgiiService.checkStatus(result.trackId, req.user.company_id, company.dgii_environment);
        dgiiEstado = statusResult?.estado || dgiiEstado;
        dgiiCodigo = statusResult?.codigo || dgiiCodigo;
        dgiiMensajes = statusResult?.mensajes || dgiiMensajes;
      } catch (_) {}
    }

    const currentCustom = JSON.parse(invoice.custom_fields || '{}');
    const updatedCustom = {
      ...currentCustom,
      ncf_comprobante: encfNumber,
      qr_url: qrUrl,
      security_code: result.securityCode,
      track_id: result.trackId,
      signed_xml: result.signedXml,
      dgii_response: { trackId: result.trackId, estado: dgiiEstado, codigo: dgiiCodigo, mensajes: dgiiMensajes },
    };
    const tieneTrackId = !!result.trackId;
    const isApproved = dgiiEstado === 'Aceptado' || dgiiEstado === 'Aceptado Condicional';
    const isPending = tieneTrackId && !isApproved && (!dgiiEstado || dgiiEstado === 'En proceso' || dgiiEstado === 'Recibado');
    const finalStatus = isApproved ? 'sent_to_dgii' : isPending ? 'sent_to_dgii' : 'rejected_by_dgii';
    const finalDgiiStatus = isApproved ? 'sent' : isPending ? 'pending' : 'rejected';
    await prisma.invoice.update({
      where: { id: invoice.id },
      data: {
        status: finalStatus,
        ncf: encfNumber,
        dgii_track_id: result.trackId,
        dgii_security_code: result.securityCode,
        dgii_signed_xml: result.signedXml,
        dgii_status: finalDgiiStatus,
        dgii_contingency: false,
        dgii_error: null,
        custom_fields: JSON.stringify(updatedCustom),
      },
    });
    const msg = isApproved
      ? `Factura aprobada por DGII. e-CF: ${encfNumber}`
      : isPending
        ? `Factura enviada a DGII, pendiente de aprobación. e-CF: ${encfNumber}`
        : `Factura rechazada por DGII. e-CF: ${encfNumber}`;
    return res.status(isApproved ? 200 : 202).json({
      success: isApproved || isPending, message: msg,
      data: { id: invoice.id, invoice_number: invoiceNumber, ncf: encfNumber, qr_url: qrUrl, track_id: result.trackId, client: client.name, estado: dgiiEstado, mensajes: dgiiMensajes },
    });
  } catch (error: any) {
    return res.status(202).json({
      success: false, contingency: true,
      message: `DGII no disponible. Factura guardada en contingencia: ${error.message}`,
    });
  }
}

export async function transmitInvoice(req: AuthRequest, res: Response) {
  if (!req.user) return res.status(401).json({ detail: 'No autorizado' });
  const invoiceId = parseInt(req.params.invoice_id, 10);
  if (isNaN(invoiceId)) return res.status(400).json({ detail: 'ID de factura inválido' });
  try {
    const invoice = await prisma.invoice.findFirst({
      where: { id: invoiceId, company_id: req.user.is_super_admin ? undefined : req.user.company_id },
      include: { client: true },
    });
    if (!invoice) return res.status(404).json({ detail: 'Factura no encontrada' });
    if (Number(invoice.total_amount) <= 0) {
      return res.status(400).json({ detail: 'No se puede transmitir una factura con monto cero o negativo' });
    }
    if (invoice.ncf) {
      return res.status(400).json({ detail: 'Esta factura ya fue emitida. NCF: ' + invoice.ncf });
    }
    const company = await prisma.company.findUnique({ where: { id: req.user.company_id } });
    if (!company) return res.status(404).json({ detail: 'Empresa no encontrada' });
    if (!company.certificate_content) {
      return res.status(400).json({ detail: 'Certificado DGII no configurado.' });
    }
    const client = invoice.client;
    if (!client.rnc || client.rnc.trim() === '') {
      return res.status(400).json({ detail: `El cliente '${client.name}' no tiene RNC configurado.` });
    }
    let docType = 'E32';
    let referenceNcf: string | undefined;
    let modificationCode: string | undefined;
    try {
      if (invoice.custom_fields) {
        const parsed = JSON.parse(invoice.custom_fields);
        if (parsed.documento_tipo) docType = resolveType(parsed.documento_tipo);
        if (parsed.reference_ncf) referenceNcf = parsed.reference_ncf;
        if (parsed.modification_code) modificationCode = parsed.modification_code;
      }
    } catch (_) { }
    const sequences = await getNcfSequences(req.user.id, req.user.company_id);
    const resolved = sequences.length > 0 ? sequences : getDefaultSequences();
    const { encfNumber, updatedSequences } = buildEncfNumber(resolved, docType);
    await saveNcfSequences(updatedSequences, req.user.company_id, req.user.id);
    const amount = Number(invoice.total_amount);
    const ecfType = parseInt(encfNumber.substring(1, 3), 10);
    const result = await dgiiService.sendInvoice(
      req.user.company_id, invoice.id, encfNumber, company.rnc, client.rnc, amount, company.dgii_environment,
      docType, referenceNcf, modificationCode,
    );
    // Guardar archivos (local + cloud)
    saveInvoiceFile(req.user.company_id, invoice.id, 'signed_xml', result.signedXml).catch(() => {});
    const todayStr = result.firmaFecha.substring(0, 10);
    const qrUrl = dgiiService.generateQR(
      ecfType,
      company.rnc,
      client.rnc,
      encfNumber,
      amount,
      todayStr,
      result.firmaFecha,
      result.securityCode,
      company.dgii_environment || 'Test',
    );

    // Consultar estado real en DGII (la respuesta inicial suele venir vacía)
    let dgiiEstado = result.estado;
    let dgiiCodigo = result.codigo;
    let dgiiMensajes = result.mensajes;
    if (result.trackId && dgiiEstado !== 'Aceptado' && dgiiEstado !== 'Aceptado Condicional') {
      try {
        await new Promise(r => setTimeout(r, 3000));
        const statusResult = await dgiiService.checkStatus(result.trackId, req.user.company_id, company.dgii_environment);
        dgiiEstado = statusResult?.estado || dgiiEstado;
        dgiiCodigo = statusResult?.codigo || dgiiCodigo;
        dgiiMensajes = statusResult?.mensajes || dgiiMensajes;
      } catch (_) {}
    }

    const currentCustom = JSON.parse(invoice.custom_fields || '{}');
    const updatedCustom = {
      ...currentCustom,
      ncf_comprobante: encfNumber,
      qr_url: qrUrl,
      security_code: result.securityCode,
      track_id: result.trackId,
      signed_xml: result.signedXml,
      dgii_response: { trackId: result.trackId, estado: dgiiEstado, codigo: dgiiCodigo, mensajes: dgiiMensajes },
    };
    const tieneTrackId = !!result.trackId;
    const isApproved = dgiiEstado === 'Aceptado' || dgiiEstado === 'Aceptado Condicional';
    const isPending = tieneTrackId && !isApproved && (!dgiiEstado || dgiiEstado === 'En proceso' || dgiiEstado === 'Recibado');
    const finalStatus = isApproved ? 'sent_to_dgii' : isPending ? 'sent_to_dgii' : 'rejected_by_dgii';
    const finalDgiiStatus = isApproved ? 'sent' : isPending ? 'pending' : 'rejected';
    await prisma.invoice.update({
      where: { id: invoice.id },
      data: {
        status: finalStatus,
        ncf: encfNumber,
        dgii_track_id: result.trackId,
        dgii_security_code: result.securityCode,
        dgii_signed_xml: result.signedXml,
        dgii_status: finalDgiiStatus,
        dgii_contingency: false,
        dgii_error: null,
        custom_fields: JSON.stringify(updatedCustom),
      },
    });
    const msg = isApproved
      ? `Factura aprobada por DGII. e-CF: ${encfNumber}`
      : isPending
        ? `Factura enviada a DGII, pendiente de aprobación. e-CF: ${encfNumber}`
        : `Factura rechazada por DGII. e-CF: ${encfNumber}`;
    return res.status(isApproved ? 200 : 202).json({
      success: isApproved || isPending, message: msg,
      data: { id: invoice.id, invoice_number: invoice.invoice_number, ncf: encfNumber, qr_url: qrUrl, track_id: result.trackId, client: client.name, estado: dgiiEstado, mensajes: dgiiMensajes },
    });
  } catch (error: any) {
    // Guardar en contingencia
    try {
      await prisma.invoice.update({
        where: { id: invoiceId },
        data: {
          dgii_status: 'contingency',
          dgii_contingency: true,
          dgii_error: error.message,
        },
      });
    } catch (_) {}
    return res.status(202).json({
      success: false, contingency: true,
      message: `DGII no disponible. Factura guardada en contingencia: ${error.message}`,
    });
  }
}

export async function getStatus(req: AuthRequest, res: Response) {
  if (!req.user) return res.status(401).json({ detail: 'No autorizado' });
  const { track_id } = req.params;
  if (!track_id) return res.status(400).json({ detail: 'track_id es requerido' });
  try {
    const company = await prisma.company.findUnique({ where: { id: req.user.company_id } });
    const result = await dgiiService.checkStatus(track_id, req.user.company_id, company?.dgii_environment);
    console.log(`[DGII Status] TrackID: ${track_id}, Result:`, JSON.stringify(result, null, 2));
    return res.status(200).json({ success: true, data: result });
  } catch (error: any) {
    return res.status(500).json({ detail: `Error al consultar estado: ${error.message}` });
  }
}

export async function getCustomerDirectory(req: AuthRequest, res: Response) {
  if (!req.user) return res.status(401).json({ detail: 'No autorizado' });
  const { rnc } = req.query as Record<string, string>;
  if (!rnc) return res.status(400).json({ detail: 'rnc es requerido' });
  try {
    const company = await prisma.company.findUnique({ where: { id: req.user.company_id } });
    const result = await dgiiService.getCustomerDirectory(rnc, req.user.company_id, company?.dgii_environment);
    return res.status(200).json({ success: true, data: result });
  } catch (error: any) {
    return res.status(500).json({ detail: `Error al consultar directorio: ${error.message}` });
  }
}

export async function voidEncf(req: AuthRequest, res: Response) {
  if (!req.user) return res.status(401).json({ detail: 'No autorizado' });
  const { encf, desde, hasta } = req.body;
  if (!encf || desde === undefined || hasta === undefined) {
    return res.status(400).json({ detail: 'encf, desde y hasta son requeridos' });
  }
  try {
    const company = await prisma.company.findUnique({ where: { id: req.user.company_id } });
    if (!company) return res.status(404).json({ detail: 'Empresa no encontrada' });
    const result = await dgiiService.voidEncf(req.user.company_id, company.rnc, encf, Number(desde), Number(hasta), company.dgii_environment);
    return res.status(200).json({ success: true, message: 'Anulación enviada a DGII', data: result });
  } catch (error: any) {
    return res.status(500).json({ detail: `Error al anular: ${error.message}` });
  }
}

export async function getCertificateInfo(req: AuthRequest, res: Response) {
  if (!req.user) return res.status(401).json({ detail: 'No autorizado' });
  try {
    const company = await prisma.company.findUnique({ where: { id: req.user.company_id } });
    if (!company?.certificate_content || !company?.certificate_password) {
      return res.status(400).json({ detail: 'No hay certificado configurado' });
    }
    const reader = new (require('dgii-ecf').P12Reader)(company.certificate_password);
    const info = reader.getCertificateInfoFromBase64(company.certificate_content);
    return res.status(200).json({ success: true, data: info });
  } catch (error: any) {
    return res.status(500).json({ detail: `Error al leer certificado: ${error.message}` });
  }
}

export async function resetInvoice(req: AuthRequest, res: Response) {
  if (!req.user) return res.status(401).json({ detail: 'No autorizado' });
  const invoiceId = parseInt(req.params.invoice_id, 10);
  if (isNaN(invoiceId)) return res.status(400).json({ detail: 'ID inválido' });
  try {
    const invoice = await prisma.invoice.findFirst({
      where: { id: invoiceId, company_id: req.user.is_super_admin ? undefined : req.user.company_id },
    });
    if (!invoice) return res.status(404).json({ detail: 'Factura no encontrada' });

    // Solo permitir reset si no fue aceptada por DGII
    if (invoice.dgii_status === 'sent') {
      return res.status(400).json({ detail: 'Esta factura fue aceptada por DGII. No se puede resetear.' });
    }

    await prisma.invoice.update({
      where: { id: invoiceId },
      data: {
        status: 'draft',
        ncf: null,
        dgii_track_id: null,
        dgii_security_code: null,
        dgii_signed_xml: null,
        dgii_status: null,
        dgii_contingency: false,
        dgii_error: null,
        custom_fields: null,
      },
    });

    return res.status(200).json({ success: true, message: 'Factura reseteada a borrador. Puedes cambiar el tipo y reintentar.' });
  } catch (error: any) {
    return res.status(500).json({ detail: `Error al resetear factura: ${error.message}` });
  }
}

export async function getBatchStatus(req: AuthRequest, res: Response) {
  if (!req.user) return res.status(401).json({ detail: 'No autorizado' });
  const companyId = req.user.is_super_admin ? (req.query.company_id || req.user.company_id) : req.user.company_id;
  try {
    const invoices = await prisma.invoice.findMany({
      where: {
        company_id: Number(companyId),
        dgii_track_id: { not: null },
      },
      orderBy: { created_at: 'desc' },
      include: { client: { select: { name: true, rnc: true } } },
    });

    const company = await prisma.company.findUnique({ where: { id: Number(companyId) } });

    const results = [];
    for (const inv of invoices) {
      let dgiiStatus: any = { estado: 'no consultado' };
      if (inv.dgii_track_id && company?.certificate_content) {
        try {
          dgiiStatus = await dgiiService.checkStatus(inv.dgii_track_id, Number(companyId), company.dgii_environment);
        } catch (_) {
          dgiiStatus = { estado: 'error al consultar' };
        }
      }
      results.push({
        id: inv.id,
        invoice_number: inv.invoice_number,
        ncf: inv.ncf,
        total_amount: inv.total_amount,
        client_name: inv.client?.name,
        client_rnc: inv.client?.rnc,
        created_at: inv.created_at,
        local_status: inv.status,
        local_dgii_status: inv.dgii_status,
        dgii: dgiiStatus,
      });
    }

    return res.status(200).json(results);
  } catch (error: any) {
    return res.status(500).json({ detail: `Error al consultar lote: ${error.message}` });
  }
}
