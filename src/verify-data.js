const { PrismaClient } = require('@prisma/client');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.join(__dirname, '../.env') });

const prisma = new PrismaClient();

async function main() {
  console.log('--- VERIFICACIÓN DE DATOS DE LA DB (JS) ---');
  
  try {
    await prisma.$connect();
    
    const clients = await prisma.client.findMany();
    console.log(`\n👥 Clientes (${clients.length}):`);
    clients.forEach(c => console.log(`   - ${c.name} (RNC: ${c.rnc})`));
    
    const products = await prisma.product.findMany();
    console.log(`\n📦 Productos (${products.length}):`);
    products.forEach(p => console.log(`   - ${p.name} (Precio: ${p.price})`));
    
    const invoices = await prisma.invoice.findMany({ take: 3, orderBy: { createdAt: 'desc' } });
    console.log(`\n📄 Últimas Facturas:`);
    invoices.forEach(i => console.log(`   - ${i.number} | Cliente: ${i.clientName} | Total: ${i.total}`));

  } catch (error) {
    console.error('❌ Error en DB:', error.message);
  } finally {
    await prisma.$disconnect();
  }
}

main();
