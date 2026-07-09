const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
    const invoices = await prisma.invoice.findMany({
        where: {
            created_at: { gte: fiveMinutesAgo }
        },
        include: { items: true },
        orderBy: { created_at: 'desc' }
    });

    console.log(`Found ${invoices.length} invoices created in the last 5 minutes.`);
    for (const inv of invoices) {
        console.log('---');
        console.log(`ID: ${inv.id} | NCF: ${inv.ncf} | Status: ${inv.status} | Total: ${inv.total_amount}`);
        console.log('Custom Fields:', inv.custom_fields);
        if (inv.dgii_error) console.log('DGII Error:', inv.dgii_error);
    }
}

main().catch(e => console.error(e)).finally(() => prisma.$disconnect());
