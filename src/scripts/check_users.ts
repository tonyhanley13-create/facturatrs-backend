import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const userCompanies = await prisma.userCompany.findMany({
    include: {
      user: {
        select: {
          id: true,
          username: true,
          first_name: true,
          last_name: true,
          es_super_admin: true
        }
      },
      company: {
        select: {
          id: true,
          name: true
        }
      }
    }
  });

  console.log("=== USUARIOS Y PERMISOS ===");
  for (const uc of userCompanies) {
    console.log(`Usuario: ${uc.user.username} (${uc.user.first_name} ${uc.user.last_name || ''})`);
    console.log(`  Empresa: ${uc.company.name} (ID: ${uc.company_id})`);
    console.log(`  Rol: ${uc.role}`);
    console.log(`  Super Admin Global: ${uc.user.es_super_admin}`);
    console.log(`  Permisos: ${uc.permissions}`);
    console.log("------------------------");
  }
}

main()
  .catch(e => console.error(e))
  .finally(() => prisma.$disconnect());
