const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const fs = require('fs');

async function main() {
    // Todas las E34
    const e34s = await prisma.invoice.findMany({
        where: { ncf: { startsWith: 'E34' } },
        include: { client: true },
        orderBy: { id: 'asc' }
    });

    const result = e34s.map(inv => {
        const custom = JSON.parse(inv.custom_fields || '{}');
        return {
            id: inv.id,
            ncf: inv.ncf,
            status: inv.status,
            client: inv.client?.name,
            client_rnc: inv.client?.rnc,
            dgii_estado: custom.dgii_response?.estado,
            dgii_error: custom.dgii_response?.mensajes?.filter(m => m.codigo !== 0),
            reference_ncf: custom.reference_ncf,
        };
    });

    fs.writeFileSync('all_e34.txt', JSON.stringify(result, null, 2));
    console.log(`Total E34 encontradas: ${e34s.length}`);
}

main().catch(e => console.error(e)).finally(() => prisma.$disconnect());
