import sql from 'mssql';

async function checkMigratedData() {
  const config: sql.config = {
    user: 'sa',
    password: 'Kibalion2',
    server: 'localhost',
    database: 'FacturaTRS',
    options: {
      trustServerCertificate: true,
      encrypt: false,
    },
  };

  try {
    const pool = await sql.connect(config);
    console.log('✅ Conectado a FacturaTRS!');

    const companyRes = await pool.request().query("SELECT id, nombre, rnc, modalidad_facturacion FROM empresas WHERE nombre LIKE '%PURINGO%'");
    console.log('\n🏢 Datos de la Empresa:');
    console.table(companyRes.recordset);
    const companyId = companyRes.recordset[0].id;

    const clientCount = await pool.request().query(`SELECT COUNT(*) as total FROM clientes WHERE id_empresa = ${companyId}`);
    console.log(`\n👥 Total de Clientes en FacturaTRS para Puringo Cruz: ${clientCount.recordset[0].total}`);

    const prodCount = await pool.request().query(`SELECT COUNT(*) as total FROM productos_servicios WHERE id_empresa = ${companyId}`);
    console.log(`📦 Total de Productos en FacturaTRS para Puringo Cruz: ${prodCount.recordset[0].total}`);

    const invCount = await pool.request().query(`SELECT COUNT(*) as total FROM facturas WHERE id_empresa = ${companyId}`);
    console.log(`📄 Total de Facturas en FacturaTRS para Puringo Cruz: ${invCount.recordset[0].total}`);

    const seqsRes = await pool.request().query(`SELECT tipo, prefijo, siguiente, final FROM secuencias_ncf WHERE id_empresa = ${companyId}`);
    console.log('\n🔢 Secuencias NCF configuradas:');
    console.table(seqsRes.recordset);

    const invoicesRes = await pool.request().query(`SELECT TOP 5 numero_factura, ncf, monto_total, fecha_creacion FROM facturas WHERE id_empresa = ${companyId} ORDER BY id DESC`);
    console.log('\n📝 Últimas facturas en FacturaTRS:');
    console.table(invoicesRes.recordset);

    await pool.close();
  } catch (err: any) {
    console.error('❌ Error:', err.message);
  }
}

checkMigratedData();
