const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    const invoices = await prisma.invoice.findMany({
        where: {
            OR: [
                { status: { in: ['error', 'rejected_by_dgii'] } },
                { dgii_error: { not: null } }
            ]
        },
        take: 5,
        orderBy: { created_at: 'desc' }
    });

    console.log(`Recent error invoices:`);
    for (const inv of invoices) {
        console.log(`ID: ${inv.id} | NCF: ${inv.ncf} | Status: ${inv.status}`);
        console.log(`Error: ${inv.dgii_error}`);
        console.log('---');
    }
}

main().catch(e => console.error(e)).finally(() => prisma.$disconnect());
