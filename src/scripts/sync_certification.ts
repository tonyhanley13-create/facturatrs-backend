import { PrismaClient } from '@prisma/client';

const localDbUrl = "postgresql://postgres.ewtacqiyschgtcpflzub:Kibalion2%40%40%21@aws-0-ca-central-1.pooler.supabase.com:5432/facturatrs_dev";

async function main() {
  // 1. Conectarse a Supabase (local) para leer la certificación
  const prismaLocal = new PrismaClient({
    datasources: {
      db: { url: localDbUrl }
    }
  });
  
  console.log("Connecting to Supabase (local)...");
  const localRecord = await prismaLocal.certificationProgress.findFirst({
    where: { company_id: 1 }
  });
  
  await prismaLocal.$disconnect();

  if (!localRecord) {
    console.log("No certification record found for company ID 1 in Supabase.");
    return;
  }

  console.log("Found local certification record for company ID 1.");

  // 2. Conectarse a la base de datos de producción (VPS)
  const prismaProd = new PrismaClient();
  console.log("Connecting to production DB...");

  // Excluir el campo ID autoincremental para evitar colisiones
  const { id, ...dataToInsert } = localRecord;

  // Insertar o actualizar en producción
  const result = await prismaProd.certificationProgress.upsert({
    where: { company_id: 1 },
    update: dataToInsert,
    create: {
      ...dataToInsert,
      company_id: 1
    }
  });

  console.log("Successfully synced certification progress to production!", result);
  await prismaProd.$disconnect();
}

main().catch(console.error);
