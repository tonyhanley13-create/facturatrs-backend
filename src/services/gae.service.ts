import axios from 'axios';
import FormData from 'form-data';
import { GAE_API_URL, GAE_API_KEY } from '../config';

const BASE = GAE_API_URL.endsWith('/') ? GAE_API_URL : `${GAE_API_URL}/`;

const headers = () => ({
  'Content-Type': 'application/json',
  'Accept': 'application/json',
  ...(GAE_API_KEY ? { 'ApiKey': GAE_API_KEY } : {}),
});

// ── Types ────────────────────────────────────────────────────────────

export interface GaeAditionalTax {
  type: string;
  rate: number;
  amount: number;
}

export interface GaeAdjustment {
  adjutmentType: string;
  valueType: string;
  value: number;
}

export interface GaeInvoiceItem {
  lineNumber: number;
  retentionAgentInd?: number | null;
  itbisRetAmount?: number | null;
  isrRetAmount?: number | null;
  itemDescription: string;
  serviceInd: string;
  itemQuantity: number;
  unitMeasure: string;
  unitPrice: number;
  itemAmount: number;
  TaxTypes: number;
  discountAmount?: number | null;
  surchargeAmount?: number | null;
  aditionalTaxes?: GaeAditionalTax[] | null;
  adjustments?: GaeAdjustment[] | null;
}

export interface GaePayment {
  type: number;
  amount: number;
}

export interface GaeInvoiceAdjustment {
  lineNumber: number;
  adjustmentType: string;
  taxCategory: number;
  description: string;
  valueType: string;
  value: number;
  InvoiceDocumnetId?: number;
}

export interface GaeSourceInformation {
  BranchId?: number;
  IdIssuePoint?: number;
  Exercise?: number;
  Period?: number;
}

export interface GaePagination {
  pageNumber: number;
  startLineNum: number;
  endLineNum: number;
  subtotalTaxedAmount?: number;
  subtotalRate1?: number;
  subtotalRate2?: number;
  subtotalRate3?: number;
  subtotalExempt?: number;
  subtotalItbis?: number;
  subtotalItbis1?: number;
  subtotalItbis2?: number;
  subtotalItbis3?: number;
  grandSubtotalPage?: number;
}

export interface GaeInvoicePayload {
  InvoiceNumber?: string | null;
  ecf: string;
  ecfType: string;
  sellerRnc: string;
  sellerCode?: string;
  sequenceExpDate?: string | null;
  creditNoteInd?: number | null;
  taxedAmountInd?: number;
  incomeType?: string;
  paymentCondition?: string;
  paymentDeadline?: string | null;
  initBillingPeriod?: string | null;
  EndBillingPeriod?: string | null;
  foreignDni?: string | null;
  issueDate?: string | null;
  buyerRnc?: string | null;
  buyerBusinessName?: string | null;
  buyerAddress?: string | null;
  buyerPhone?: string | null;
  currencyType?: string;
  exchangeRate?: number;
  modifiedNcf?: string | null;
  rncNcfModified?: string | null;
  modifDateNcf?: string | null;
  modifReasonId?: number | null;
  modifReasonDesc?: string | null;
  InvoiceTotalAmount: number;
  TotalTaxedAmount: number;
  PdfFile?: string | null;
  Enviroment?: string;
  SourceInformation?: GaeSourceInformation | null;
  items?: GaeInvoiceItem[] | null;
  payments?: GaePayment[] | null;
  invoiceAdjustements?: GaeInvoiceAdjustment[] | null;
  pagination?: GaePagination[] | null;
}

// ── Endpoints ────────────────────────────────────────────────────────

export async function ecoCheck(): Promise<{ success: boolean; message: string }> {
  try {
    const url = `${BASE}Eco`;
    const response = await axios.get(url, { headers: headers(), timeout: 15000 });
    return {
      success: response.status === 200,
      message: response.status === 200 ? 'GAE conectado' : `GAE respondió: ${response.status}`,
    };
  } catch (error: any) {
    return { success: false, message: `Error conectando con GAE: ${error.message}` };
  }
}

export async function createGaeInvoice(payload: GaeInvoicePayload): Promise<any> {
  const url = `${BASE}Invoice`;
  const response = await axios.post(url, payload, { headers: headers(), timeout: 60000 });
  return response.data;
}

export async function getInvoiceInfo(rnc: string, ecf: string): Promise<any> {
  const url = `${BASE}Invoice/GetInvoiceInfo`;
  const response = await axios.get(url, {
    headers: headers(),
    params: { rnc, ecf },
    timeout: 30000,
  });
  return response.data;
}

export async function getInvoiceStatus(rnc: string, ecf: string): Promise<any> {
  const url = `${BASE}Invoice/GetInvoiceStatus`;
  const response = await axios.get(url, {
    headers: headers(),
    params: { rnc, ecf },
    timeout: 30000,
  });
  return response.data;
}

export async function signFile(rnc: string, fileBuffer: Buffer, fileName: string): Promise<any> {
  const url = `${BASE}Sign/SignFile`;
  const form = new FormData();
  form.append('rnc', rnc);
  form.append('file', fileBuffer, fileName);

  const response = await axios.post(url, form, {
    headers: { ...form.getHeaders(), ...(GAE_API_KEY ? { 'ApiKey': GAE_API_KEY } : {}) },
    timeout: 60000,
  });
  return response.data;
}

export async function createCommercialApproval(data: {
  xmlFile?: string;
  ecf: string;
  approved: boolean;
  buyerRnc: string;
  invoiceDocumentId: number;
}): Promise<any> {
  const url = `${BASE}Invoice/CreateComercialAproval`;
  const response = await axios.post(url, data, { headers: headers(), timeout: 30000 });
  return response.data;
}

export async function getApprovalCommercialInfo(rnc: string, ecf: string): Promise<any> {
  const url = `${BASE}Invoice/GetApprovalCommercialInfo`;
  const response = await axios.get(url, {
    headers: headers(),
    params: { rnc, ecf },
    timeout: 30000,
  });
  return response.data;
}
