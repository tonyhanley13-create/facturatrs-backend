const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    const ids = [11, 19];
    const invoices = await prisma.invoice.findMany({
        where: { id: { in: ids } },
        include: { items: true }
    });

    for (const inv of invoices) {
        console.log('=== INVOICE DETAILS ===');
        console.log(`ID: ${inv.id} | NCF: ${inv.ncf} | Status: ${inv.status}`);
        console.log(`Total: ${inv.total_amount} | Subtotal: ${inv.subtotal} | Tax: ${inv.tax_amount}`);
        console.log('Custom Fields:', JSON.stringify(JSON.parse(inv.custom_fields || '{}'), null, 2));
        console.log('Items:', JSON.stringify(inv.items, null, 2));
        console.log('---');
    }
}

main().catch(e => console.error(e)).finally(() => prisma.$disconnect());
