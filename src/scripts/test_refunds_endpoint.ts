import prisma from '../models/db';

async function testEndpoint() {
  const companyId = 1;
  const whereClause: any = {
    company_id: companyId,
    OR: [
      { document_type: 'reembolso' },
      { invoice_number: { startsWith: 'RB-' } },
    ],
    status: { notIn: ['voided', 'anulada'] }
  };

  const invoices = await prisma.invoice.findMany({
    where: whereClause,
    include: {
      client: { select: { id: true, name: true, rnc: true } }
    },
    orderBy: { created_at: 'desc' }
  });

  console.log('--- DB QUERY RESULT FOR COMPANY 1 ---');
  console.log('Invoices count:', invoices.length);
  for (const inv of invoices) {
    console.log(`- ${inv.invoice_number} | type: ${inv.document_type} | status: ${inv.status} | payment_status: ${inv.payment_status} | total: ${inv.total_amount}`);
  }
}

testEndpoint()
  .catch((e) => console.error(e))
  .finally(() => prisma.$disconnect());
