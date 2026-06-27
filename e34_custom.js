const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const fs = require('fs');

async function main() {
    // Buscar facturas que tienen ncf_comprobante E34 en custom_fields aunque no en ncf
    const all = await prisma.invoice.findMany({
        where: {
            custom_fields: { contains: 'E34' }
        },
        include: { client: true },
        orderBy: { id: 'asc' }
    });

    const result = all.map(inv => {
        const custom = JSON.parse(inv.custom_fields || '{}');
        return {
            id: inv.id,
            ncf_campo: inv.ncf,
            ncf_comprobante_custom: custom.ncf_comprobante,
            documento_tipo: custom.documento_tipo,
            reference_ncf: custom.reference_ncf,
            status_bd: inv.status,
            dgii_estado: custom.dgii_response?.estado,
            dgii_mensajes: custom.dgii_response?.mensajes,
        };
    });

    fs.writeFileSync('e34_in_custom.txt', JSON.stringify(result, null, 2));
    console.log(`Facturas con E34 en custom_fields: ${all.length}`);
}

main().catch(e => console.error(e)).finally(() => prisma.$disconnect());
