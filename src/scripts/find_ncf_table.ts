import sql from 'mssql';

async function findNcfTable() {
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
    const tables = ['imtrc', 'imtrd', 'imtr', 'cobroc', 'cobrod', 'fpagocom', 'despachodoc', 'analisis'];

    for (const table of tables) {
      try {
        const res = await pool.request().query(`
          SELECT TOP 3 * FROM ${table} 
          WHERE ncf LIKE 'B01%' OR ncf IS NOT NULL
        `);
        if (res.recordset.length > 0) {
          console.log(`\n🎉 NCF ENCONTRADO EN LA TABLA [${table}]! (${res.recordset.length} filas)`);
          console.log(JSON.stringify(res.recordset, null, 2));
        }
      } catch (e: any) {
        // Ignorar si la tabla no tiene columna ncf
      }
    }

    await pool.close();
  } catch (err: any) {
    console.error('❌ Error:', err.message);
  }
}

findNcfTable();
