import prisma from '../models/db';
import ExcelJS from 'exceljs';

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

const ELECTRONIC_PREFIX_MAP: Record<string, string> = {
  'E31': '01', 'E32': '02', 'E33': '03', 'E34': '04',
  'E41': '05', 'E43': '06', 'E44': '07', 'E45': '08',
  'E46': '09', 'E47': '10',
};

const TRADITIONAL_PREFIX_MAP: Record<string, string> = {
  'B01': '01', 'B02': '02', 'B03': '03', 'B04': '04',
  'B11': '11', 'B12': '12', 'B13': '13', 'B14': '14',
  'B15': '15', 'B16': '16',
};

function getNcfTypeCode(ncf: string, documentType?: string | null): string {
  if (ncf) {
    const prefix = ncf.substring(0, 3).toUpperCase();
    if (prefix.startsWith('B')) {
      if (TRADITIONAL_PREFIX_MAP[prefix]) return TRADITIONAL_PREFIX_MAP[prefix];
    } else if (prefix.startsWith('E')) {
      if (ELECTRONIC_PREFIX_MAP[prefix]) return ELECTRONIC_PREFIX_MAP[prefix];
    }
  }
  if (documentType && NCF_TYPE_MAP[documentType]) {
    return NCF_TYPE_MAP[documentType];
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
  const companyRnc = company.rnc ?? '';
  const companyName = company.name ?? '';

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
  xml += `    <Rnc>${xmlEscape(companyRnc)}</Rnc>\n`;
  xml += `    <RazonSocial>${xmlEscape(companyName)}</RazonSocial>\n`;
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
    xml += `      <TipoBienesServiciosComprados>${row.type}</TipoBienesServiciosComprados>\n`;
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
  const companyRnc = company.rnc ?? '';
  const companyName = company.name ?? '';

  // 607 = Ventas: facturas emitidas a clientes (filtradas por estado de transmisión / tradicional)
  const invoices = await prisma.invoice.findMany({
    where: {
      company_id: companyId,
      ncf: { not: null },
      OR: [
        { dgii_status: { in: ['Aceptado', 'Aceptado Condicional'] } },
        // Facturas tradicionales (NCF empieza con 'B') no-draft
        { status: { not: 'draft' }, ncf: { startsWith: 'B' } },
      ],
      created_at: { gte: startDate, lte: endDate },
    },
    include: { client: true },
    orderBy: { ncf: 'asc' },
  });

  const rows = invoices.map((inv) => {
    const ncfType = getNcfTypeCode(inv.ncf || '', inv.document_type);
    const taxAmount = Number(inv.tax_amount || 0);
    const totalAmount = Number(inv.total_amount);
    return {
      ncf: inv.ncf || '',
      rncCliente: (inv.client.rnc || '').replace(/[^0-9]/g, ''),
      nombreCliente: inv.client.name,
      date: inv.created_at.toISOString().split('T')[0],
      amount: totalAmount,
      itbis: taxAmount,
      type: ncfType,
    };
  });

  const totalMonto = rows.reduce((s, r) => s + r.amount, 0);
  const totalItbis = rows.reduce((s, r) => s + r.itbis, 0);
  const period = `${month.toString().padStart(2, '0')}/${year}`;

  let xml = '<?xml version="1.0" encoding="utf-8"?>\n';
  xml += '<eCF607 xmlns="http://www.dgii.gov.do/eCF607">\n';
  xml += '  <Cabezal>\n';
  xml += `    <Rnc>${xmlEscape(companyRnc)}</Rnc>\n`;
  xml += `    <RazonSocial>${xmlEscape(companyName)}</RazonSocial>\n`;
  xml += `    <Periodo>${xmlEscape(period)}</Periodo>\n`;
  xml += `    <CantidadRegistros>${rows.length}</CantidadRegistros>\n`;
  xml += `    <TotalMontoFacturado>${totalMonto.toFixed(2)}</TotalMontoFacturado>\n`;
  xml += `    <TotalITBIS>${totalItbis.toFixed(2)}</TotalITBIS>\n`;
  xml += '  </Cabezal>\n';
  xml += '  <Detalles>\n';

  for (const row of rows) {
    xml += '    <Detalle>\n';
    xml += `      <NCF>${xmlEscape(row.ncf)}</NCF>\n`;
    xml += `      <RncComprador>${xmlEscape(row.rncCliente)}</RncComprador>\n`;
    xml += `      <NombreComprador>${xmlEscape(row.nombreCliente)}</NombreComprador>\n`;
    xml += `      <Fecha>${row.date}</Fecha>\n`;
    xml += `      <MontoTotal>${row.amount.toFixed(2)}</MontoTotal>\n`;
    xml += `      <MontoITBIS>${row.itbis.toFixed(2)}</MontoITBIS>\n`;
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

export async function generateReportExcel(companyId: number, type: string, year: number, month: number): Promise<any> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet(`${type}_${year}_${month.toString().padStart(2, '0')}`);

  const startDate = new Date(Date.UTC(year, month - 1, 1));
  const endDate = new Date(Date.UTC(year, month, 0, 23, 59, 59, 999));

  if (type === '606') {
    sheet.columns = [
      { header: 'RNC/Cédula Proveedor', key: 'rnc', width: 25 },
      { header: 'Nombre Proveedor', key: 'nombre', width: 35 },
      { header: 'Tipo de Gasto (Bienes y Servicios)', key: 'tipo', width: 45 },
      { header: 'NCF', key: 'ncf', width: 20 },
      { header: 'Fecha Emisión', key: 'fecha', width: 15 },
      { header: 'Monto Total', key: 'monto', width: 18 },
      { header: 'ITBIS Facturado', key: 'itbis', width: 18 },
    ];

    const purchases = await prisma.purchaseRecord.findMany({
      where: { company_id: companyId, fecha: { gte: startDate, lte: endDate } },
      orderBy: { ncf: 'asc' },
    });

    const tipos606: Record<string, string> = {
      '01': '01 - Gastos de Personal',
      '02': '02 - Gastos por Trabajos, Suministros y Servicios',
      '03': '03 - Arrendamientos',
      '04': '04 - Gastos de Activos Fijos',
      '05': '05 - Gastos de Representación',
      '06': '06 - Otras Deducciones Admitidas',
      '07': '07 - Gastos Financieros',
      '08': '08 - Gastos Extraordinarios',
      '09': '09 - Compras y Gastos (Costo de Venta)',
      '10': '10 - Adquisiciones de Activos',
      '11': '11 - Gastos de Seguros',
    };

    for (const p of purchases) {
      sheet.addRow({
        rnc: p.rnc_proveedor,
        nombre: p.nombre_proveedor,
        tipo: tipos606[p.tipo_comprobante] || p.tipo_comprobante,
        ncf: p.ncf,
        fecha: p.fecha.toISOString().split('T')[0],
        monto: Number(p.monto_total),
        itbis: Number(p.itbis),
      });
    }
  } else {
    sheet.columns = [
      { header: 'RNC/Cédula Cliente', key: 'rnc', width: 25 },
      { header: 'Nombre Cliente', key: 'nombre', width: 35 },
      { header: 'Tipo de Comprobante', key: 'tipo', width: 35 },
      { header: 'NCF', key: 'ncf', width: 20 },
      { header: 'Fecha Emisión', key: 'fecha', width: 15 },
      { header: 'Monto Total', key: 'monto', width: 18 },
    ];

    // Excel 607: incluye facturas electrónicas aceptadas Y facturas tradicionales emitidas
    const invoices = await prisma.invoice.findMany({
      where: {
        company_id: companyId,
        ncf: { not: null },
        OR: [
          { dgii_status: { in: ['Aceptado', 'Aceptado Condicional'] } },
          { status: { not: 'draft' }, ncf: { startsWith: 'B' } },
        ],
        created_at: { gte: startDate, lte: endDate },
      },
      include: { client: true },
      orderBy: { ncf: 'asc' },
    });

    const tipos607: Record<string, string> = {
      '01': 'Factura de Crédito Fiscal (01)',
      '02': 'Factura de Consumo (02)',
      '03': 'Nota de Débito (03)',
      '04': 'Nota de Crédito (04)',
      '05': 'Comprobante de Compras (05)',
      '06': 'Gastos Menores (06)',
      '07': 'Regímenes Especiales (07)',
      '08': 'Comprobante Gubernamental (08)',
      '09': 'Pagos al Exterior (09)',
      '10': 'Exportación (10)',
    };

    for (const inv of invoices) {
      const ncfType = getNcfTypeCode(inv.ncf || '', inv.document_type);
      sheet.addRow({
        rnc: inv.client.rnc || '',
        nombre: inv.client.name,
        tipo: tipos607[ncfType] || ncfType,
        ncf: inv.ncf,
        fecha: inv.created_at.toISOString().split('T')[0],
        monto: Number(inv.total_amount),
      });
    }
  }

  const headerRow = sheet.getRow(1);
  headerRow.font = { name: 'Arial', family: 4, size: 11, bold: true, color: { argb: 'FFFFFFFF' } };
  headerRow.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FF1F497D' },
  };
  headerRow.alignment = { vertical: 'middle', horizontal: 'center' };

  sheet.eachRow((row, rowNumber) => {
    if (rowNumber > 1) {
      if (type === '606') {
        row.getCell('monto').numFmt = '"RD$"#,##0.00';
        row.getCell('itbis').numFmt = '"RD$"#,##0.00';
      } else {
        row.getCell('monto').numFmt = '"RD$"#,##0.00';
      }
    }
  });

  return workbook.xlsx.writeBuffer() as any;
}

export async function generateReportTxt(companyId: number, type: string, year: number, month: number): Promise<string> {
  const company = await prisma.company.findUnique({
    where: { id: companyId },
  });
  if (!company) throw new Error('Empresa no encontrada');

  const startDate = new Date(Date.UTC(year, month - 1, 1));
  const endDate = new Date(Date.UTC(year, month, 0, 23, 59, 59, 999));

  let lines: string[] = [];

  const formattedRnc = (company.rnc || '').replace(/[^0-9]/g, '');
  const periodStr = `${year}${month.toString().padStart(2, '0')}`;

  if (type === '606') {
    const purchases = await prisma.purchaseRecord.findMany({
      where: { company_id: companyId, fecha: { gte: startDate, lte: endDate } },
      orderBy: { ncf: 'asc' },
    });

    lines.push(`${formattedRnc}|${periodStr}|${purchases.length}`);

    for (const p of purchases) {
      const rncProv = p.rnc_proveedor.replace(/[^0-9]/g, '');
      const tipoId = rncProv.length === 9 ? '1' : rncProv.length === 11 ? '2' : '3';
      const tipoGasto = p.tipo_comprobante.padStart(2, '0');
      const ncf = p.ncf;
      const ncfModificado = '';
      const fechaComprobante = p.fecha.toISOString().split('T')[0].replace(/-/g, '');
      const fechaPago = fechaComprobante;

      const isServ = ['01', '02', '03', '05', '07', '11'].includes(p.tipo_comprobante);
      const montoTotal = Number(p.monto_total);
      const montoServicios = isServ ? montoTotal.toFixed(2) : '0.00';
      const montoBienes = !isServ ? montoTotal.toFixed(2) : '0.00';

      const total = montoTotal.toFixed(2);
      const itbis = Number(p.itbis).toFixed(2);

      const cols = [
        rncProv,
        tipoId,
        tipoGasto,
        ncf,
        ncfModificado,
        fechaComprobante,
        fechaPago,
        montoServicios,
        montoBienes,
        total,
        itbis,
        '0.00',
        '0.00',
        '0.00',
        itbis,
        '0.00',
        '',
        '0.00',
        '0.00',
        '0.00',
        '0.00',
        '0.00',
        '04',
      ];

      lines.push(cols.join('|'));
    }
  } else {
    // 607 TXT: incluye facturas electrónicas aceptadas Y facturas tradicionales emitidas
    const invoices = await prisma.invoice.findMany({
      where: {
        company_id: companyId,
        ncf: { not: null },
        OR: [
          { dgii_status: { in: ['Aceptado', 'Aceptado Condicional'] } },
          // Facturas tradicionales (NCF empieza con 'B') no-draft
          { status: { not: 'draft' }, ncf: { startsWith: 'B' } },
        ],
        created_at: { gte: startDate, lte: endDate },
      },
      include: { client: true },
      orderBy: { ncf: 'asc' },
    });

    lines.push(`${formattedRnc}|${periodStr}|${invoices.length}`);

    for (const inv of invoices) {
      const rncCli = (inv.client.rnc || '').replace(/[^0-9]/g, '');
      const tipoId = rncCli.length === 9 ? '1' : rncCli.length === 11 ? '2' : '3';
      const ncf = inv.ncf || '';
      const ncfModificado = '';
      const tipoIngreso = '01';
      const fechaComprobante = inv.created_at.toISOString().split('T')[0].replace(/-/g, '');
      const fechaRetencion = '';

      const totalAmount = Number(inv.total_amount);
      const taxAmount = Number(inv.tax_amount || 0);
      const subtotal = (totalAmount - taxAmount).toFixed(2);
      const itbis = taxAmount.toFixed(2);

      const isCredit = inv.payment_status === 'pending';
      const cols = [
        rncCli,
        tipoId,
        ncf,
        ncfModificado,
        tipoIngreso,
        fechaComprobante,
        fechaRetencion,
        subtotal,
        itbis,
        '0.00',
        '0.00',
        '0.00',
        '0.00',
        '0.00',
        '0.00',
        '0.00',
        !isCredit ? totalAmount.toFixed(2) : '0.00',
        '0.00',
        '0.00',
        isCredit ? totalAmount.toFixed(2) : '0.00',
        '0.00',
        '0.00',
      ];

      lines.push(cols.join('|'));
    }
  }

  return lines.join('\r\n');
}
