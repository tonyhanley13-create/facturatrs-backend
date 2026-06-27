import prisma from '../models/db';

const NCF_TYPE_MAP: Record<string, string> = {
  'Factura de Crédito Fiscal': '01',
  'Factura de Consumo': '02',
  'Nota de Débito': '03',
  'Nota de Crédito': '04',
  'Comprobante de Compras': '05',
  'Gastos Menores': '06',
  'Regímenes Especiales': '07',
  'Comprobante Gubernamental': '08',
  'Pagos al Exterior': '09',
  'Exportación': '10',
};

const NCF_PREFIX_MAP: Record<string, string> = {
  'E31': '01', 'E32': '02', 'E33': '03', 'E34': '04',
  'E41': '05', 'E43': '06', 'E44': '07', 'E45': '08',
  'E46': '09', 'E47': '10',
};

function getNcfTypeCode(ncf: string, documentType?: string | null): string {
  if (documentType && NCF_TYPE_MAP[documentType]) return NCF_TYPE_MAP[documentType];
  if (ncf) {
    const prefix = ncf.substring(0, 3);
    if (NCF_PREFIX_MAP[prefix]) return NCF_PREFIX_MAP[prefix];
  }
  return '01';
}

function xmlEscape(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

export async function generateReport606(companyId: number, year: number, month: number): Promise<string> {
  const startDate = new Date(Date.UTC(year, month - 1, 1));
  const endDate = new Date(Date.UTC(year, month, 0, 23, 59, 59, 999));

  const company = await prisma.company.findUnique({
    where: { id: companyId },
    select: { rnc: true, name: true },
  });
  if (!company) throw new Error('Empresa no encontrada');

  // 606 = Compras: registros manuales de compras ingresados por el usuario
  const purchases = await prisma.purchaseRecord.findMany({
    where: {
      company_id: companyId,
      fecha: { gte: startDate, lte: endDate },
    },
    orderBy: { ncf: 'asc' },
  });

  const rows = purchases.map((p) => ({
    ncf: p.ncf,
    rnc: p.rnc_proveedor,
    date: p.fecha.toISOString().split('T')[0],
    amount: Number(p.monto_total),
    itbis: Number(p.itbis),
    type: p.tipo_comprobante,
  }));

  const period = `${month.toString().padStart(2, '0')}/${year}`;

  let xml = '<?xml version="1.0" encoding="utf-8"?>\n';
  xml += '<eCF606 xmlns="http://www.dgii.gov.do/eCF606">\n';
  xml += '  <Cabezal>\n';
  xml += `    <Rnc>${xmlEscape(company.rnc)}</Rnc>\n`;
  xml += `    <RazonSocial>${xmlEscape(company.name)}</RazonSocial>\n`;
  xml += `    <Periodo>${xmlEscape(period)}</Periodo>\n`;
  xml += `    <CantidadRegistros>${rows.length}</CantidadRegistros>\n`;
  xml += '  </Cabezal>\n';
  xml += '  <Detalles>\n';

  for (const row of rows) {
    xml += '    <Detalle>\n';
    xml += `      <NCF>${xmlEscape(row.ncf)}</NCF>\n`;
    xml += `      <RncEmisor>${xmlEscape(row.rnc)}</RncEmisor>\n`;
    xml += `      <Fecha>${row.date}</Fecha>\n`;
    xml += `      <MontoTotal>${row.amount.toFixed(2)}</MontoTotal>\n`;
    xml += `      <ITBIS>${row.itbis.toFixed(2)}</ITBIS>\n`;
    xml += `      <TipoComprobante>${row.type}</TipoComprobante>\n`;
    xml += '    </Detalle>\n';
  }

  xml += '  </Detalles>\n';
  xml += '</eCF606>';

  return xml;
}

export async function generateReport607(companyId: number, year: number, month: number): Promise<string> {
  const startDate = new Date(Date.UTC(year, month - 1, 1));
  const endDate = new Date(Date.UTC(year, month, 0, 23, 59, 59, 999));

  const company = await prisma.company.findUnique({
    where: { id: companyId },
    select: { rnc: true, name: true },
  });
  if (!company) throw new Error('Empresa no encontrada');

  // 607 = Ventas: facturas emitidas a clientes
  const invoices = await prisma.invoice.findMany({
    where: {
      company_id: companyId,
      ncf: { not: null },
      dgii_status: { in: ['Aceptado', 'Aceptado Condicional'] },
      created_at: { gte: startDate, lte: endDate },
    },
    include: { client: true },
    orderBy: { ncf: 'asc' },
  });

  const rows = invoices.map((inv) => {
    const ncfType = getNcfTypeCode(inv.ncf || '', inv.document_type);
    return {
      ncf: inv.ncf || '',
      rnc: company.rnc,       // Nuestra empresa es la emisora
      name: inv.client.name,
      date: inv.created_at.toISOString().split('T')[0],
      amount: Number(inv.total_amount),
      type: ncfType,
    };
  });

  const period = `${month.toString().padStart(2, '0')}/${year}`;

  let xml = '<?xml version="1.0" encoding="utf-8"?>\n';
  xml += '<eCF607 xmlns="http://www.dgii.gov.do/eCF607">\n';
  xml += '  <Cabezal>\n';
  xml += `    <Rnc>${xmlEscape(company.rnc)}</Rnc>\n`;
  xml += `    <RazonSocial>${xmlEscape(company.name)}</RazonSocial>\n`;
  xml += `    <Periodo>${xmlEscape(period)}</Periodo>\n`;
  xml += `    <CantidadRegistros>${rows.length}</CantidadRegistros>\n`;
  xml += '  </Cabezal>\n';
  xml += '  <Detalles>\n';

  for (const row of rows) {
    xml += '    <Detalle>\n';
    xml += `      <NCF>${xmlEscape(row.ncf)}</NCF>\n`;
    xml += `      <RncEmisor>${xmlEscape(row.rnc)}</RncEmisor>\n`;
    xml += `      <Fecha>${row.date}</Fecha>\n`;
    xml += `      <MontoTotal>${row.amount.toFixed(2)}</MontoTotal>\n`;
    xml += `      <TipoComprobante>${row.type}</TipoComprobante>\n`;
    xml += '    </Detalle>\n';
  }

  xml += '  </Detalles>\n';
  xml += '</eCF607>';

  return xml;
}

export async function getOrCreateReport(companyId: number, type: string, year: number, month: number) {
  const existing = await prisma.dgiiReport.findUnique({
    where: {
      company_id_type_period_year_period_month: { company_id: companyId, type, period_year: year, period_month: month },
    },
  });
  if (existing) return existing;

  const xml = type === '606'
    ? await generateReport606(companyId, year, month)
    : await generateReport607(companyId, year, month);

  return prisma.dgiiReport.create({
    data: {
      company_id: companyId,
      type,
      period_year: year,
      period_month: month,
      status: 'generated',
      xml_content: xml,
    },
  });
}

export async function regenerateReport(companyId: number, type: string, year: number, month: number) {
  const xml = type === '606'
    ? await generateReport606(companyId, year, month)
    : await generateReport607(companyId, year, month);

  return prisma.dgiiReport.upsert({
    where: {
      company_id_type_period_year_period_month: { company_id: companyId, type, period_year: year, period_month: month },
    },
    update: { xml_content: xml, status: 'generated', error_message: null },
    create: {
      company_id: companyId,
      type,
      period_year: year,
      period_month: month,
      status: 'generated',
      xml_content: xml,
    },
  });
}

export async function listReports(companyId: number) {
  return prisma.dgiiReport.findMany({
    where: { company_id: companyId },
    orderBy: [{ period_year: 'desc' }, { period_month: 'desc' }, { type: 'asc' }],
  });
}
