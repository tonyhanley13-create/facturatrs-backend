import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  try {
    const clients = await prisma.client.findMany({
      where: { name: { contains: 'EUROPARTNERS', mode: 'insensitive' } }
    });
    console.log('Master DB clients:', clients.length);
    if (clients.length > 0) {
      console.log('Clients in master DB:', clients);
      const invoices = await prisma.invoice.findMany({
        where: { client_id: { in: clients.map(c => c.id) } }
      });
      console.log('Invoices for EUROPARTNERS in DB:', invoices.length);
      if (invoices.length > 0) {
        console.log('Sample invoice:', invoices[0]);
      }
    }
  } catch (err: any) {
    console.error('Error:', err);
  } finally {
    await prisma.$disconnect();
    process.exit(0);
  }
}

main();
