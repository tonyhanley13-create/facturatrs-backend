import { PrismaClient } from '@prisma/client';
import dotenv from 'dotenv';
import path from 'path';

// Cargar .env
dotenv.config({ path: path.join(__dirname, '../.env') });

const prisma = new PrismaClient();

async function main() {
  console.log('🔍 Intentando conectar a la base de datos (Usando .env)...');
  console.log(`📡 URL: ${process.env.DATABASE_URL ? 'Configurada' : 'No definida'}`);
  
  try {
    await prisma.$connect();
    console.log('✅ Conexión exitosa a la base de datos SQL Server.');
    
    // Intentar una consulta simple
    const users = await prisma.user.findMany({ take: 5 });
    console.log(`📊 Usuarios encontrados: ${users.length}`);
    users.forEach(u => console.log(`   - ${u.email}`));
    
  } catch (error) {
    console.error('❌ Error al conectar:', error);
    console.log('\n💡 Tip: Verifica que el usuario SA y la contraseña sean correctos.');
  } finally {
    await prisma.$disconnect();
  }
}

main();
