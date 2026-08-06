import sql from 'mssql';

async function inspectFtcInvoices() {
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

    // 1. Contar facturas de tipo FTC-
    const countRes = await pool.request().query(`
      SELECT COUNT(*) as total FROM facturas WHERE id_empresa = 28 AND numero_factura LIKE 'FTC-%'
    `);
    console.log(`📊 Total de facturas de contado (FTC-) en FacturaTRS: ${countRes.recordset[0].total}`);

    // 2. Buscar la factura FTC-3349 mostrada en la foto
    const ftc3349 = await pool.request().query(`
      SELECT f.id, f.numero_factura, f.ncf, f.descripcion, f.monto_total, f.fecha_creacion, c.nombre as cliente
      FROM facturas f
      LEFT JOIN clientes c ON c.id = f.id_cliente
      WHERE f.id_empresa = 28 AND f.numero_factura = 'FTC-3349'
    `);
    console.log('\n📋 Factura FTC-3349 en FacturaTRS:');
    console.log(JSON.stringify(ftc3349.recordset, null, 2));

    if (ftc3349.recordset.length > 0) {
      const invId = ftc3349.recordset[0].id;
      const itemsRes = await pool.request().query(`SELECT * FROM detalle_facturas WHERE id_factura = ${invId}`);
      console.log(`\n📦 Ítems de detalle para FTC-3349 (ID ${invId}):`);
      console.log(JSON.stringify(itemsRes.recordset, null, 2));
    }

    // 3. Ver las 10 últimas facturas FTC-
    const sampleRes = await pool.request().query(`
      SELECT TOP 10 f.id, f.numero_factura, f.ncf, f.descripcion, f.monto_total, f.fecha_creacion, c.nombre as cliente
      FROM facturas f
      LEFT JOIN clientes c ON c.id = f.id_cliente
      WHERE f.id_empresa = 28 AND f.numero_factura LIKE 'FTC-%'
      ORDER BY f.fecha_creacion DESC
    `);
    console.log('\n📅 10 Facturas FTC- más recientes en FacturaTRS:');
    console.table(sampleRes.recordset);

    await pool.close();
  } catch (err: any) {
    console.error('❌ Error:', err.message);
  }
}

inspectFtcInvoices();
