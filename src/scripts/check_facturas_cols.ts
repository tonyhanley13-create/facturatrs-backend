import sql from 'mssql';

async function checkFacturaCols() {
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
    const colsRes = await pool.request().query(`
      SELECT COLUMN_NAME, DATA_TYPE 
      FROM INFORMATION_SCHEMA.COLUMNS 
      WHERE TABLE_NAME = 'facturas'
    `);
    console.log('📊 Columnas de FacturaTRS.dbo.facturas:');
    console.log(colsRes.recordset.map((r: any) => `${r.COLUMN_NAME} (${r.DATA_TYPE})`).join(', '));
    await pool.close();
  } catch (err: any) {
    console.error('❌ Error:', err.message);
  }
}

checkFacturaCols();
