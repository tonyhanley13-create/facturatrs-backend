import axios from 'axios';
import { ALANUBE_API_URL, ALANUBE_TOKEN, ALANUBE_COMPANY_ID } from '../config';
import crypto from 'crypto';
import prisma from '../models/db';

const ALANUBE_API_BASE = ALANUBE_API_URL.endsWith('/') ? ALANUBE_API_URL : `${ALANUBE_API_URL}/`;

const getHeaders = () => ({
  'Authorization': `Bearer ${ALANUBE_TOKEN}`,
  'Content-Type': 'application/json',
  'Accept': 'application/json',
});

const DOCUMENT_TYPE_MAP: Record<string, { prefix: string; typeCode: string; endpointPath: string }> = {
  'E31': { prefix: 'E31', typeCode: '31', endpointPath: 'fiscal-invoices' },
  'E32': { prefix: 'E32', typeCode: '32', endpointPath: 'invoices' },
  'E33': { prefix: 'E33', typeCode: '33', endpointPath: 'debit-notes' },
  'E34': { prefix: 'E34', typeCode: '34', endpointPath: 'credit-notes' },
  'E41': { prefix: 'E41', typeCode: '41', endpointPath: 'purchases' },
  'E43': { prefix: 'E43', typeCode: '43', endpointPath: 'minor-expenses' },
  'E44': { prefix: 'E44', typeCode: '44', endpointPath: 'special-regimes' },
  'E45': { prefix: 'E45', typeCode: '45', endpointPath: 'gubernamentals' },
  'E46': { prefix: 'E46', typeCode: '46', endpointPath: 'export-supports' },
  'E47': { prefix: 'E47', typeCode: '47', endpointPath: 'payment-abroad-supports' },
};

const DOCUMENT_TYPE_ALIASES: Record<string, string> = {
  'Factura de Crédito Fiscal': 'E31',
  'Factura de Consumo': 'E32',
  'Nota de Débito': 'E33',
  'Nota de Crédito': 'E34',
  'Comprobante de Compras': 'E41',
  'Gastos Menores': 'E43',
  'Regímenes Especiales': 'E44',
  'Comprobante Gubernamental': 'E45',
  'Pagos al Exterior': 'E46',
  'Exportación': 'E47',
};

export function resolveType(documentType?: string): string {
  if (!documentType) return 'E32';
  const alias = DOCUMENT_TYPE_ALIASES[documentType];
  if (alias) return alias;
  const upper = documentType.toUpperCase();
  if (DOCUMENT_TYPE_MAP[upper]) return upper;
  return 'E32';
}

export function getTypeInfo(documentType?: string) {
  const key = resolveType(documentType);
  return DOCUMENT_TYPE_MAP[key];
}

async function getAlanubeCompanyId(companyId?: number): Promise<string> {
  if (companyId) {
    const company = await prisma.company.findUnique({
      where: { id: companyId },
      select: { alanube_company_id: true },
    });
    if (company?.alanube_company_id) return company.alanube_company_id;
  }
  return ALANUBE_COMPANY_ID;
}

export async function getNcfSequences(userId: number, companyId?: number): Promise<any[]> {
  let sequences: any[] = [];
  if (companyId) {
    const company = await prisma.company.findUnique({ where: { id: companyId } });
    if (company?.ncf_ranges) {
      try {
        const parsed = JSON.parse(company.ncf_ranges);
        if (Array.isArray(parsed) && parsed.length > 0) sequences = parsed;
      } catch (e) { }
    }
  }
  if (sequences.length === 0) {
    const settings = await prisma.companySettings.findFirst({ where: { user_id: userId } });
    try {
      if (settings && settings.client_custom_fields) {
        const parsed = JSON.parse(settings.client_custom_fields);
        if (Array.isArray(parsed) && parsed.length > 0) sequences = parsed;
      }
    } catch (e) { }
  }
  return sequences;
}

export async function saveNcfSequences(sequences: any[], companyId?: number, userId?: number) {
  if (companyId) {
    await prisma.company.update({
      where: { id: companyId },
      data: { ncf_ranges: JSON.stringify(sequences) },
    });
  } else if (userId) {
    const settings = await prisma.companySettings.findFirst({ where: { user_id: userId } });
    if (settings) {
      await prisma.companySettings.update({
        where: { id: settings.id },
        data: { client_custom_fields: JSON.stringify(sequences) },
      });
    }
  }
}

export function getDefaultSequences(): any[] {
  return [
    { type: 'E31', prefix: 'E31', next: 1, end: 999999 },
    { type: 'E32', prefix: 'E32', next: 1, end: 999999 },
    { type: 'E33', prefix: 'E33', next: 1, end: 999999 },
    { type: 'E34', prefix: 'E34', next: 1, end: 999999 },
    { type: 'E41', prefix: 'E41', next: 1, end: 999999 },
    { type: 'E43', prefix: 'E43', next: 1, end: 999999 },
    { type: 'E44', prefix: 'E44', next: 1, end: 999999 },
    { type: 'E45', prefix: 'E45', next: 1, end: 999999 },
    { type: 'E46', prefix: 'E46', next: 1, end: 999999 },
    { type: 'E47', prefix: 'E47', next: 1, end: 999999 },
  ];
}

export function buildEncfNumber(sequences: any[], prefix: string): { encfNumber: string; updatedSequences: any[] } {
  let seqConfig = sequences.find((s: any) => s.type === prefix);
  if (!seqConfig) {
    seqConfig = { type: prefix, prefix, next: 1, end: 999999 };
    sequences.push(seqConfig);
  }
  if (Number(seqConfig.next) > Number(seqConfig.end)) {
    seqConfig.end = Number(seqConfig.end) + 10000;
  }
  const uniqueSequence = seqConfig.next.toString().padStart(10, '0');
  const encfNumber = `${prefix}${uniqueSequence}`;
  seqConfig.next = Number(seqConfig.next) + 1;
  return { encfNumber, updatedSequences: sequences };
}

function buildAlanubePayload(client: { name: string; rnc: string; address?: string }, description: string, amount: number, typeInfo: { prefix: string; typeCode: string }, encfNumber: string, alanubeCompanyId: string, senderCompany?: { name: string; rnc: string; address?: string }) {
  const todayStr = new Date().toISOString().split('T')[0];
  return {
    company: { id: alanubeCompanyId },
    idDoc: {
      id: crypto.randomUUID(),
      type: typeInfo.typeCode,
      sequence: '00000001',
      encf: encfNumber,
      paymentType: 1,
      incomeType: 1,
      sequenceDueDate: todayStr,
    },
    sender: {
      rnc: senderCompany?.rnc || '132109122',
      companyName: senderCompany?.name || 'juancasado',
      tradeName: senderCompany?.name || 'juancasado',
      identification: senderCompany?.rnc || '132109122',
      address: senderCompany?.address || 'address',
      province: '010000',
      municipality: '010100',
      stampDate: todayStr,
    },
    buyer: {
      rnc: client.rnc.trim(),
      companyName: client.name,
      name: client.name,
      identification: client.rnc.trim(),
      address: client.address || 'Dirección del cliente',
      province: '010000',
      municipality: '010100',
    },
    date: todayStr,
    currency: 'DOP',
    itemDetails: [
      {
        lineNumber: 1,
        billingIndicator: 1,
        itemName: description,
        description,
        goodServiceIndicator: 2,
        quantityItem: 1,
        unitPriceItem: Number(amount),
        itemAmount: Number(amount),
        quantity: 1,
        unitPrice: Number(amount),
        totalAmount: Number(amount),
        itemCode: '001',
        unitOfMeasure: 'UND',
      },
    ],
    totals: {
      subtotal: Number(amount),
      tax: 0.0,
      discount: 0.0,
      totalAmount: Number(amount),
    },
    documentType: typeInfo.typeCode,
    paymentMethod: '01',
  };
}

// ========== CONNECTION / COMPANY ==========

export async function validateConnection(): Promise<{ success: boolean; message: string; data?: any }> {
  try {
    const url = `${ALANUBE_API_BASE}company`;
    const response = await axios.get(url, { headers: getHeaders(), timeout: 30000 });
    if (response.status === 200) {
      return { success: true, message: 'Conexión con Alanube exitosa', data: response.data };
    }
    return { success: false, message: `Error de Alanube: ${response.status} - ${JSON.stringify(response.data)}` };
  } catch (error: any) {
    const errMsg = error.response ? JSON.stringify(error.response.data) : error.message;
    return { success: false, message: `Error conectando con Alanube: ${errMsg}` };
  }
}

export async function getCompany(companyId?: string): Promise<any> {
  const url = companyId ? `${ALANUBE_API_BASE}company/${companyId}` : `${ALANUBE_API_BASE}company`;
  const response = await axios.get(url, { headers: getHeaders(), timeout: 30000 });
  return response.data;
}

export async function updateCompany(payload: any, companyId?: string): Promise<any> {
  const url = companyId ? `${ALANUBE_API_BASE}company/${companyId}` : `${ALANUBE_API_BASE}company`;
  const response = await axios.put(url, payload, { headers: getHeaders(), timeout: 30000 });
  return response.data;
}

export async function createAlanubeCompany(payload: any): Promise<any> {
  const url = `${ALANUBE_API_BASE}company`;
  const response = await axios.post(url, payload, { headers: getHeaders(), timeout: 60000 });
  return response.data;
}

export interface AlanubeInvoicePayload {
  client: { name: string; rnc: string; address?: string };
  description: string;
  amount: number;
  documentType?: string;
}

export async function createAlanubeInvoice(payload: AlanubeInvoicePayload, userId: number, companyId?: number) {
  const { client, description, amount, documentType } = payload;
  const typeInfo = getTypeInfo(documentType);
  const sequences = await getNcfSequences(userId, companyId);
  const resolved = sequences.length > 0 ? sequences : getDefaultSequences();
  const { encfNumber, updatedSequences } = buildEncfNumber(resolved, typeInfo.prefix);
  await saveNcfSequences(updatedSequences, companyId, userId);

  const alanubeCompanyId = await getAlanubeCompanyId(companyId);
  let senderCompany: { name: string; rnc: string; address?: string } | undefined;
  if (companyId) {
    const c = await prisma.company.findUnique({ where: { id: companyId }, select: { name: true, rnc: true, address: true } });
    if (c) senderCompany = { name: c.name, rnc: c.rnc, address: c.address || undefined };
  }
  const alanubeData = buildAlanubePayload(client, description, amount, typeInfo, encfNumber, alanubeCompanyId, senderCompany);
  // POST to /{endpoint} with company.id in body (not in URL path)
  const url = `${ALANUBE_API_BASE}${typeInfo.endpointPath}`;

  try {
    const response = await axios.post(url, alanubeData, { headers: getHeaders(), timeout: 60000 });
    return {
      ...(response.data && typeof response.data === 'object' ? response.data : { rawResponse: response.data }),
      generatedEncf: encfNumber,
      submittedEncf: encfNumber,
    };
  } catch (apiError: any) {
    return {
      success: false,
      generatedEncf: encfNumber,
      submittedEncf: encfNumber,
      alanube_error: apiError.response ? apiError.response.data : apiError.message,
    };
  }
}

// ========== STATUS CHECK ==========

export async function checkDocumentStatus(type: string, id: string, idCompany?: string): Promise<any> {
  const typeInfo = getTypeInfo(type);
  let url: string;
  if (idCompany) {
    url = `${ALANUBE_API_BASE}${typeInfo.endpointPath}/${id}/idCompany/${idCompany}`;
  } else {
    url = `${ALANUBE_API_BASE}${typeInfo.endpointPath}/${id}`;
  }
  const response = await axios.get(url, { headers: getHeaders(), timeout: 30000 });
  return response.data;
}

// ========== NOTIFY BY EMAIL ==========

export async function notifyByEmail(type: string, id: string, idCompany?: string, mail?: string): Promise<any> {
  const typeInfo = getTypeInfo(type);
  const url = `${ALANUBE_API_BASE}${typeInfo.endpointPath}/notify-by-email`;
  const body: Record<string, any> = { id };
  if (idCompany) body.idCompany = idCompany;
  if (mail) body.mail = mail;
  const response = await axios.post(url, body, { headers: getHeaders(), timeout: 30000 });
  return response.data;
}

// ========== CANCELLATIONS ==========

export async function createCancellation(payload: any): Promise<any> {
  const url = `${ALANUBE_API_BASE}cancellations`;
  const response = await axios.post(url, payload, { headers: getHeaders(), timeout: 60000 });
  return response.data;
}

export async function checkCancellations(id: string, idCompany?: string): Promise<any> {
  let url: string;
  if (idCompany) {
    url = `${ALANUBE_API_BASE}cancellations/${id}/idCompany/${idCompany}`;
  } else {
    url = `${ALANUBE_API_BASE}cancellations/${id}`;
  }
  const response = await axios.get(url, { headers: getHeaders(), timeout: 30000 });
  return response.data;
}

// ========== RECEIVED DOCUMENTS ==========

export async function getReceivedDocuments(idCompany?: string, id?: string): Promise<any> {
  let url: string;
  if (id && idCompany) {
    url = `${ALANUBE_API_BASE}received-documents/${id}/idCompany/${idCompany}`;
  } else if (id) {
    url = `${ALANUBE_API_BASE}received-documents/${id}`;
  } else if (idCompany) {
    url = `${ALANUBE_API_BASE}received-documents/idCompany/${idCompany}`;
  } else {
    url = `${ALANUBE_API_BASE}received-documents`;
  }
  const response = await axios.get(url, { headers: getHeaders(), timeout: 30000 });
  return response.data;
}

export async function createCommercialResponse(documentId: string, payload: any, idCompany?: string): Promise<any> {
  let url: string;
  if (idCompany) {
    url = `${ALANUBE_API_BASE}received-documents/${documentId}/commercial-response/idCompany/${idCompany}`;
  } else {
    url = `${ALANUBE_API_BASE}received-documents/${documentId}/commercial-response`;
  }
  const response = await axios.post(url, payload, { headers: getHeaders(), timeout: 30000 });
  return response.data;
}

// ========== COMMERCIAL APPROVALS ==========

export async function getReceivedCommercialApprovals(idCompany?: string, id?: string): Promise<any> {
  let url: string;
  if (id && idCompany) {
    url = `${ALANUBE_API_BASE}received-commercial-approvals/${id}/idCompany/${idCompany}`;
  } else if (id) {
    url = `${ALANUBE_API_BASE}received-commercial-approvals/${id}`;
  } else if (idCompany) {
    url = `${ALANUBE_API_BASE}received-commercial-approvals/idCompany/${idCompany}`;
  } else {
    url = `${ALANUBE_API_BASE}received-commercial-approvals`;
  }
  const response = await axios.get(url, { headers: getHeaders(), timeout: 30000 });
  return response.data;
}

export async function getGeneratedCommercialApprovals(id?: string, idCompany?: string): Promise<any> {
  let url: string;
  if (id && idCompany) {
    url = `${ALANUBE_API_BASE}commercial-approvals/${id}/idCompany/${idCompany}`;
  } else if (id) {
    url = `${ALANUBE_API_BASE}commercial-approvals/${id}`;
  } else if (idCompany) {
    url = `${ALANUBE_API_BASE}commercial-approvals/idCompany/${idCompany}`;
  } else {
    url = `${ALANUBE_API_BASE}commercial-approvals`;
  }
  const response = await axios.get(url, { headers: getHeaders(), timeout: 30000 });
  return response.data;
}

// ========== ACKNOWLEDGMENTS ==========

export async function getExternalAcknowledgments(idCompany: string, id?: string): Promise<any> {
  let url: string;
  if (id) {
    url = `${ALANUBE_API_BASE}reception-acknowledgments/${idCompany}/${id}`;
  } else {
    url = `${ALANUBE_API_BASE}reception-acknowledgments/${idCompany}`;
  }
  const response = await axios.get(url, { headers: getHeaders(), timeout: 30000 });
  return response.data;
}

export async function getInternalAcknowledgments(idCompany: string, id?: string): Promise<any> {
  let url: string;
  if (id) {
    url = `${ALANUBE_API_BASE}reception-receipts/${idCompany}/${id}`;
  } else {
    url = `${ALANUBE_API_BASE}reception-receipts/${idCompany}`;
  }
  const response = await axios.get(url, { headers: getHeaders(), timeout: 30000 });
  return response.data;
}

// ========== DGII STATUS ==========

export async function checkDgiiStatus(idCompany?: string): Promise<any> {
  const url = idCompany ? `${ALANUBE_API_BASE}check-dgii-status/idCompany/${idCompany}` : `${ALANUBE_API_BASE}check-dgii-status`;
  const response = await axios.get(url, { headers: getHeaders(), timeout: 30000 });
  return response.data;
}

// ========== DIRECTORY ==========

export async function checkDirectory(rnc?: string): Promise<any> {
  const url = `${ALANUBE_API_BASE}check-directory`;
  const params = rnc ? { rnc } : undefined;
  const response = await axios.get(url, { headers: getHeaders(), params, timeout: 30000 });
  return response.data;
}

// ========== PROVIDER INFO ==========

export async function getProviderInfo(): Promise<any> {
  const url = `${ALANUBE_API_BASE}provider-info`;
  const response = await axios.get(url, { headers: getHeaders(), timeout: 30000 });
  return response.data;
}

// ========== DOCUMENT TOTALS ==========

export async function getTotalEmittedDocuments(companyId: string): Promise<any> {
  const url = `${ALANUBE_API_BASE}companies/${companyId}/emitted-documents`;
  const response = await axios.get(url, { headers: getHeaders(), timeout: 30000 });
  return response.data;
}

export async function getTotalAcceptedDocuments(companyId: string): Promise<any> {
  const url = `${ALANUBE_API_BASE}companies/${companyId}/accepted-documents`;
  const response = await axios.get(url, { headers: getHeaders(), timeout: 30000 });
  return response.data;
}

export async function getTotalDocumentsByCompany(idCompany: string, query?: any): Promise<any> {
  const url = `${ALANUBE_API_BASE}reports/companies/${idCompany}/documents/total`;
  const response = await axios.get(url, { headers: getHeaders(), params: query, timeout: 30000 });
  return response.data;
}

// ========== CERTIFICATION / SIGNING ==========

export async function signDocument(certificatePayload: any, companyId?: string): Promise<any> {
  const url = companyId
    ? `${ALANUBE_API_BASE}company/${companyId}/certification/sign-document`
    : `${ALANUBE_API_BASE}company/certification/sign-document`;
  const response = await axios.post(url, certificatePayload, { headers: getHeaders(), timeout: 60000 });
  return response.data;
}

// ========== TEST SETS ==========

export async function createTestSet(payload: any): Promise<any> {
  const url = `${ALANUBE_API_BASE}company/test-set`;
  const response = await axios.post(url, payload, { headers: getHeaders(), timeout: 60000 });
  return response.data;
}

export async function checkTestSet(companyId?: string): Promise<any> {
  const url = companyId ? `${ALANUBE_API_BASE}company/${companyId}/test-set` : `${ALANUBE_API_BASE}company/test-set`;
  const response = await axios.get(url, { headers: getHeaders(), timeout: 30000 });
  return response.data;
}

// ========== DGII RECEPTION TEST ==========

export async function receiveDocumentFromDgii(payload: any): Promise<any> {
  const url = `${ALANUBE_API_BASE}reception-dgii/receive-document`;
  const response = await axios.post(url, payload, { headers: getHeaders(), timeout: 30000 });
  return response.data;
}
