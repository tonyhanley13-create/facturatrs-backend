const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();
(async () => {
  // Check company environment
  const company = await p.company.findFirst({ where: { rnc: '132196521' }, select: { name: true, dgii_environment: true, certificate_content: true, certificate_password: true } });
  console.log('Company:', JSON.stringify(company, null, 2));

  if (!company?.certificate_content) {
    console.log('No hay certificado');
    return;
  }

  // Try checking status in both environments
  const { ECF, P12Reader } = require('dgii-ecf');
  const reader = new P12Reader(company.certificate_password);
  const certs = reader.getKeyFromStringBase64(company.certificate_content);

  for (const envName of ['CerteCF', 'TesteCF', 'eCF']) {
    try {
      console.log(`\n--- Consultando en ${envName} ---`);
      const ecf = new ECF({ key: certs.key, cert: certs.cert }, envName);
      await ecf.authenticate();
      const result = await ecf.statusTrackId('69d9a51e-97b1-47b2-8e04-0fbdd832f902');
      console.log(JSON.stringify(result, null, 2));
    } catch (e) {
      console.log(`Error en ${envName}: ${e.message}`);
    }
  }
})().catch(e => { console.error(e.message); }).finally(() => process.exit(0));
