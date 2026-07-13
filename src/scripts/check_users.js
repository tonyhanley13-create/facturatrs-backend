const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const users = await prisma.user.findMany();
  const ucs = await prisma.userCompany.findMany();
  const companies = await prisma.company.findMany();

  console.log("=== USUARIOS ===");
  users.forEach(u => console.log(`ID: ${u.id}, Username: ${u.username}, Super: ${u.is_super_admin}`));
  
  console.log("\n=== COMPAÑIAS ===");
  companies.forEach(c => console.log(`ID: ${c.id}, Name: ${c.name}`));

  console.log("\n=== USUARIOS EN COMPAÑIAS ===");
  ucs.forEach(uc => console.log(`UserID: ${uc.user_id}, CompanyID: ${uc.company_id}, Role: ${uc.role}, Perms: ${uc.permissions}`));
}

main().catch(console.error).finally(() => prisma.$disconnect());
