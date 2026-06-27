import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
async function main() {
  const company = await prisma.company.findUnique({ where: { id: 1 }, select: { id: true, name: true, rnc: true, dgii_environment: true, fiscal_provider: true, certificate_name: true, certificate_expiry: true } });
  console.log('Company:', JSON.stringify(company, null, 2));
}
main().catch(e => console.error(e)).finally(() => prisma.$disconnect());
