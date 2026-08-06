import sql from 'mssql';

async function inspect2026Invoices() {
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

    // 1. Contar facturas por año
    const countByYear = await pool.request().query(`
      SELECT 
        YEAR(fecha_creacion) as anio, 
        COUNT(*) as total,
        MIN(id) as min_id,
        MAX(id) as max_id
      FROM facturas 
      WHERE id_empresa = 28
      GROUP BY YEAR(fecha_creacion)
      ORDER BY anio DESC
    `);
    console.log('📊 Distribución de facturas por año:');
    console.table(countByYear.recordset);

    // 2. Ver las 10 facturas más recientes por fecha_creacion
    const recentByDate = await pool.request().query(`
      SELECT TOP 10 id, numero_factura, ncf, monto_total, fecha_creacion 
      FROM facturas 
      WHERE id_empresa = 28 
      ORDER BY fecha_creacion DESC
    `);
    console.log('\n📅 10 Facturas más recientes por fecha_creacion DESC:');
    console.table(recentByDate.recordset);

    // 3. Ver las 10 facturas según id DESC (lo que consulta getInvoices)
    const recentById = await pool.request().query(`
      SELECT TOP 10 id, numero_factura, ncf, monto_total, fecha_creacion 
      FROM facturas 
      WHERE id_empresa = 28 
      ORDER BY id DESC
    `);
    console.log('\n🆔 10 Facturas más recientes por id DESC:');
    console.table(recentById.recordset);

    await pool.close();
  } catch (err: any) {
    console.error('❌ Error:', err.message);
  }
}

inspect2026Invoices();
