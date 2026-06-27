const http = require('http');
const { PrismaClient } = require('@prisma/client');
const jwt = require('jsonwebtoken');
const prisma = new PrismaClient();

const JWT_SECRET = process.env.SECRET_KEY || 'desarrollo_clave_secreta_local_para_node';

function request(method, path, token, body) {
  return new Promise((resolve, reject) => {
    const opts = {
      hostname: '127.0.0.1',
      port: 8000,
      path,
      method,
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    };
    const payload = body ? JSON.stringify(body) : null;
    if (payload) opts.headers['Content-Length'] = Buffer.byteLength(payload);
    const req = http.request(opts, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => resolve({ status: res.statusCode, data: JSON.parse(data) }));
    });
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

async function main() {
  const userCompany = await prisma.userCompany.findFirst({ where: { company_id: 1 }, include: { user: true } });
  if (!userCompany) { console.log('No user found'); return; }
  const user = userCompany.user;
  // Must use the same client as the original invoice referenced by E310000000010
  const originalInv = await prisma.invoice.findFirst({ where: { ncf: 'E310000000010' }, include: { client: true } });
  if (!originalInv) { console.log('Original invoice E310000000010 not found'); return; }
  const client = originalInv.client;
  console.log('Using client:', client.id, client.name, client.rnc);

  const token = jwt.sign(
    { user_id: user.id, email: user.email, company_id: 1, is_super_admin: false },
    JWT_SECRET,
    { expiresIn: '1h' }
  );

  // Reset invoices 9 and 10 if they exist
  for (const id of [9, 10]) {
    const inv = await prisma.invoice.findUnique({ where: { id } });
    if (inv) {
      console.log(`\nResetting invoice ${id}...`);
      const reset = await request('POST', `/dgii/invoice/${id}/reset`, token);
      console.log('Reset:', reset.status, JSON.stringify(reset.data));
    }
  }

  // Create a new E34 invoice
  console.log('\nCreating E34 invoice...');
  const result = await request('POST', '/dgii/invoice', token, {
    client_id: client.id,
    description: 'Nota de Crédito E34 de prueba',
    amount: 1500.00,
    document_type: 'Nota de Crédito',
    reference_ncf: 'E310000000010',
    modification_code: '3',
  });
  console.log('Status:', result.status);
  console.log('Response:', JSON.stringify(result.data, null, 2));
}

main().then(() => prisma.$disconnect()).catch(e => { console.error(e); prisma.$disconnect(); });
