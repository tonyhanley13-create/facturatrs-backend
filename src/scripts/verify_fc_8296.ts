import sql from 'mssql';

async function verifyInvoiceFC8296() {
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

    // 1. Buscar la factura FC-8296
    const invRes = await pool.request().query("SELECT id, numero_factura, ncf, descripcion, monto_total, fecha_creacion FROM facturas WHERE numero_factura = 'FC-8296'");
    console.log('📋 Encabezado de la factura FC-8296 en FacturaTRS:');
    console.log(JSON.stringify(invRes.recordset, null, 2));

    if (invRes.recordset.length > 0) {
      const invId = invRes.recordset[0].id;
      // 2. Buscar ítems de detalle
      const itemsRes = await pool.request().query(`SELECT id_factura, numero_linea, codigo_item, nombre_item, cantidad, precio_unitario, monto_total FROM detalle_facturas WHERE id_factura = ${invId}`);
      console.log(`\n📦 Ítems de detalle para la factura FC-8296 (ID ${invId}):`);
      console.log(JSON.stringify(itemsRes.recordset, null, 2));
    }

    await pool.close();
  } catch (err: any) {
    console.error('❌ Error:', err.message);
  }
}

verifyInvoiceFC8296();
