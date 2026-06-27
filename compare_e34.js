const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    const query = '32'; // The suffix the user mentioned
    const invoices = await prisma.invoice.findMany({
        where: {
            ncf: { contains: query },
            document_type: { contains: 'Nota de Crédito' }
        },
        include: { items: true }
    });

    console.log(`Found ${invoices.length} invoices matching E34...${query}`);

    for (const inv of invoices) {
        console.log('---');
        console.log(`ID: ${inv.id} | NCF: ${inv.ncf} | Status: ${inv.status}`);
        console.log(`Total: ${inv.total_amount} | ITBIS: ${inv.tax_amount}`);
        console.log('Custom Fields:', inv.custom_fields);
        if (inv.dgii_signed_xml) {
            console.log('XML snippet (Totales):', inv.dgii_signed_xml.match(/<Totales>[\s\S]*?<\/Totales>/)?.[0]);
        }
    }

    // Also find rejected E34s for comparison
    const rejected = await prisma.invoice.findMany({
        where: {
            status: { in: ['rejected_by_dgii', 'error'] },
            document_type: { contains: 'Nota de Crédito' }
        },
        take: 3,
        orderBy: { created_at: 'desc' },
        include: { items: true }
    });

    console.log('\n--- REJECTED INVOICES FOR COMPARISON ---');
    for (const inv of rejected) {
        console.log(`ID: ${inv.id} | NCF: ${inv.ncf} | Status: ${inv.status} | DGII Error: ${inv.dgii_error}`);
        console.log(`Total: ${inv.total_amount} | ITBIS: ${inv.tax_amount}`);
        console.log('Custom Fields:', inv.custom_fields);
    }
}

main().catch(e => console.error(e)).finally(() => prisma.$disconnect());
