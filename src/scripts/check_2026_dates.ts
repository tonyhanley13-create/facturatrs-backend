import sql from 'mssql';

async function checkPuringo2026Dates() {
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
      SELECT TOP 20 id, numero_factura, ncf, fecha_creacion 
      FROM facturas 
      WHERE id_empresa = 28 AND fecha_creacion >= '2026-01-01'
      ORDER BY fecha_creacion DESC
    `);
    console.log('📋 Facturas del 2026 en FacturaTRS:');
    console.table(res.recordset);
    await pool.close();
  } catch (err: any) {
    console.error('❌ Error:', err.message);
  }
}

checkPuringo2026Dates();
