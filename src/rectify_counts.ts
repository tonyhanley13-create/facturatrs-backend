import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  const result = await prisma.$queryRawUnsafe<{total: bigint}[]>("SELECT COUNT(id) as total FROM productos_servicios");
  console.log('Total services in DB:', result[0].total.toString());
  
  const user15 = await prisma.$queryRawUnsafe<{total: bigint}[]>("SELECT COUNT(id) as total FROM productos_servicios WHERE id_usuario = 15");
  console.log('Services for user 15:', user15[0].total.toString());
}

main().finally(() => prisma.$disconnect());
