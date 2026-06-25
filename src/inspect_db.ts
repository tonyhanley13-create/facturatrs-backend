import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  try {
    // Check distinct user_ids in clients
    const clientUserIds: any[] = await prisma.$queryRaw`
      SELECT DISTINCT id_usuario, id_empresa FROM clientes
    `;
    console.log('=== CLIENTES: user_id y company_id distintos ===');
    clientUserIds.forEach((r: any) => console.log(`  user_id=${r.id_usuario} company_id=${r.id_empresa}`));

    // Check distinct user_ids in products
    const productUserIds: any[] = await prisma.$queryRaw`
      SELECT DISTINCT id_usuario, id_empresa FROM productos_servicios
    `;
    console.log('=== PRODUCTOS: user_id y company_id distintos ===');
    productUserIds.forEach((r: any) => console.log(`  user_id=${r.id_usuario} company_id=${r.id_empresa}`));

    // Check user_company for user 20
    const uc: any[] = await prisma.$queryRaw`
      SELECT * FROM usuario_empresas WHERE id_usuario = 20
    `;
    console.log('=== USUARIO_EMPRESAS para user 20 ===');
    uc.forEach((r: any) => console.log(`  company_id=${r.id_empresa} role=${r.rol}`));

    // Total counts
    const tc = await prisma.client.count();
    const tp = await prisma.productService.count();
    console.log(`\nTotal clientes: ${tc}`);
    console.log(`Total productos: ${tp}`);

  } catch (error: any) {
    console.error('ERROR:', error.message);
  } finally {
    await prisma.$disconnect();
  }
}
main();
