const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const fs = require('fs');

async function main() {
    // Invoice 19 (accepted) vs Invoice 11 (rejected)
    const [inv19, inv11] = await Promise.all([
        prisma.invoice.findUnique({ where: { id: 19 }, include: { client: true } }),
        prisma.invoice.findUnique({ where: { id: 11 }, include: { client: true } })
    ]);

    const c19 = JSON.parse(inv19.custom_fields || '{}');
    const c11 = JSON.parse(inv11.custom_fields || '{}');

    const result = {
        invoice_19: {
            ncf: inv19.ncf,
            reference_ncf: c19.reference_ncf,
            client_name: inv19.client.name,
            client_rnc: inv19.client.rnc,
            status: c19.dgii_response?.estado,
            mensajes: c19.dgii_response?.mensajes,
        },
        invoice_11: {
            ncf: inv11.ncf,
            reference_ncf: c11.reference_ncf,
            client_name: inv11.client.name,
            client_rnc: inv11.client.rnc,
            status: c11.dgii_response?.estado,
            mensajes: c11.dgii_response?.mensajes,
        }
    };

    fs.writeFileSync('comparison.txt', JSON.stringify(result, null, 2));
    console.log('Saved to comparison.txt');
}

main().catch(e => console.error(e)).finally(() => prisma.$disconnect());
