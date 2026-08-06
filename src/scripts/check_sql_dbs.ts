import sql from 'mssql';

async function checkFacturaTRS() {
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
    console.log('✅ Conectado a SQL Server [FacturaTRS]!');

    const tablesRes = await pool.request().query(`
      SELECT TABLE_NAME 
      FROM INFORMATION_SCHEMA.TABLES 
      WHERE TABLE_TYPE = 'BASE TABLE'
    `);

    console.log('📋 Tablas en FacturaTRS:');
    for (const r of tablesRes.recordset) {
      console.log(`   - ${r.TABLE_NAME}`);
    }

    // Verificar si hay empresas
    try {
      const empRes = await pool.request().query('SELECT * FROM empresas');
      console.log(`\n🏢 Empresas registradas en FacturaTRS (${empRes.recordset.length}):`);
      console.log(JSON.stringify(empRes.recordset, null, 2));
    } catch {
      try {
        const empRes2 = await pool.request().query('SELECT * FROM Company');
        console.log(`\n🏢 Company registradas en FacturaTRS (${empRes2.recordset.length}):`);
        console.log(JSON.stringify(empRes2.recordset, null, 2));
      } catch (e: any) {
        console.log('Error buscando tabla de empresas:', e.message);
      }
    }

    await pool.close();
  } catch (err: any) {
    console.error('❌ Error:', err.message);
  }
}

checkFacturaTRS();
