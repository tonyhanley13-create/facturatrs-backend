const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    const window = new Date(Date.now() - 15 * 60 * 1000);
    const invoices = await prisma.invoice.findMany({
        where: {
            created_at: { gte: window }
        },
        orderBy: { created_at: 'desc' }
    });

    console.log(`Invoices in last 15 mins: ${invoices.length}`);
    for (const inv of invoices) {
        console.log(`ID: ${inv.id} | NCF: ${inv.ncf} | Status: ${inv.status} | Total: ${inv.total_amount}`);
        if (inv.dgii_error) console.log(`  Error: ${inv.dgii_error}`);
        console.log('---');
    }
}

main().catch(e => console.error(e)).finally(() => prisma.$disconnect());
