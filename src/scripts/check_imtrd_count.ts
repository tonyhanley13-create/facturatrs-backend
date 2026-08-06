import sql from 'mssql';

async function checkImtrdCount() {
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
    const countRes = await pool.request().query('SELECT COUNT(*) as total FROM imtrd');
    console.log(`🔢 Total de líneas de detalle en imtrd: ${countRes.recordset[0].total}`);
    await pool.close();
  } catch (err: any) {
    console.error('❌ Error:', err.message);
  }
}

checkImtrdCount();
