import sql from 'mssql';

async function checkNcf12818Exact() {
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
    const res = await pool.request().query("SELECT id, numero_factura, ncf, descripcion, monto_total FROM facturas WHERE ncf = 'B0100012818' OR numero_factura LIKE '%8296%'");
    console.log('📋 Factura con NCF B0100012818 en FacturaTRS:');
    console.log(JSON.stringify(res.recordset, null, 2));

    if (res.recordset.length > 0) {
      const invId = res.recordset[0].id;
      const itemsRes = await pool.request().query(`SELECT * FROM detalle_facturas WHERE id_factura = ${invId}`);
      console.log(`\n📦 Ítems de detalle para la factura ID ${invId}:`);
      console.log(JSON.stringify(itemsRes.recordset, null, 2));
    }

    await pool.close();
  } catch (err: any) {
    console.error('❌ Error:', err.message);
  }
}

checkNcf12818Exact();
