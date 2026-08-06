import sql from 'mssql';

async function searchAll8296() {
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
    const res = await pool.request().query("SELECT id, id_empresa, numero_factura, ncf, descripcion, monto_total FROM facturas WHERE numero_factura LIKE '%8296%' OR ncf LIKE '%12818%'");
    console.log(`📋 Encontradas ${res.recordset.length} facturas matching:`);
    console.log(JSON.stringify(res.recordset, null, 2));

    for (const inv of res.recordset) {
      const itemsRes = await pool.request().query(`SELECT * FROM detalle_facturas WHERE id_factura = ${inv.id}`);
      console.log(`\n📦 ${itemsRes.recordset.length} Ítems de detalle para Factura ID ${inv.id} (${inv.numero_factura}):`);
      console.log(JSON.stringify(itemsRes.recordset, null, 2));
    }

    await pool.close();
  } catch (err: any) {
    console.error('❌ Error:', err.message);
  }
}

searchAll8296();
