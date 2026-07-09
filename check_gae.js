const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    const invoices = await prisma.invoice.findMany({
        where: {
            custom_fields: { contains: 'gae_response' }
        },
        take: 10,
        orderBy: { created_at: 'desc' }
    });

    for (const inv of invoices) {
        const custom = JSON.parse(inv.custom_fields);
        console.log(`NCF: ${inv.ncf} | Status: ${inv.status}`);
        console.log('GAE Response:', JSON.stringify(custom.gae_response, null, 2));
        console.log('---');
    }
}

main().catch(e => console.error(e)).finally(() => prisma.$disconnect());
