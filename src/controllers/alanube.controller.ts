import { Request, Response } from 'express';
import prisma from '../models/db';
import { AuthRequest } from '../middlewares/auth';
import * as alanubeService from '../services/alanube.service';
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

function findEncf(source: any): string {
  const direct = findValueByKeys(source, ['documentnumber', 'ncf', 'encf', 'e-ncf', 'enumber', 'generatedencf', 'submittedencf']);
  if (direct) return direct.toUpperCase();
  const serialized = JSON.stringify(source || {});
  const match = serialized.match(/\bE(?:31|32|33|34|41|43|44|45|46|47)\d{10}\b/i);
  return match ? match[0].toUpperCase() : '';
}

function findQrUrl(source: any): string {
  return findValueByKeys(source, ['ecfurl', 'qrurl', 'qr_url', 'urlconsulta', 'consultationurl', 'validationurl', 'verificationurl', 'trackurl', 'url']);
}

function getAlanubeCompanyIdFromSettings(userId: number) {
  return prisma.companySettings.findFirst({
    where: { user_id: userId },
  });
}

// ========== CONNECTION / COMPANY ==========

export async function validateConnection(req: AuthRequest, res: Response) {
  if (!req.user) return res.status(401).json({ detail: 'No autorizado' });
  try {
    const result = await alanubeService.validateConnection();
    return res.status(200).json(result);
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
}

export async function testConnectionNoAuth(req: Request, res: Response) {
  try {
    const result = await alanubeService.validateConnection();
    return res.status(200).json({ ...result, debug: { api_base: process.env.ALANUBE_API_URL || 'https://sandbox.alanube.co/dom/v1/', status: result.success ? 200 : 500 } });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: `Error de conexión: ${error.message}` });
  }
}

export async function getCompany(req: AuthRequest, res: Response) {
  if (!req.user) return res.status(401).json({ detail: 'No autorizado' });
  try {
    const settings = await getAlanubeCompanyIdFromSettings(req.user.id);
    const companyId = settings?.alanube_company_id || undefined;
    const data = await alanubeService.getCompany(companyId);
    return res.status(200).json({ success: true, message: 'Información de empresa obtenida', data });
  } catch (error: any) {
    const errMsg = error.response ? JSON.stringify(error.response.data) : error.message;
    return res.status(error.response ? error.response.status : 500).json({ detail: `Error de Alanube: ${errMsg}` });
  }
}

export async function updateCompany(req: AuthRequest, res: Response) {
  if (!req.user) return res.status(401).json({ detail: 'No autorizado' });
  try {
    const settings = await getAlanubeCompanyIdFromSettings(req.user.id);
    const companyId = settings?.alanube_company_id || undefined;
    const data = await alanubeService.updateCompany(req.body, companyId);
    return res.status(200).json({ success: true, message: 'Empresa actualizada en Alanube', data });
  } catch (error: any) {
    const errMsg = error.response ? JSON.stringify(error.response.data) : error.message;
    return res.status(error.response ? error.response.status : 500).json({ detail: `Error al actualizar empresa: ${errMsg}` });
  }
}

export async function createCompany(req: AuthRequest, res: Response) {
  if (!req.user) return res.status(401).json({ detail: 'No autorizado' });
  const { name, tradeName, identification, type, address, province, municipality, email, certificate, notificationByEmail, logo } = req.body;
  if (!name || !identification || !address || !certificate) {
    return res.status(400).json({ detail: 'name, identification, address y certificate son requeridos' });
  }
  if (!certificate.name || !certificate.content || !certificate.password) {
    return res.status(400).json({ detail: 'certificate name, content y password son requeridos' });
  }
  try {
    const payload = {
      name, tradeName, identification, type: type || 'main', address, province, municipality, email,
      certificate: { name: certificate.name, extension: certificate.extension || 'pfx', content: certificate.content, password: certificate.password },
      notificationByEmail, logo,
    };
    const alanubeRes = await alanubeService.createAlanubeCompany(payload);
    const alanubeCompanyId = alanubeRes.id;
    if (!alanubeCompanyId) {
      return res.status(400).json({ detail: 'La API de Alanube no retornó un ID de empresa válido', response: alanubeRes });
    }
    const settings = await getAlanubeCompanyIdFromSettings(req.user.id);
    if (settings) {
      await prisma.companySettings.update({
        where: { id: settings.id },
        data: { alanube_company_id: alanubeCompanyId, company_name: name, company_rnc: identification, company_address: address, company_email: email },
      });
    } else {
      await prisma.companySettings.create({
        data: { user_id: req.user.id, alanube_company_id: alanubeCompanyId, company_name: name, company_rnc: identification, company_address: address, company_email: email },
      });
    }
    if (req.user.company_id) {
      await prisma.company.update({
        where: { id: req.user.company_id },
        data: { alanube_company_id: alanubeCompanyId, fiscal_provider: 'alanube', certificate_name: certificate.name },
      });
    }
    return res.status(200).json({
      success: true, message: 'Empresa dada de alta en Alanube y configurada localmente con éxito',
      data: { alanube_company_id: alanubeCompanyId, status: alanubeRes.status, name: alanubeRes.name, rnc: alanubeRes.identification },
    });
  } catch (error: any) {
    const errDetail = error.response ? JSON.stringify(error.response.data) : error.message;
    return res.status(error.response ? error.response.status : 500).json({ detail: `Error al crear empresa en Alanube: ${errDetail}` });
  }
}

// ========== INVOICE CREATION ==========

export async function createInvoice(req: AuthRequest, res: Response) {
  if (!req.user) return res.status(401).json({ detail: 'No autorizado' });
  const { client_id, description, amount, document_type } = req.body;
  if (!client_id || !description || amount === undefined) {
    return res.status(400).json({ detail: 'client_id, description y amount son requeridos' });
  }
  if (Number(amount) <= 0) {
    return res.status(400).json({ detail: 'El monto de la factura debe ser mayor a cero' });
  }
  try {
    const client = await prisma.client.findFirst({
      where: { id: Number(client_id), company_id: req.user.is_super_admin ? undefined : req.user.company_id },
    });
    if (!client) return res.status(404).json({ detail: 'Cliente no encontrado' });
    if (!client.rnc || client.rnc.trim() === '') {
      return res.status(400).json({ detail: `El cliente '${client.name}' no tiene un RNC configurado. Es obligatorio para la facturación fiscal.` });
    }
    const invoiceNumber = await generateInvoiceNumber(req.user.id, req.user.company_id);
    const invoice = await prisma.invoice.create({
      data: {
        user_id: req.user.id, company_id: req.user.company_id, client_id: client.id, invoice_number: invoiceNumber,
        description, amount: Number(amount), subtotal: Number(amount), tax_amount: 0.0, discount_amount: 0.0,
        total_amount: Number(amount), currency: 'DOP', status: 'draft',
        custom_fields: JSON.stringify({ documento_tipo: document_type || 'Factura de Consumo' }),
      },
    });
    const alanubeRes = await alanubeService.createAlanubeInvoice({
      client: { name: client.name, rnc: client.rnc, address: client.address || undefined },
      description, amount: Number(amount), documentType: document_type,
    }, req.user.id, req.user.company_id);
    const ncf = findEncf(alanubeRes);
    const invoiceId = String(alanubeRes.id || alanubeRes.invoiceId || alanubeRes.documentId || '');
    const apiSuccess = alanubeRes.success !== false;
    const currentCustom = JSON.parse(invoice.custom_fields || '{}');
    const updatedCustom = { ...currentCustom, ncf_comprobante: ncf, qr_url: findQrUrl(alanubeRes), alanube_response: alanubeRes, alanube_error: !apiSuccess ? alanubeRes.alanube_error : undefined };
    const updatedInvoice = await prisma.invoice.update({
      where: { id: invoice.id },
      data: { status: apiSuccess ? 'sent_to_alanube' : 'error', alanube_id: invoiceId, ncf, custom_fields: JSON.stringify(updatedCustom) },
    });
    if (!apiSuccess) {
      return res.status(400).json({ success: false, message: `NCF ${ncf} generado pero error al transmitir a Alanube: ${alanubeRes.alanube_error}`, data: { id: updatedInvoice.id, ncf, status: 'error', amount: Number(updatedInvoice.total_amount), client: client.name } });
    }
    return res.status(200).json({ success: true, message: `Factura creada exitosamente. NCF: ${ncf}`, data: { id: updatedInvoice.id, alanube_id: invoiceId, ncf, status: alanubeRes.status || '', amount: updatedInvoice.amount, client: client.name, full_response: alanubeRes } });
  } catch (error: any) {
    return res.status(500).json({ detail: `Error interno al procesar factura: ${error.message}` });
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
    if (invoice.status === 'sent_to_alanube') {
      return res.status(400).json({ detail: 'Esta factura ya fue emitida fiscalmente y tiene el NCF: ' + invoice.ncf });
    }
    const client = invoice.client;
    if (!client.rnc || client.rnc.trim() === '') {
      return res.status(400).json({ detail: `El cliente '${client.name}' no tiene un RNC configurado.` });
    }
    let docType = 'Factura de Consumo';
    try {
      if (invoice.custom_fields) {
        const parsed = JSON.parse(invoice.custom_fields);
        if (parsed.documento_tipo) docType = parsed.documento_tipo;
      }
    } catch (_) { }
    const alanubeRes = await alanubeService.createAlanubeInvoice({
      client: { name: client.name, rnc: client.rnc, address: client.address || undefined },
      description: invoice.description || 'Factura de venta', amount: Number(invoice.total_amount), documentType: docType,
    }, req.user.id, req.user.company_id);
    const ncf = findEncf(alanubeRes);
    const alanubeId = String(alanubeRes.id || alanubeRes.invoiceId || alanubeRes.documentId || '');
    const apiSuccess = alanubeRes.success !== false;
    const currentCustom = JSON.parse(invoice.custom_fields || '{}');
    const updatedCustom = { ...currentCustom, ncf_comprobante: ncf, qr_url: findQrUrl(alanubeRes), alanube_response: alanubeRes, alanube_error: !apiSuccess ? alanubeRes.alanube_error : undefined };
    const updatedInvoice = await prisma.invoice.update({
      where: { id: invoice.id },
      data: { status: apiSuccess ? 'sent_to_alanube' : 'error', alanube_id: alanubeId, ncf, custom_fields: JSON.stringify(updatedCustom) },
    });
    if (!apiSuccess) {
      return res.status(400).json({ success: false, message: `NCF ${ncf} generado pero error al transmitir a Alanube: ${alanubeRes.alanube_error}`, data: { id: updatedInvoice.id, ncf, status: 'error', amount: Number(updatedInvoice.total_amount), client: client.name } });
    }
    return res.status(200).json({ success: true, message: `Factura emitida exitosamente. NCF: ${ncf}`, data: { id: updatedInvoice.id, alanube_id: alanubeId, ncf, status: alanubeRes.status || '', amount: Number(updatedInvoice.total_amount), client: client.name } });
  } catch (error: any) {
    return res.status(500).json({ detail: `Error interno al transmitir factura: ${error.message}` });
  }
}

// ========== STATUS CHECK ==========

export async function checkInvoiceStatus(req: AuthRequest, res: Response) {
  if (!req.user) return res.status(401).json({ detail: 'No autorizado' });
  const { type, id, idCompany } = req.query as Record<string, string>;
  if (!type) return res.status(400).json({ detail: 'type (E31-E47) es requerido' });
  if (!id) return res.status(400).json({ detail: 'id del documento es requerido' });
  try {
    const data = await alanubeService.checkDocumentStatus(type, id, idCompany);
    return res.status(200).json({ success: true, data });
  } catch (error: any) {
    const errMsg = error.response ? JSON.stringify(error.response.data) : error.message;
    return res.status(error.response ? error.response.status : 500).json({ detail: `Error al consultar estado: ${errMsg}` });
  }
}

// ========== NOTIFY BY EMAIL ==========

export async function notifyInvoice(req: AuthRequest, res: Response) {
  if (!req.user) return res.status(401).json({ detail: 'No autorizado' });
  const { type, id, idCompany, mail } = req.body;
  if (!type || !id) return res.status(400).json({ detail: 'type y id son requeridos' });
  try {
    const data = await alanubeService.notifyByEmail(type, id, idCompany, mail);
    return res.status(200).json({ success: true, data });
  } catch (error: any) {
    const errMsg = error.response ? JSON.stringify(error.response.data) : error.message;
    return res.status(error.response ? error.response.status : 500).json({ detail: `Error al notificar: ${errMsg}` });
  }
}

// ========== CANCELLATIONS ==========

export async function createCancellation(req: AuthRequest, res: Response) {
  if (!req.user) return res.status(401).json({ detail: 'No autorizado' });
  try {
    const data = await alanubeService.createCancellation(req.body);
    return res.status(200).json({ success: true, data });
  } catch (error: any) {
    const errMsg = error.response ? JSON.stringify(error.response.data) : error.message;
    return res.status(error.response ? error.response.status : 500).json({ detail: `Error al crear anulación: ${errMsg}` });
  }
}

export async function checkCancellations(req: AuthRequest, res: Response) {
  if (!req.user) return res.status(401).json({ detail: 'No autorizado' });
  const { id, idCompany } = req.query as Record<string, string>;
  if (!id) return res.status(400).json({ detail: 'id de anulación es requerido' });
  try {
    const data = await alanubeService.checkCancellations(id, idCompany);
    return res.status(200).json({ success: true, data });
  } catch (error: any) {
    const errMsg = error.response ? JSON.stringify(error.response.data) : error.message;
    return res.status(error.response ? error.response.status : 500).json({ detail: `Error al consultar anulaciones: ${errMsg}` });
  }
}

// ========== RECEIVED DOCUMENTS ==========

export async function getReceivedDocuments(req: AuthRequest, res: Response) {
  if (!req.user) return res.status(401).json({ detail: 'No autorizado' });
  const { idCompany, id } = req.query as Record<string, string>;
  try {
    const data = await alanubeService.getReceivedDocuments(idCompany, id);
    return res.status(200).json({ success: true, data });
  } catch (error: any) {
    const errMsg = error.response ? JSON.stringify(error.response.data) : error.message;
    return res.status(error.response ? error.response.status : 500).json({ detail: `Error: ${errMsg}` });
  }
}

export async function createCommercialResponse(req: AuthRequest, res: Response) {
  if (!req.user) return res.status(401).json({ detail: 'No autorizado' });
  const { documentId, idCompany } = req.params;
  try {
    const data = await alanubeService.createCommercialResponse(documentId, req.body, idCompany);
    return res.status(200).json({ success: true, data });
  } catch (error: any) {
    const errMsg = error.response ? JSON.stringify(error.response.data) : error.message;
    return res.status(error.response ? error.response.status : 500).json({ detail: `Error: ${errMsg}` });
  }
}

// ========== COMMERCIAL APPROVALS ==========

export async function getReceivedCommercialApprovals(req: AuthRequest, res: Response) {
  if (!req.user) return res.status(401).json({ detail: 'No autorizado' });
  const { idCompany, id } = req.query as Record<string, string>;
  try {
    const data = await alanubeService.getReceivedCommercialApprovals(idCompany, id);
    return res.status(200).json({ success: true, data });
  } catch (error: any) {
    const errMsg = error.response ? JSON.stringify(error.response.data) : error.message;
    return res.status(error.response ? error.response.status : 500).json({ detail: `Error: ${errMsg}` });
  }
}

export async function getGeneratedCommercialApprovals(req: AuthRequest, res: Response) {
  if (!req.user) return res.status(401).json({ detail: 'No autorizado' });
  const { id, idCompany } = req.query as Record<string, string>;
  try {
    const data = await alanubeService.getGeneratedCommercialApprovals(id, idCompany);
    return res.status(200).json({ success: true, data });
  } catch (error: any) {
    const errMsg = error.response ? JSON.stringify(error.response.data) : error.message;
    return res.status(error.response ? error.response.status : 500).json({ detail: `Error: ${errMsg}` });
  }
}

// ========== ACKNOWLEDGMENTS ==========

export async function getExternalAcknowledgments(req: AuthRequest, res: Response) {
  if (!req.user) return res.status(401).json({ detail: 'No autorizado' });
  const { idCompany, id } = req.query as Record<string, string>;
  if (!idCompany) return res.status(400).json({ detail: 'idCompany es requerido' });
  try {
    const data = await alanubeService.getExternalAcknowledgments(idCompany, id);
    return res.status(200).json({ success: true, data });
  } catch (error: any) {
    const errMsg = error.response ? JSON.stringify(error.response.data) : error.message;
    return res.status(error.response ? error.response.status : 500).json({ detail: `Error: ${errMsg}` });
  }
}

export async function getInternalAcknowledgments(req: AuthRequest, res: Response) {
  if (!req.user) return res.status(401).json({ detail: 'No autorizado' });
  const { idCompany, id } = req.query as Record<string, string>;
  if (!idCompany) return res.status(400).json({ detail: 'idCompany es requerido' });
  try {
    const data = await alanubeService.getInternalAcknowledgments(idCompany, id);
    return res.status(200).json({ success: true, data });
  } catch (error: any) {
    const errMsg = error.response ? JSON.stringify(error.response.data) : error.message;
    return res.status(error.response ? error.response.status : 500).json({ detail: `Error: ${errMsg}` });
  }
}

// ========== DGII STATUS ==========

export async function checkDgiiStatus(req: AuthRequest, res: Response) {
  if (!req.user) return res.status(401).json({ detail: 'No autorizado' });
  const { idCompany } = req.query as Record<string, string>;
  try {
    const data = await alanubeService.checkDgiiStatus(idCompany);
    return res.status(200).json({ success: true, data });
  } catch (error: any) {
    const errMsg = error.response ? JSON.stringify(error.response.data) : error.message;
    return res.status(error.response ? error.response.status : 500).json({ detail: `Error: ${errMsg}` });
  }
}

// ========== DIRECTORY ==========

export async function checkDirectory(req: AuthRequest, res: Response) {
  if (!req.user) return res.status(401).json({ detail: 'No autorizado' });
  const { rnc } = req.query as Record<string, string>;
  try {
    const data = await alanubeService.checkDirectory(rnc);
    return res.status(200).json({ success: true, data });
  } catch (error: any) {
    const errMsg = error.response ? JSON.stringify(error.response.data) : error.message;
    return res.status(error.response ? error.response.status : 500).json({ detail: `Error: ${errMsg}` });
  }
}

// ========== PROVIDER INFO ==========

export async function getProviderInfo(req: AuthRequest, res: Response) {
  if (!req.user) return res.status(401).json({ detail: 'No autorizado' });
  try {
    const data = await alanubeService.getProviderInfo();
    return res.status(200).json({ success: true, data });
  } catch (error: any) {
    const errMsg = error.response ? JSON.stringify(error.response.data) : error.message;
    return res.status(error.response ? error.response.status : 500).json({ detail: `Error: ${errMsg}` });
  }
}

// ========== DOCUMENT TOTALS ==========

export async function getTotalEmittedDocuments(req: AuthRequest, res: Response) {
  if (!req.user) return res.status(401).json({ detail: 'No autorizado' });
  const { companyId } = req.query as Record<string, string>;
  if (!companyId) return res.status(400).json({ detail: 'companyId es requerido' });
  try {
    const data = await alanubeService.getTotalEmittedDocuments(companyId);
    return res.status(200).json({ success: true, data });
  } catch (error: any) {
    const errMsg = error.response ? JSON.stringify(error.response.data) : error.message;
    return res.status(error.response ? error.response.status : 500).json({ detail: `Error: ${errMsg}` });
  }
}

export async function getTotalAcceptedDocuments(req: AuthRequest, res: Response) {
  if (!req.user) return res.status(401).json({ detail: 'No autorizado' });
  const { companyId } = req.query as Record<string, string>;
  if (!companyId) return res.status(400).json({ detail: 'companyId es requerido' });
  try {
    const data = await alanubeService.getTotalAcceptedDocuments(companyId);
    return res.status(200).json({ success: true, data });
  } catch (error: any) {
    const errMsg = error.response ? JSON.stringify(error.response.data) : error.message;
    return res.status(error.response ? error.response.status : 500).json({ detail: `Error: ${errMsg}` });
  }
}

export async function getTotalDocumentsByCompany(req: AuthRequest, res: Response) {
  if (!req.user) return res.status(401).json({ detail: 'No autorizado' });
  const { idCompany } = req.params;
  try {
    const data = await alanubeService.getTotalDocumentsByCompany(idCompany, req.query);
    return res.status(200).json({ success: true, data });
  } catch (error: any) {
    const errMsg = error.response ? JSON.stringify(error.response.data) : error.message;
    return res.status(error.response ? error.response.status : 500).json({ detail: `Error: ${errMsg}` });
  }
}

// ========== CERTIFICATION / SIGNING ==========

export async function signDocument(req: AuthRequest, res: Response) {
  if (!req.user) return res.status(401).json({ detail: 'No autorizado' });
  const { companyId } = req.params;
  try {
    const data = await alanubeService.signDocument(req.body, companyId);
    return res.status(200).json({ success: true, data });
  } catch (error: any) {
    const errMsg = error.response ? JSON.stringify(error.response.data) : error.message;
    return res.status(error.response ? error.response.status : 500).json({ detail: `Error: ${errMsg}` });
  }
}

// ========== TEST SETS ==========

export async function createTestSet(req: AuthRequest, res: Response) {
  if (!req.user) return res.status(401).json({ detail: 'No autorizado' });
  try {
    const data = await alanubeService.createTestSet(req.body);
    return res.status(200).json({ success: true, data });
  } catch (error: any) {
    const errMsg = error.response ? JSON.stringify(error.response.data) : error.message;
    return res.status(error.response ? error.response.status : 500).json({ detail: `Error: ${errMsg}` });
  }
}

export async function checkTestSet(req: AuthRequest, res: Response) {
  if (!req.user) return res.status(401).json({ detail: 'No autorizado' });
  const { companyId } = req.query as Record<string, string>;
  try {
    const data = await alanubeService.checkTestSet(companyId);
    return res.status(200).json({ success: true, data });
  } catch (error: any) {
    const errMsg = error.response ? JSON.stringify(error.response.data) : error.message;
    return res.status(error.response ? error.response.status : 500).json({ detail: `Error: ${errMsg}` });
  }
}

// ========== DGII RECEPTION TEST ==========

export async function receiveDocumentFromDgii(req: AuthRequest, res: Response) {
  if (!req.user) return res.status(401).json({ detail: 'No autorizado' });
  try {
    const data = await alanubeService.receiveDocumentFromDgii(req.body);
    return res.status(200).json({ success: true, data });
  } catch (error: any) {
    const errMsg = error.response ? JSON.stringify(error.response.data) : error.message;
    return res.status(error.response ? error.response.status : 500).json({ detail: `Error: ${errMsg}` });
  }
}
