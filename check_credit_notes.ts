import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
async function main() {
  const allE34 = await prisma.ncfSequence.findMany({ where: { company_id: 1, type: 'E34' } });
  console.log('E34 sequence:', JSON.stringify(allE34));

  const invoices = await prisma.invoice.findMany({
    where: { company_id: 1 },
    orderBy: { id: 'desc' },
    take: 30,
    select: { id: true, invoice_number: true, ncf: true, status: true, document_type: true, custom_fields: true, dgii_status: true, dgii_contingency: true, dgii_error: true },
  });

  for (const inv of invoices) {
    let docType = '';
    try {
      if (inv.custom_fields) {
        const p = JSON.parse(inv.custom_fields);
        docType = p.documento_tipo || '';
      }
    } catch (_) {}
    if (docType.includes('Crédito') || docType.includes('Débito') || (inv.ncf && inv.ncf.startsWith('E34'))) {
      console.log(`INV #${inv.id} ${inv.invoice_number} | ncf=${inv.ncf || 'null'} | status=${inv.status} | docType=${docType} | dgii=${inv.dgii_status} | contingency=${inv.dgii_contingency} | error=${inv.dgii_error || 'null'}`);
    }
  }
}
main().catch(e => console.error(e)).finally(() => prisma.$disconnect());
