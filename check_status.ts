import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
async function main() {
  const ranges = await prisma.ncfSequence.findMany({ where: { company_id: 1 } });
  ranges.forEach(s => console.log(s.type, s.next + '/' + s.end));
  const count = await prisma.invoice.count({ where: { company_id: 1, dgii_contingency: true } });
  console.log('contingency count:', count);
  const conv = await prisma.invoice.findMany({
    where: { company_id: 1, dgii_contingency: true },
    select: { id: true, invoice_number: true, dgii_error: true },
  });
  console.log('contingency invoices:', JSON.stringify(conv));
}
main().catch(e => console.error(e)).finally(() => prisma.$disconnect());
