const { PrismaClient } = require('@prisma/client');
const dotenv = require('dotenv');
const path = require('path');

// Cargar .env
dotenv.config({ path: path.join(__dirname, '../.env') });

const prisma = new PrismaClient();

async function main() {
  console.log('🔍 Intentando conectar a la base de datos (Node JS)...');
  console.log('📡 URL:', process.env.DATABASE_URL);
  
  try {
    const start = Date.now();
    await prisma.$connect();
    const end = Date.now();
    console.log(`✅ Conexión exitosa a la base de datos SQL Server (${end - start}ms).`);
    
    // Intentar una consulta simple
    const users = await prisma.user.findMany({ take: 5 });
    console.log(`📊 Usuarios encontrados: ${users.length}`);
    users.forEach(u => console.log(`   - ${u.email}`));
    
  } catch (error) {
    console.error('❌ Error al conectar:', error.message);
  } finally {
    await prisma.$disconnect();
  }
}

main();
