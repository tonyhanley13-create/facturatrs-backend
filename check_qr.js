const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function run() {
  try {
    const inv = await prisma.invoice.findFirst({
      where: {
        invoice_number: { endsWith: '17' },
        ncf: { endsWith: '23' }
      }
    });

    if (!inv) {
      console.log('Factura no encontrada.');
      return;
    }

    console.log('=== Invoice Details ===');
    console.log('Invoice Number:', inv.invoice_number);
    console.log('NCF:', inv.ncf);
    console.log('Custom Fields JSON:', inv.custom_fields);
  } catch (e) {
    console.error(e);
  } finally {
    await prisma.$disconnect();
  }
}

run();
