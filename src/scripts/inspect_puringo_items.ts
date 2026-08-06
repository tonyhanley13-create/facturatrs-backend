import sql from 'mssql';

async function inspectInvoiceDetails() {
  const config: sql.config = {
    user: 'sa',
    password: 'Kibalion2',
    server: 'localhost',
    database: 'PURINGO',
    options: {
      trustServerCertificate: true,
      encrypt: false,
    },
  };

  try {
    const pool = await sql.connect(config);
    console.log('✅ Conectado a PURINGO!');

    // 1. Buscar el encabezado en imtr para FC-8296 o numero 8296
    const imtrRes = await pool.request().query(`
      SELECT * FROM imtr WHERE numero = 8296 OR control LIKE '%8296%'
    `);
    console.log(`\n📋 Encabezado en imtr (${imtrRes.recordset.length} filas):`);
    console.log(JSON.stringify(imtrRes.recordset, null, 2));

    if (imtrRes.recordset.length > 0) {
      const row = imtrRes.recordset[0];
      const controlVal = row.control;
      console.log(`\n🔑 Campo control / id del encabezado: "${controlVal}"`);

      // 2. Buscar detalles en imtrd
      const imtrdRes = await pool.request().query(`
        SELECT * FROM imtrd WHERE control = '${controlVal}' OR control LIKE '%8296%'
      `);
      console.log(`\n📦 Detalle en imtrd (${imtrdRes.recordset.length} filas):`);
      console.log(JSON.stringify(imtrdRes.recordset, null, 2));

      // 3. Inspeccionar las columnas de imtrd
      const colsRes = await pool.request().query(`
        SELECT COLUMN_NAME, DATA_TYPE 
        FROM INFORMATION_SCHEMA.COLUMNS 
        WHERE TABLE_NAME = 'imtrd'
      `);
      console.log('\n📊 Columnas de imtrd:');
      console.log(colsRes.recordset.map((r: any) => r.COLUMN_NAME).join(', '));
    }

    await pool.close();
  } catch (err: any) {
    console.error('❌ Error:', err.message);
  }
}

inspectInvoiceDetails();
