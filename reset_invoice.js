const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();
(async () => {
  // Reset E31 NCF counter to 1
  const company = await p.company.findFirst({ where: { rnc: '132196521' } });
  if (company?.ncf_ranges) {
    const ranges = typeof company.ncf_ranges === 'string' ? JSON.parse(company.ncf_ranges) : company.ncf_ranges;
    const e31 = ranges.find(function(r) { return r.type === 'E31'; });
    if (e31) {
      e31.next = 2;
      await p.company.update({
        where: { id: company.id },
        data: { ncf_ranges: JSON.stringify(ranges) },
      });
      console.log('Contador E31 resetado a 1');
    }
  }

  console.log('Listo. Ahora las nuevas facturas usarán E310000000001.');
})().catch(e => { console.error(e.message); }).finally(() => process.exit(0));
