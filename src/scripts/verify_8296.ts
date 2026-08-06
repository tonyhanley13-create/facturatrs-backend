import sql from 'mssql';

async function verifyInvoice8296() {
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
    console.log('✅ Conectado a FacturaTRS!');

    // Buscar factura FC-8296
    const invRes = await pool.request().query("SELECT * FROM facturas WHERE numero_factura LIKE '%8296%'");
    console.log('📋 Factura FC-8296 encontrada en FacturaTRS:');
    console.log(JSON.stringify(invRes.recordset, null, 2));

    if (invRes.recordset.length > 0) {
      const invId = invRes.recordset[0].id;
      const itemsRes = await pool.request().query(`SELECT * FROM detalle_facturas WHERE id_factura = ${invId}`);
      console.log(`\n📦 Ítems de detalle para la factura ID ${invId}:`);
      console.log(JSON.stringify(itemsRes.recordset, null, 2));
    }

    await pool.close();
  } catch (err: any) {
    console.error('❌ Error:', err.message);
  }
}

verifyInvoice8296();
