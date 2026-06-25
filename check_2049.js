const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();
(async () => {
  const inv = await p.invoice.findUnique({
    where: { id: 2049 },
    include: { company: true },
  });
  if (!inv) { console.log('Not found'); return; }
  console.log('Invoice:', inv.id, 'NCF:', inv.ncf, 'Status:', inv.status, 'dgii_status:', inv.dgii_status, 'trackId:', inv.dgii_track_id);

  const company = inv.company;
  const { ECF, P12Reader } = require('dgii-ecf');
  const reader = new P12Reader(company.certificate_password);
  const certs = reader.getKeyFromStringBase64(company.certificate_content);

  const ecf = new ECF({ key: certs.key, cert: certs.cert }, 'TesteCF');
  await ecf.authenticate();
  const result = await ecf.statusTrackId(inv.dgii_track_id);
  console.log('TesteCF:', JSON.stringify(result));
})().catch(e => console.error(e.message)).finally(() => process.exit(0));
