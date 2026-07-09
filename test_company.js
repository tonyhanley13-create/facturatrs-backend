const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
(async () => {
  try {
    const company = await prisma.company.findUnique({ where: { id: 1 } });
    console.log('Company:', JSON.stringify(company));
  } catch(e) {
    console.error('Error:', e.message);
  }
  await prisma.$disconnect();
})();
