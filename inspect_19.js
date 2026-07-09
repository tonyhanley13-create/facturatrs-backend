const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    const inv = await prisma.invoice.findUnique({
        where: { id: 19 },
        include: { items: true }
    });

    console.log('--- ID 19 FULL DATA ---');
    console.log(`NCF: ${inv.ncf}`);
    console.log(`Total: ${inv.total_amount}`);
    console.log(`Subtotal: ${inv.subtotal}`);
    console.log(`Tax: ${inv.tax_amount}`);
    console.log(`Description: ${inv.description}`);

    const custom = JSON.parse(inv.custom_fields || '{}');
    console.log('Custom Fields structure:');
    Object.keys(custom).forEach(key => {
        if (key === 'dgii_signed_xml') {
            console.log('XML Totales section:');
            const match = custom[key].match(/<Totales>[\s\S]*?<\/Totales>/);
            console.log(match ? match[0] : 'Not found');
        } else {
            console.log(`${key}: ${JSON.stringify(custom[key])}`);
        }
    });
}

main().catch(e => console.error(e)).finally(() => prisma.$disconnect());
