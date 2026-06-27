import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
async function main() {
  await prisma.ncfSequence.update({
    where: { company_id_type: { company_id: 1, type: 'E34' } },
    data: { next: 1 },
  });
  console.log('Reset E34 next to 1');
}
main().catch(e => console.error(e)).finally(() => prisma.$disconnect());
