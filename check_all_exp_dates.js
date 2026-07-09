const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function run() {
  try {
    const invoices = await prisma.invoice.findMany({
      where: {
        dgii_track_id: { not: null },
      },
      select: {
        invoice_number: true,
        ncf: true,
        status: true,
        dgii_signed_xml: true,
        custom_fields: true
      }
    });

    console.log(`Checking ${invoices.length} invoices...`);
    for (const inv of invoices) {
      let xml = inv.dgii_signed_xml;
      if (!xml && inv.custom_fields) {
        try {
          const parsed = JSON.parse(inv.custom_fields);
          xml = parsed.signed_xml;
        } catch (e) {}
      }

      let expDate = 'Not Found';
      if (xml) {
        const match = xml.match(/<FechaVencimientoSecuencia>([\d\-]+)<\/FechaVencimientoSecuencia>/);
        if (match) expDate = match[1];
      }

      console.log(`Inv: ${inv.invoice_number} | NCF: ${inv.ncf} | Expiration: ${expDate} | Status: ${inv.status}`);
    }
  } catch (e) {
    console.error(e);
  } finally {
    await prisma.$disconnect();
  }
}

run();
