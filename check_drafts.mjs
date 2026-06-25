import { PrismaClient } from '@prisma/client';
const p = new PrismaClient();
const drafts = await p.invoice.findMany({
  where: { company_id: 1, status: 'draft' },
  take: 10,
  select: { id: true, invoice_number: true, status: true, client_id: true, total_amount: true },
});
console.log('Draft invoices:', JSON.stringify(drafts, null, 2));
if (drafts.length === 0) {
  // Check if there are any invoices at all
  const all = await p.invoice.findMany({
    where: { company_id: 1 },
    take: 5,
    orderBy: { id: 'desc' },
    select: { id: true, invoice_number: true, status: true, total_amount: true },
  });
  console.log('Latest invoices:', JSON.stringify(all, null, 2));
}
await p.$disconnect();
