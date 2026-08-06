import sql from 'mssql';

async function inspectPuringo2CompanyInfo() {
  const configPuringo2: sql.config = {
    user: 'sa',
    password: 'Kibalion2',
    server: 'localhost',
    database: 'puringo2',
    options: {
      trustServerCertificate: true,
      encrypt: false,
    },
  };

  try {
    const pool = await sql.connect(configPuringo2);
    console.log('✅ Conectado a puringo2!');

    // 1. Tabla parametro / cons
    try {
      const p = await pool.request().query('SELECT * FROM parametro');
      console.log('\n⚙️ Tabla parametro:');
      console.log(JSON.stringify(p.recordset, null, 2));
    } catch (e: any) {
      console.log('No existe tabla parametro');
    }

    try {
      const c = await pool.request().query('SELECT * FROM cons');
      console.log('\n⚙️ Tabla cons:');
      console.log(JSON.stringify(c.recordset, null, 2));
    } catch (e: any) {}

    try {
      const f = await pool.request().query('SELECT * FROM fiscal');
      console.log('\n📜 Tabla fiscal:');
      console.log(JSON.stringify(f.recordset, null, 2));
    } catch (e: any) {}

    await pool.close();
  } catch (err: any) {
    console.error('❌ Error:', err.message);
  }
}

inspectPuringo2CompanyInfo();
