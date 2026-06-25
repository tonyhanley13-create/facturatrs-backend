import { PrismaClient } from '@prisma/client';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.join(__dirname, '../.env') });

const prisma = new PrismaClient();

async function main() {
  console.log('--- VERIFICACIÓN DE DATOS DE LA DB ---');
  
  try {
    await prisma.$connect();
    
    // 1. Clientes
    const clients = await prisma.client.findMany();
    console.log(`\n👥 Clientes (${clients.length}):`);
    clients.forEach(c => console.log(`   - ${c.name} (RNC: ${c.rnc})`));
    
    // 2. Productos
    const products = await prisma.productService.findMany();
    console.log(`\n📦 Productos (${products.length}):`);
    products.forEach(p => console.log(`   - ${p.name} (Precio: ${p.unit_price})`));
    
    // 3. Facturas
    const invoices = await prisma.invoice.findMany({ 
      take: 5, 
      orderBy: { created_at: 'desc' },
      include: { client: true }
    });
    console.log(`\n📄 Últimas 5 Facturas:`);
    invoices.forEach(i => console.log(`   - ${i.invoice_number} | Cliente: ${i.client?.name || 'N/A'} | Total: ${i.total_amount}`));

  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

main();
