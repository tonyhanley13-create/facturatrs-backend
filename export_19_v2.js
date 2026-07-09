const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const fs = require('fs');

async function main() {
    const inv = await prisma.invoice.findUnique({ where: { id: 19 } });
    fs.writeFileSync('id_19_custom_fixed.txt', JSON.stringify(JSON.parse(inv.custom_fields), null, 2));
}

main().catch(e => console.error(e)).finally(() => prisma.$disconnect());
