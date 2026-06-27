const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();
(async () => {
  const maxResult = await p.$queryRawUnsafe('SELECT MAX(id) as max_id FROM facturas WHERE id_empresa = 1');
  console.log('Max invoice ID:', maxResult[0].max_id);
  const minResult = await p.$queryRawUnsafe('SELECT MIN(id) as min_id FROM facturas WHERE id_empresa = 1');
  console.log('Min invoice ID:', minResult[0].min_id);
  const countResult = await p.$queryRawUnsafe('SELECT COUNT(*) as cnt FROM facturas WHERE id_empresa = 1');
  console.log('Invoice count:', countResult[0].cnt);
  const e34NcfResult = await p.$queryRawUnsafe("SELECT id, ncf FROM facturas WHERE ncf LIKE 'E34%'");
  console.log('E34 invoices:', e34NcfResult.length);
  for (const r of e34NcfResult) console.log('  ID:', r.id, 'NCF:', r.ncf);
})();
