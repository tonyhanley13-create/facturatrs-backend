import prisma from '../models/db';

async function main() {
  const companies = await prisma.company.findMany({
    select: { id: true, name: true, rnc: true },
  });

  console.log('--- COMPAÑÍAS ---');
  console.log(companies);

  for (const c of companies) {
    const totalInvoices = await prisma.invoice.count({
      where: { company_id: c.id },
    });
    const refundInvoices = await prisma.invoice.count({
      where: {
        company_id: c.id,
        OR: [
          { document_type: 'reembolso' },
          { invoice_number: { startsWith: 'RB-' } },
        ],
      },
    });
    const creditRefunds = await prisma.invoice.count({
      where: {
        company_id: c.id,
        OR: [
          { document_type: 'reembolso' },
          { invoice_number: { startsWith: 'RB-' } },
        ],
        payment_status: 'pending',
      },
    });
    const paidRefunds = await prisma.invoice.count({
      where: {
        company_id: c.id,
        OR: [
          { document_type: 'reembolso' },
          { invoice_number: { startsWith: 'RB-' } },
        ],
        payment_status: 'paid',
      },
    });

    console.log(`Empresa ${c.id} (${c.name}): Total Facturas=${totalInvoices}, Reembolsos Totales=${refundInvoices} (Pendientes/Crédito=${creditRefunds}, Pagados/Contado=${paidRefunds})`);
  }
}

main()
  .catch((e) => console.error(e))
  .finally(() => prisma.$disconnect());
