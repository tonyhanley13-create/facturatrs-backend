import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const supervisors = await prisma.userCompany.findMany({
    where: { role: 'supervisor' }
  });

  console.log(`Found ${supervisors.length} supervisors to update.`);

  const newPerms = [
    'invoices:view',
    'invoices:create',
    'invoices:edit',
    'clients:view',
    'clients:manage',
    'products:view',
    'products:manage',
    'reports:view',
    'settings:view',
    'dgii:received',
    'dgii:contingency',
    'dgii:reports',
    'purchases:view',
    'purchases:create'
  ];

  for (const supervisor of supervisors) {
    let currentPerms: string[] = [];
    try {
      if (supervisor.permissions) {
        currentPerms = JSON.parse(supervisor.permissions);
      }
    } catch (e) {
      console.error(`Error parsing permissions for user ${supervisor.user_id}:`, e);
    }

    // Merge permissions keeping them unique
    const merged = Array.from(new Set([...currentPerms, ...newPerms]));
    
    await prisma.userCompany.update({
      where: {
        user_id_company_id: {
          user_id: supervisor.user_id,
          company_id: supervisor.company_id
        }
      },
      data: {
        permissions: JSON.stringify(merged)
      }
    });
    console.log(`Updated permissions for user ID ${supervisor.user_id} in company ID ${supervisor.company_id}`);
  }
  
  console.log('Update complete!');
}

main()
  .catch(e => console.error(e))
  .finally(() => prisma.$disconnect());
