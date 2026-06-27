const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    const invoices = await prisma.invoice.findMany({
        where: {
            ncf: { startsWith: 'E34' }
        },
        take: 50,
        orderBy: { created_at: 'desc' }
    });

    console.log(`E34 invoices by NCF:`);
    for (const inv of invoices) {
        console.log(`ID: ${inv.id} | NCF: ${inv.ncf} | Status: ${inv.status} | Total: ${inv.total_amount}`);
    }
}

main().catch(e => console.error(e)).finally(() => prisma.$disconnect());
