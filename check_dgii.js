const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();
(async () => {
  const company = await p.company.findFirst({ where: { rnc: '132196521' } });
  if (!company?.certificate_content) { console.log('No certificate'); return; }
  const { ECF, P12Reader } = require('dgii-ecf');
  const reader = new P12Reader(company.certificate_password);
  const certs = reader.getKeyFromStringBase64(company.certificate_content);

  // Check invoice 2049 status
  const inv = await p.invoice.findUnique({ where: { id: 2049 }, include: { client: true } });
  if (!inv) { console.log('Invoice not found'); return; }

  console.log(`Factura #${inv.id}: NCF=${inv.ncf}, Status local=${inv.status}, dgii_status=${inv.dgii_status}`);

  const ecf = new ECF({ key: certs.key, cert: certs.cert }, 'CerteCF');
  await ecf.authenticate();

  // Get trackId from custom_fields
  let trackId = inv.dgii_track_id;
  if (!trackId && inv.custom_fields) {
    try {
      const cf = JSON.parse(inv.custom_fields);
      trackId = cf.track_id;
    } catch (_) {}
  }
  console.log(`TrackId: ${trackId || 'NO TRACK ID'}`);

  if (trackId) {
    try {
      const st = await ecf.statusTrackId(trackId);
      console.log('DGII Status:', JSON.stringify(st, null, 2));
    } catch (e) {
      console.log('Error checking trackId:', e.message);
    }
  }

  // Also check by NCF directly
  // Try TesteCF (company environment is "Test" -> TesteCF)
  console.log('\n--- Consultando en TesteCF ---');
  try {
    const ecf2 = new ECF({ key: certs.key, cert: certs.cert }, 'TesteCF');
    await ecf2.authenticate();
    if (trackId) {
      const st2 = await ecf2.statusTrackId(trackId);
      console.log('TesteCF Status by trackId:', JSON.stringify(st2, null, 2));
    }
    // Try inquiry by eNCF + RNC
    try {
      const inq = await ecf2.inquiryStatus(inv.ncf, company.rnc);
      console.log('TesteCF Inquiry by NCF:', JSON.stringify(inq, null, 2));
    } catch (e2) {
      console.log('TesteCF Inquiry error:', e2.message);
    }
  } catch (e) {
    console.log('TesteCF error:', e.message);
  }

})().catch(e => { console.error(e.message); }).finally(() => process.exit(0));
