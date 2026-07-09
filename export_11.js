const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const fs = require('fs');

async function main() {
    const inv = await prisma.invoice.findUnique({
        where: { id: 11 },
        include: { items: true }
    });

    let output = '--- ID 11 FULL DATA ---\n';
    output += `NCF: ${inv.ncf}\n`;
    output += `Total: ${inv.total_amount}\n`;
    output += `Subtotal: ${inv.subtotal}\n`;
    output += `Tax: ${inv.tax_amount}\n`;
    output += `DGII Error: ${inv.dgii_error}\n`;

    const custom = JSON.parse(inv.custom_fields || '{}');
    output += 'Custom Fields:\n' + JSON.stringify(custom, null, 2) + '\n';

    fs.writeFileSync('id_11_full.txt', output);
    console.log('Saved to id_11_full.txt');
}

main().catch(e => console.error(e)).finally(() => prisma.$disconnect());
