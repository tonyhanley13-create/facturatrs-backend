import sql from 'mssql';

async function checkPuringoNcf12818() {
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
    const res = await pool.request().query("SELECT control, usuario, doc, numero, ncf, fecha, fcreacion, comentario, valor, itbis, total FROM PURINGO.dbo.imtr WHERE ncf LIKE '%12818%' OR numero = 8296");
    console.log('📋 Registro en PURINGO.dbo.imtr:');
    console.log(JSON.stringify(res.recordset, null, 2));
    await pool.close();
  } catch (err: any) {
    console.error('❌ Error:', err.message);
  }
}

checkPuringoNcf12818();
