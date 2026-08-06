import sql from 'mssql';

async function inspectDocs() {
  const config: sql.config = {
    user: 'sa',
    password: 'Kibalion2',
    server: 'localhost',
    database: 'puringo',
    options: {
      trustServerCertificate: true,
      encrypt: false,
    },
  };

  try {
    const pool = await sql.connect(config);
    console.log('✅ Conectado a puringo!');

    const colsRes = await pool.request().query(`
      SELECT COLUMN_NAME, DATA_TYPE 
      FROM INFORMATION_SCHEMA.COLUMNS 
      WHERE TABLE_NAME = 'docs'
    `);
    console.log('📊 Columnas de docs:');
    console.log(colsRes.recordset.map((r: any) => `${r.COLUMN_NAME} (${r.DATA_TYPE})`).join(', '));

    const docsRes = await pool.request().query(`
      SELECT TOP 5 documento, cliente, ncf, fecha, subtotal, itbis, monto, tipo 
      FROM docs 
      ORDER BY fecha DESC
    `);
    console.log('\n📝 Últimas 5 facturas en docs:');
    console.log(JSON.stringify(docsRes.recordset, null, 2));

    const countRes = await pool.request().query(`SELECT COUNT(*) as total FROM docs`);
    console.log(`\n🔢 Total de documentos en puringo: ${countRes.recordset[0].total}`);

    const clientCountRes = await pool.request().query(`SELECT COUNT(*) as total FROM clientes`);
    console.log(`🔢 Total de clientes en puringo: ${clientCountRes.recordset[0].total}`);

    const mercsCountRes = await pool.request().query(`SELECT COUNT(*) as total FROM mercs`);
    console.log(`🔢 Total de productos en puringo: ${mercsCountRes.recordset[0].total}`);

    await pool.close();
  } catch (err: any) {
    console.error('❌ Error:', err.message);
  }
}

inspectDocs();
