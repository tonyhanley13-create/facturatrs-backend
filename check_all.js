const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();
(async () => {
  const invoices = await p.invoice.findMany({
    where: { company_id: 1 },
    orderBy: { id: 'desc' },
    take: 10,
    include: { client: { select: { name: true } } },
  });
  for (const inv of invoices) {
    console.log(`#${inv.id} | NCF: ${inv.ncf || '-'} | Status: ${inv.status} | dgii: ${inv.dgii_status} | Cliente: ${inv.client?.name || '-'} | $$${Number(inv.total_amount).toFixed(2)} | Creada: ${inv.created_at}`);
  }
})().catch(e => console.error(e.message)).finally(() => process.exit(0));
