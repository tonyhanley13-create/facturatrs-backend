import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
async function main() {
  await prisma.ncfSequence.upsert({
    where: { company_id_type: { company_id: 1, type: 'E34' } },
    create: { company_id: 1, type: 'E34', prefix: 'E34', next: 1, end: 100 },
    update: { next: 1, end: 100 },
  });
  console.log('E34 range reset to next=1, end=100');
  await prisma.ncfSequence.upsert({
    where: { company_id_type: { company_id: 1, type: 'E33' } },
    create: { company_id: 1, type: 'E33', prefix: 'E33', next: 1, end: 100 },
    update: { next: 1, end: 100 },
  });
  console.log('E33 range reset to next=1, end=100');
  // Also extend E32 and E31
  const e32 = await prisma.ncfSequence.findFirst({ where: { company_id: 1, type: 'E32' } });
  if (e32 && e32.next > e32.end) {
    await prisma.ncfSequence.update({ where: { id: e32.id }, data: { end: e32.end + 100 } });
    console.log('E32 range extended');
  }
  const e31 = await prisma.ncfSequence.findFirst({ where: { company_id: 1, type: 'E31' } });
  if (e31 && e31.next > e31.end) {
    await prisma.ncfSequence.update({ where: { id: e31.id }, data: { end: e31.end + 100 } });
    console.log('E31 range extended');
  }
  // Reset contingency invoices to allow retry
  await prisma.invoice.updateMany({
    where: { company_id: 1, dgii_contingency: true, dgii_error: { contains: 'Rango NCF agotado' } },
    data: { dgii_contingency: false, dgii_status: null, dgii_error: null as any },
  });
  console.log('Reset contingency invoices with range errors');
}
main().catch(e => console.error(e)).finally(() => prisma.$disconnect());
