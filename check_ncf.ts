import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
async function main() {
  const invoices = await prisma.invoice.findMany({
    where: { company_id: 1 },
    take: 20,
    orderBy: { id: 'desc' },
    select: { id: true, ncf: true, status: true, document_type: true, invoice_number: true, created_at: true },
  });
  console.log('Recent invoices:');
  for (const inv of invoices) {
    const hasNcf = inv.ncf ? 'HAS NCF' : 'no ncf';
    console.log(`  #${inv.id} ${inv.invoice_number} | status=${inv.status} | ncf=${inv.ncf || 'null'} | type=${inv.document_type || 'null'}`);
  }
  // Check for invoices with NCF but draft or error status
  const mixed = invoices.filter(i => i.ncf && (i.status === 'draft' || i.status === 'error'));
  console.log('\nInvoices with NCF but draft/error status:', mixed.length);
}
main().catch(e => console.error(e)).finally(() => prisma.$disconnect());
