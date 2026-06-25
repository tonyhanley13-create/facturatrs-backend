const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();
(async () => {
  const company = await p.company.findFirst({ where: { rnc: '132196521' } });
  if (!company?.certificate_content) { console.log('No certificate configured'); return; }

  const { ECF, P12Reader } = require('dgii-ecf');
  const reader = new P12Reader(company.certificate_password);
  const certs = reader.getKeyFromStringBase64(company.certificate_content);

  // Get all invoices with trackIds
  const invoices = await p.invoice.findMany({
    where: { company_id: company.id, dgii_track_id: { not: null } },
    orderBy: { created_at: 'desc' },
    include: { client: { select: { name: true } } },
  });

  if (invoices.length === 0) {
    console.log('No hay facturas con trackId en la BD local');
    return;
  }

  console.log(`Consultando ${invoices.length} facturas en DGII...\n`);

  const ecf = new ECF({ key: certs.key, cert: certs.cert }, 'CerteCF');
  await ecf.authenticate();

  for (const inv of invoices) {
    try {
      const result = await ecf.statusTrackId(inv.dgii_track_id);
      const aceptada = result?.estado?.toLowerCase().includes('acepta');
      console.log(
        `${aceptada ? '✅' : '❌'} Factura #${inv.invoice_number} | NCF: ${inv.ncf || '-'} | Cliente: ${inv.client?.name || '-'} | Monto: $${Number(inv.total_amount).toFixed(2)} | DGII: ${result?.estado || 'desconocido'}${result?.mensajes?.length ? ' | Msg: ' + result.mensajes.map((m) => m.valor).join('; ') : ''}`
      );
    } catch (e) {
      console.log(`⚠️  Factura #${inv.invoice_number} | Error al consultar: ${e.message}`);
    }
  }
})().catch(e => { console.error(e.message); }).finally(() => process.exit(0));
