import sql from 'mssql';

async function checkOoptionsInvoices() {
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
    const res = await pool.request().query(`
      SELECT f.id_empresa, e.nombre, COUNT(*) as total_facturas
      FROM facturas f
      JOIN empresas e ON e.id = f.id_empresa
      GROUP BY f.id_empresa, e.nombre
    `);
    console.log('📊 Facturas por Empresa en FacturaTRS:');
    console.table(res.recordset);

    const sample = await pool.request().query(`
      SELECT TOP 5 id, id_empresa, numero_factura, ncf, monto_total, descripcion, fecha_creacion
      FROM facturas
      WHERE id_empresa = (SELECT id FROM empresas WHERE nombre LIKE '%Ooptions Xpress%')
      ORDER BY fecha_creacion DESC
    `);
    console.log('\n📋 Muestra de facturas de Ooptions Xpress:');
    console.table(sample.recordset);

    await pool.close();
  } catch (err: any) {
    console.error('❌ Error:', err.message);
  }
}

checkOoptionsInvoices();
