const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();
(async () => {
  const company = await p.company.findFirst({ where: { rnc: '132196521' } });
  console.log('Company:', company?.name);
  
  // Check NCF ranges on Company model
  if (company?.ncf_ranges) {
    const ranges = typeof company.ncf_ranges === 'string' ? JSON.parse(company.ncf_ranges) : company.ncf_ranges;
    console.log('NCF Ranges:', JSON.stringify(ranges, null, 2));
  }
  
  // Check invoice count
  const count = await p.invoice.count({ where: { company_id: company?.id } });
  console.log('Invoice count for company:', count);
  
  // Check last invoice
  const last = await p.invoice.findFirst({ where: { company_id: company?.id }, orderBy: { id: 'desc' } });
  if (last) {
    console.log('Last invoice:', JSON.stringify({ id: last.id, number: last.invoice_number, ncf: last.ncf, status: last.status, created_at: last.created_at }));
  } else {
    console.log('No invoices for this company');
  }
  
  // Check if there are invoices with ncf starting with E31
  const e31count = await p.invoice.count({ where: { company_id: company?.id, ncf: { startsWith: 'E31' } } });
  console.log('Invoices with E31 prefix:', e31count);
  
})().catch(e => { console.error(e.message); }).finally(() => process.exit(0));
