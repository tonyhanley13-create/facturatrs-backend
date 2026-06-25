import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  const tables: any = await prisma.$queryRawUnsafe("SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_TYPE = 'BASE TABLE'");
  console.log('Tables in DB:', tables.map((t: any) => t.TABLE_NAME));
  
  for (const t of tables) {
    const tableName = t.TABLE_NAME;
    const count: any = await prisma.$queryRawUnsafe(`SELECT COUNT(*) as total FROM [${tableName}]`);
    console.log(`Table ${tableName}: ${count[0].total} rows`);
  }
}

main().finally(() => prisma.$disconnect());
