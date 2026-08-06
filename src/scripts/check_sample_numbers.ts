import sql from 'mssql';

async function checkSampleNumbers() {
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
    const res = await pool.request().query("SELECT TOP 10 id, numero_factura, ncf, descripcion FROM facturas WHERE id_empresa = 28 ORDER BY id DESC");
    console.log('📋 Facturas en FacturaTRS:');
    console.log(JSON.stringify(res.recordset, null, 2));

    const invByNcf = await pool.request().query("SELECT * FROM facturas WHERE ncf = 'B0100012818'");
    console.log('\n📋 Factura por NCF B0100012818:');
    console.log(JSON.stringify(invByNcf.recordset, null, 2));

    if (invByNcf.recordset.length > 0) {
      const invId = invByNcf.recordset[0].id;
      const itemsRes = await pool.request().query(`SELECT * FROM detalle_facturas WHERE id_factura = ${invId}`);
      console.log(`\n📦 Ítems de detalle para la factura ID ${invId}:`);
      console.log(JSON.stringify(itemsRes.recordset, null, 2));
    }

    await pool.close();
  } catch (err: any) {
    console.error('❌ Error:', err.message);
  }
}

checkSampleNumbers();
