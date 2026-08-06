import sql from 'mssql';

async function syncProximoNumeroFactura() {
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

    // Actualizar proximo_numero_factura a 2342 para todas las empresas de Puringo
    await pool.request().query(`
      UPDATE empresas 
      SET proximo_numero_factura = 2342, modalidad_facturacion = 'tradicional'
      WHERE id IN (1, 28) OR rnc = '00102620424' OR nombre LIKE '%PURINGO%';

      UPDATE configuracion_empresa 
      SET proximo_numero_factura = 2342;
    `);

    console.log('🎉 proximo_numero_factura actualizado exitosamente a 2342 en SQL Server.');

    const checkRes = await pool.request().query('SELECT id, nombre, proximo_numero_factura, modalidad_facturacion FROM empresas');
    console.table(checkRes.recordset);

    await pool.close();
  } catch (err: any) {
    console.error('❌ Error:', err.message);
  }
}

syncProximoNumeroFactura();
