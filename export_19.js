const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const fs = require('fs');

async function main() {
    const inv = await prisma.invoice.findUnique({
        where: { id: 19 },
        include: { items: true }
    });

    let output = '--- ID 19 FULL DATA ---\n';
    output += `NCF: ${inv.ncf}\n`;
    output += `Total: ${inv.total_amount}\n`;
    output += `Subtotal: ${inv.subtotal}\n`;
    output += `Tax: ${inv.tax_amount}\n`;

    const custom = JSON.parse(inv.custom_fields || '{}');
    if (custom.dgii_signed_xml) {
        output += 'XML Totales section:\n';
        const match = custom.dgii_signed_xml.match(/<Totales>[\s\S]*?<\/Totales>/);
        output += (match ? match[0] : 'Not found') + '\n';
    }

    fs.writeFileSync('id_19_full.txt', output);
    console.log('Saved to id_19_full.txt');
}

main().catch(e => console.error(e)).finally(() => prisma.$disconnect());
