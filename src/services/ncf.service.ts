import prisma from '../models/db';

export const NCF_PREFIXES: Record<string, string> = {
  // Electrónicos (e-CF)
  E31: 'E31', E32: 'E32', E33: 'E33', E34: 'E34',
  E41: 'E41', E43: 'E43', E44: 'E44', E45: 'E45', E46: 'E46', E47: 'E47',
  // Tradicionales (papel)
  B01: 'B01', B02: 'B02', B03: 'B03', B04: 'B04',
};

export const TRADITIONAL_TYPES = ['B01', 'B02', 'B03', 'B04'];
export const ELECTRONIC_TYPES = ['E31', 'E32', 'E33', 'E34', 'E41', 'E43', 'E44', 'E45', 'E46', 'E47'];

export function getNcfTypesForMode(mode: string): string[] {
  if (mode === 'tradicional') return TRADITIONAL_TYPES;
  if (mode === 'electronica') return ELECTRONIC_TYPES;
  return [...TRADITIONAL_TYPES, ...ELECTRONIC_TYPES]; // transicion: ambos
}

export function isTraditionalNcf(ncf: string): boolean {
  return TRADITIONAL_TYPES.some((t) => ncf.startsWith(t));
}

const TRADITIONAL_DOC_ALIASES: Record<string, string> = {
  'Factura de Credito Fiscal': 'B01',
  'Factura de Crédito Fiscal': 'B01',
  'Factura de Consumo': 'B02',
  'Nota de Debito': 'B03',
  'Nota de Débito': 'B03',
  'Nota de Credito': 'B04',
  'Nota de Crédito': 'B04',
};

export function resolveTraditionalType(documentType?: string): string {
  if (!documentType) return 'B01';
  const alias = TRADITIONAL_DOC_ALIASES[documentType];
  if (alias) return alias;
  const normalized = documentType.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase();
  if (NCF_PREFIXES[normalized] && TRADITIONAL_TYPES.includes(normalized)) return normalized;
  return 'B01';
}

export function canTransmitInvoice(mode: string, documentType?: string): boolean {
  if (mode === 'tradicional') return false;
  if (mode === 'electronica') return true;
  if (mode === 'transicion' && documentType) {
    const resolved = TRADITIONAL_TYPES.some((t) => documentType.startsWith(t));
    return !resolved;
  }
  return true;
}

export async function getNextNcfNumber(companyId: number, type: string): Promise<string> {
  const prefix = NCF_PREFIXES[type];
  if (!prefix) throw new Error(`Tipo de NCF inválido: ${type}`);

  return prisma.$transaction(async (tx) => {
    // Advisory lock per company to prevent concurrent NCF generation
    await tx.$executeRawUnsafe(`SELECT pg_advisory_xact_lock(${companyId})`);

    // 1. Buscar el último NCF emitido en la tabla de facturas para este prefijo
    const lastInvoiceWithNcf = await tx.invoice.findFirst({
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
    if (lastInvoiceWithNcf && lastInvoiceWithNcf.ncf) {
      const correlativeStr = lastInvoiceWithNcf.ncf.slice(prefix.length);
      const parsedNum = parseInt(correlativeStr, 10);
      if (!isNaN(parsedNum)) {
        lastDbNumber = parsedNum;
      }
    }

    const nextFromDb = lastDbNumber + 1;

    // 2. Obtener o crear la secuencia
    let seq = await tx.ncfSequence.findUnique({
      where: { company_id_type: { company_id: companyId, type } },
    });

    if (!seq) {
      seq = await tx.ncfSequence.create({
        data: {
          company_id: companyId,
          type,
          prefix,
          next: nextFromDb,
          end: 999999,
        },
      });
    } else if (seq.next < nextFromDb) {
      // Si la secuencia guardada en base de datos es menor que la última factura emitida, actualizarla
      seq = await tx.ncfSequence.update({
        where: { company_id_type: { company_id: companyId, type } },
        data: { next: nextFromDb },
      });
    }

    if (seq.next > seq.end) {
      // Auto-extender el rango en 10000 para evitar bloqueos
      await tx.ncfSequence.update({
        where: { company_id_type: { company_id: companyId, type } },
        data: { end: seq.end + 10000 },
      });
      seq.end = seq.end + 10000;
    }

    const digits = TRADITIONAL_TYPES.includes(type) ? 8 : 10;
    const number = seq.next.toString().padStart(digits, '0');
    const encf = `${prefix}${number}`;

    await tx.ncfSequence.update({
      where: { company_id_type: { company_id: companyId, type } },
      data: { next: seq.next + 1 },
    });

    return encf;
  });
}

export async function migrateNcfSequences(companyId: number) {
  const company = await prisma.company.findUnique({ where: { id: companyId } });
  if (!company?.ncf_ranges) return;

  let oldSequences: any[] = [];
  try {
    oldSequences = JSON.parse(company.ncf_ranges);
  } catch { return; }
  if (!Array.isArray(oldSequences)) return;

  for (const seq of oldSequences) {
    const type = seq.type || seq.prefix;
    if (!type || !NCF_PREFIXES[type]) continue;

    await prisma.ncfSequence.upsert({
      where: { company_id_type: { company_id: companyId, type } },
      create: {
        company_id: companyId,
        type,
        prefix: seq.prefix || type,
        next: Number(seq.next) || 1,
        end: Number(seq.end) || 999999,
      },
      update: {
        prefix: seq.prefix || type,
        next: Number(seq.next) || 1,
        end: Number(seq.end) || 999999,
      },
    });
  }
}

export async function getNcfSequences(companyId: number) {
  return prisma.ncfSequence.findMany({
    where: { company_id: companyId },
    orderBy: { type: 'asc' },
  });
}

export async function setNcfRange(
  companyId: number,
  type: string,
  next: number,
  end: number
) {
  const prefix = NCF_PREFIXES[type];
  if (!prefix) throw new Error(`Tipo de NCF inválido: ${type}`);

  return prisma.ncfSequence.upsert({
    where: { company_id_type: { company_id: companyId, type } },
    create: { company_id: companyId, type, prefix, next, end },
    update: { next, end },
  });
}

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
  'Factura de Credito Fiscal': 'E31',
  'Factura de Crédito Fiscal': 'E31',
  'Factura de Consumo': 'E32',
  'Nota de Debito': 'E33',
  'Nota de Débito': 'E33',
  'Nota de Credito': 'E34',
  'Nota de Crédito': 'E34',
  'Comprobante de Compras': 'E41',
  'Gastos Menores': 'E43',
  'Regimenes Especiales': 'E44',
  'Regímenes Especiales': 'E44',
  'Comprobante Gubernamental': 'E45',
  'Pagos al Exterior': 'E46',
  'Exportacion': 'E47',
  'Exportación': 'E47',
};

export function resolveType(documentType?: string): string {
  if (!documentType) return 'E32';
  const alias = DOCUMENT_TYPE_ALIASES[documentType];
  if (alias) return alias;
  const normalized = documentType.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase();
  if (DOCUMENT_TYPE_MAP[normalized]) return normalized;
  return 'E32';
}

export function getTypeInfo(documentType?: string) {
  const key = resolveType(documentType);
  return DOCUMENT_TYPE_MAP[key];
}
