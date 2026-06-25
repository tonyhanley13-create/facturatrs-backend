import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('--- INICIANDO MIGRACIÓN A MULTI-EMPRESA ---');

  try {
    // 1. Obtener todos los usuarios
    const users = await prisma.user.findMany({
      include: {
        companySettings: true,
      },
    });

    console.log(`Encontrados ${users.length} usuarios para migrar.`);

    for (const user of users) {
      console.log(`\nMigrando usuario: ${user.email} (ID: ${user.id})`);

      // 2. Crear la empresa inicial para el usuario
      // Usamos los datos de companySettings o el company_name del usuario
      const settings = user.companySettings[0];
      const companyName = settings?.company_name || user.company_name || 'Empresa Predeterminada';
      const companyRnc = settings?.company_rnc || '000000000';

      const company = await prisma.company.create({
        data: {
          name: companyName,
          rnc: companyRnc,
          address: settings?.company_address,
          phone: settings?.company_phone,
          email: settings?.company_email,
          logo_url: settings?.company_logo_url,
          default_currency: settings?.default_currency || 'DOP',
          tax_percentage: settings?.tax_percentage || 18,
          next_invoice_number: settings?.next_invoice_number || 1,
          invoice_prefix: settings?.invoice_prefix || 'FACT-',
          alanube_company_id: settings?.alanube_company_id,
          alanube_environment: settings?.alanube_environment || 'sandbox',
        },
      });

      console.log(`   ✅ Empresa creada: ${company.name} (ID: ${company.id})`);

      // 3. Vincular usuario a la empresa
      await prisma.userCompany.create({
        data: {
          user_id: user.id,
          company_id: company.id,
          role: 'admin',
        },
      });
      console.log(`   ✅ Vínculo UserCompany creado.`);

      // 4. Actualizar Clientes
      const clientsBatch = await prisma.client.updateMany({
        where: { user_id: user.id, company_id: null },
        data: { company_id: company.id },
      });
      console.log(`   ✅ ${clientsBatch.count} clientes vinculados.`);

      // 5. Actualizar Productos
      const productsBatch = await prisma.productService.updateMany({
        where: { user_id: user.id, company_id: null },
        data: { company_id: company.id },
      });
      console.log(`   ✅ ${productsBatch.count} productos vinculados.`);

      // 6. Actualizar Facturas
      const invoicesBatch = await prisma.invoice.updateMany({
        where: { user_id: user.id, company_id: null },
        data: { company_id: company.id },
      });
      console.log(`   ✅ ${invoicesBatch.count} facturas vinculadas.`);
      
      // 7. Crear catálogo inicial básico para la empresa
      await prisma.chartOfAccount.createMany({
        data: [
          { company_id: company.id, code: '1', name: 'ACTIVOS', type: 'ACTIVO', level: 1, is_group: true },
          { company_id: company.id, code: '2', name: 'PASIVOS', type: 'PASIVO', level: 1, is_group: true },
          { company_id: company.id, code: '3', name: 'CAPITAL', type: 'CAPITAL', level: 1, is_group: true },
          { company_id: company.id, code: '4', name: 'INGRESOS', type: 'INGRESO', level: 1, is_group: true },
          { company_id: company.id, code: '5', name: 'COSTOS', type: 'COSTO', level: 1, is_group: true },
          { company_id: company.id, code: '6', name: 'GASTOS', type: 'GASTO', level: 1, is_group: true },
        ]
      });
      console.log(`   ✅ Catálogo básico generado.`);
    }

    console.log('\n--- MIGRACIÓN COMPLETADA CON ÉXITO ---');

  } catch (error) {
    console.error('\n❌ ERROR DURANTE LA MIGRACIÓN:', error);
  } finally {
    await prisma.$disconnect();
  }
}

main();
