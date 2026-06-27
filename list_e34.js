const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    const invoices = await prisma.invoice.findMany({
        where: {
            document_type: { contains: 'Nota de Crédito' },
            ncf: { not: null }
        },
        take: 20,
        orderBy: { created_at: 'desc' }
    });

    console.log(`Recent E34 invoices:`);
    for (const inv of invoices) {
        console.log(`ID: ${inv.id} | NCF: ${inv.ncf} | Status: ${inv.status} | SentToAlanube: ${inv.status.includes('alanube')}`);
    }
}

main().catch(e => console.error(e)).finally(() => prisma.$disconnect());
