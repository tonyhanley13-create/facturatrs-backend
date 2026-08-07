import prisma from '../models/db';

async function seed() {
  const company = await prisma.company.findFirst({ where: { id: 1 } });
  if (!company) {
    console.error('Empresa 1 no encontrada');
    return;
  }

  const client = await prisma.client.findFirst({ where: { company_id: 1 } });
  if (!client) {
    console.error('Cliente para empresa 1 no encontrado');
    return;
  }

  const user = await prisma.user.findFirst();
  if (!user) {
    console.error('Usuario no encontrado');
    return;
  }

  // 1. Crear Reembolso De Contado (Pagado)
  const rb1 = await prisma.invoice.create({
    data: {
      user_id: user.id,
      company_id: 1,
      client_id: client.id,
      invoice_number: 'RB-0000001',
      description: 'Reembolso de Peajes y Viáticos (Contado)',
      amount: 1500.00,
      subtotal: 1500.00,
      tax_amount: 0.00,
      discount_amount: 0.00,
      total_amount: 1500.00,
      currency: 'DOP',
      status: 'issued',
      payment_status: 'paid',
      document_type: 'reembolso',
      custom_fields: JSON.stringify({
        centro_costo: 'REEMBOLSO',
        documento_tipo: 'REEMBOLSO RDS',
        facturado_a_credito: false,
        dias_credito: 0,
        paid_amount: 1500.00,
        pending_amount: 0.00,
        payment_status: 'paid',
      }),
    },
  });

  // 2. Crear Reembolso A Crédito (Pendiente)
  const rb2 = await prisma.invoice.create({
    data: {
      user_id: user.id,
      company_id: 1,
      client_id: client.id,
      invoice_number: 'RB-0000002',
      description: 'Reembolso Gastos VUCE y Puerto (A Crédito 30 días)',
      amount: 3500.00,
      subtotal: 3500.00,
      tax_amount: 0.00,
      discount_amount: 0.00,
      total_amount: 3500.00,
      currency: 'DOP',
      status: 'issued',
      payment_status: 'pending',
      due_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      document_type: 'reembolso',
      custom_fields: JSON.stringify({
        centro_costo: 'REEMBOLSO',
        documento_tipo: 'REEMBOLSO RDS',
        facturado_a_credito: true,
        dias_credito: 30,
        paid_amount: 0.00,
        pending_amount: 3500.00,
        payment_status: 'pending',
      }),
    },
  });

  console.log('✅ Creados 2 reembolsos de prueba en Empresa 1:');
  console.log(` - RB-0000001 (De Contado, RD$ 1,500.00): ID ${rb1.id}`);
  console.log(` - RB-0000002 (A Crédito, RD$ 3,500.00): ID ${rb2.id}`);
}

seed()
  .catch((e) => console.error(e))
  .finally(() => prisma.$disconnect());
