import sql from 'mssql';

async function checkPuringoDocs() {
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
    const colsRes = await pool.request().query(`
      SELECT COLUMN_NAME 
      FROM INFORMATION_SCHEMA.COLUMNS 
      WHERE TABLE_NAME = 'docs'
    `);
    console.log('📊 Columnas de PURINGO.dbo.docs:');
    console.log(colsRes.recordset.map((r: any) => r.COLUMN_NAME).join(', '));

    const sampleRes = await pool.request().query(`SELECT TOP 1 * FROM PURINGO.dbo.docs`);
    console.log('\n📝 Muestra 1 fila de PURINGO.dbo.docs:');
    console.log(JSON.stringify(sampleRes.recordset[0], null, 2));

    await pool.close();
  } catch (err: any) {
    console.error('❌ Error:', err.message);
  }
}

checkPuringoDocs();
