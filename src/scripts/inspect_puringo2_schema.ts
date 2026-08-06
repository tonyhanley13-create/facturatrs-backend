import sql from 'mssql';

async function inspectPuringo2Schema() {
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

    const clientSample = await pool.request().query('SELECT TOP 1 * FROM clientes');
    console.log('📌 Sample cliente:');
    console.log(clientSample.recordset[0]);

    const mercSample = await pool.request().query('SELECT TOP 1 * FROM mercs');
    console.log('\n📌 Sample merc:');
    console.log(mercSample.recordset[0]);

    const imtrSample = await pool.request().query('SELECT TOP 1 * FROM imtr ORDER BY fecha DESC');
    console.log('\n📌 Sample imtr (factura):');
    console.log(imtrSample.recordset[0]);

    const imtrdSample = await pool.request().query('SELECT TOP 1 * FROM imtrd');
    console.log('\n📌 Sample imtrd (detalle):');
    console.log(imtrdSample.recordset[0]);

    await pool.close();
  } catch (err: any) {
    console.error('❌ Error:', err.message);
  }
}

inspectPuringo2Schema();
