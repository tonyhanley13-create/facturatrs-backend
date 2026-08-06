import sql from 'mssql';

async function countImtr() {
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
    const countRes = await pool.request().query('SELECT COUNT(*) as total FROM PURINGO.dbo.imtr');
    console.log(`🔢 Total de facturas en PURINGO.dbo.imtr: ${countRes.recordset[0].total}`);

    const sampleRes = await pool.request().query("SELECT TOP 5 doc, numero, ncf, fecha, fcreacion FROM PURINGO.dbo.imtr WHERE doc = 'FC' ORDER BY numero DESC");
    console.log('📝 Últimas 5 facturas de tipo FC:');
    console.log(JSON.stringify(sampleRes.recordset, null, 2));

    await pool.close();
  } catch (err: any) {
    console.error('❌ Error:', err.message);
  }
}

countImtr();
