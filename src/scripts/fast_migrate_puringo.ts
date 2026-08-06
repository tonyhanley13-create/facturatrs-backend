import sql from 'mssql';

async function fastMigrate() {
  console.log('🚀 Iniciando migración ultra-rápida en SQL Server de PURINGO a FacturaTRS...');

  const config: sql.config = {
    user: 'sa',
    password: 'Kibalion2',
    server: 'localhost',
    options: {
      trustServerCertificate: true,
      encrypt: false,
    },
  };

  try {
    const pool = await sql.connect(config);
    console.log('✅ Conectado a SQL Server.');

    // 1. Obtener ID de la empresa Transporte Puringo Cruz y usuario válido
    const companyRes = await pool.request().query(`
      SELECT TOP 1 id FROM FacturaTRS.dbo.empresas 
      WHERE rnc = '00102620424' OR nombre LIKE '%PURINGO%' OR id = 28
    `);

    if (companyRes.recordset.length === 0) {
      console.error('❌ No se encontró la empresa Puringo en FacturaTRS.');
      await pool.close();
      return;
    }

    const companyId = companyRes.recordset[0].id;
    console.log(`🏢 Empresa ID objetivo: ${companyId}`);

    const userRes = await pool.request().query(`SELECT TOP 1 id FROM FacturaTRS.dbo.usuarios ORDER BY id ASC`);
    const validUserId = userRes.recordset[0]?.id || 20;
    console.log(`👤 Usuario ID objetivo: ${validUserId}`);

    // 2. Limpiar facturas e items antiguos de esta empresa
    console.log('🧹 Limpiando tablas facturas y detalle_facturas...');
    await pool.request().query(`
      DELETE FROM FacturaTRS.dbo.detalle_facturas 
      WHERE id_factura IN (SELECT id FROM FacturaTRS.dbo.facturas WHERE id_empresa = ${companyId});

      DELETE FROM FacturaTRS.dbo.facturas WHERE id_empresa = ${companyId};
    `);

    // 3. Insertar todas las facturas encabezados (imtr -> facturas)
    console.log('📄 Insertando 16,284 facturas desde imtr a FacturaTRS.dbo.facturas...');
    const insInvRes = await pool.request().query(`
      INSERT INTO FacturaTRS.dbo.facturas (
        id_usuario,
        id_empresa,
        id_cliente,
        numero_factura,
        descripcion,
        monto_bruto,
        subtotal,
        monto_itbis,
        monto_total,
        moneda,
        estado,
        ncf,
        notas,
        fecha_creacion
      )
      SELECT
        ${validUserId} AS id_usuario,
        ${companyId} AS id_empresa,
        COALESCE(c.id, (SELECT TOP 1 id FROM FacturaTRS.dbo.clientes WHERE id_empresa = ${companyId})) AS id_cliente,
        RTRIM(i.doc) + '-' + CAST(i.numero AS VARCHAR(50)) AS numero_factura,
        COALESCE(RTRIM(i.comentario), 'Factura ' + RTRIM(i.doc) + '-' + CAST(i.numero AS VARCHAR(50))) AS descripcion,
        COALESCE(i.total, i.valor + i.itbis, 0) AS monto_bruto,
        COALESCE(i.valor, 0) AS subtotal,
        COALESCE(i.itbis, 0) AS monto_itbis,
        COALESCE(i.total, i.valor + i.itbis, 0) AS monto_total,
        'DOP' AS moneda,
        CASE WHEN i.cancelado = 1 THEN 'voided' ELSE 'sent_to_alanube' END AS estado,
        CASE WHEN i.ncf IS NOT NULL AND RTRIM(i.ncf) != '' THEN REPLACE(RTRIM(i.ncf), ' ', '') ELSE NULL END AS ncf,
        RTRIM(i.comentario) AS notas,
        COALESCE(i.fcreacion, i.fecha, GETDATE()) AS fecha_creacion
      FROM PURINGO.dbo.imtr i
      LEFT JOIN PURINGO.dbo.clientes pc ON RTRIM(pc.codigo) = RTRIM(i.entidad)
      LEFT JOIN FacturaTRS.dbo.clientes c ON (c.id_empresa = ${companyId} AND (RTRIM(c.rnc_cedula) = RTRIM(pc.rnc) OR RTRIM(c.nombre) = RTRIM(pc.nombre)));
    `);
    console.log(`✅ Facturas insertadas: ${insInvRes.rowsAffected[0]}`);

    // 4. Insertar todos los ítems de detalle (imtrd -> detalle_facturas)
    console.log('📦 Insertando ítems de detalle desde imtrd a FacturaTRS.dbo.detalle_facturas...');
    const insDetailRes = await pool.request().query(`
      INSERT INTO FacturaTRS.dbo.detalle_facturas (
        id_factura,
        numero_linea,
        codigo_item,
        nombre_item,
        descripcion,
        cantidad,
        precio_unitario,
        porcentaje_itbis,
        subtotal,
        monto_itbis,
        monto_total
      )
      SELECT
        f.id AS id_factura,
        ROW_NUMBER() OVER (PARTITION BY f.id ORDER BY d.linea) AS numero_linea,
        COALESCE(RTRIM(d.merc), 'SERV-01') AS codigo_item,
        COALESCE(RTRIM(d.descrip), f.descripcion) AS nombre_item,
        COALESCE(RTRIM(d.descrip), f.descripcion) AS descripcion,
        COALESCE(d.cantidad, 1) AS cantidad,
        COALESCE(d.precio, f.subtotal) AS precio_unitario,
        CASE WHEN d.excento = 1 THEN 0 ELSE 18 END AS porcentaje_itbis,
        COALESCE(d.valor, f.subtotal) AS subtotal,
        COALESCE(d.itbis, f.monto_itbis) AS monto_itbis,
        COALESCE(d.total, f.monto_total) AS monto_total
      FROM FacturaTRS.dbo.facturas f
      INNER JOIN PURINGO.dbo.imtr i ON f.id_empresa = ${companyId} AND f.numero_factura = (RTRIM(i.doc) + '-' + CAST(i.numero AS VARCHAR(50)))
      INNER JOIN PURINGO.dbo.imtrd d ON RTRIM(d.control) = RTRIM(i.control);
    `);
    console.log(`✅ Ítems de detalle insertados: ${insDetailRes.rowsAffected[0]}`);

    // 5. Fallback para facturas sin ítems en imtrd
    console.log('🛠️ Creando ítem predeterminado para facturas sin detalle...');
    const fallbackRes = await pool.request().query(`
      INSERT INTO FacturaTRS.dbo.detalle_facturas (
        id_factura,
        numero_linea,
        codigo_item,
        nombre_item,
        descripcion,
        cantidad,
        precio_unitario,
        porcentaje_itbis,
        subtotal,
        monto_itbis,
        monto_total
      )
      SELECT
        f.id AS id_factura,
        1 AS numero_linea,
        'SERV-01' AS codigo_item,
        LEFT(f.descripcion, 255) AS nombre_item,
        f.descripcion AS descripcion,
        1 AS cantidad,
        f.subtotal AS precio_unitario,
        CASE WHEN f.monto_itbis > 0 THEN 18 ELSE 0 END AS porcentaje_itbis,
        f.subtotal AS subtotal,
        f.monto_itbis AS monto_itbis,
        f.monto_total AS monto_total
      FROM FacturaTRS.dbo.facturas f
      WHERE f.id_empresa = ${companyId}
        AND NOT EXISTS (SELECT 1 FROM FacturaTRS.dbo.detalle_facturas df WHERE df.id_factura = f.id);
    `);
    console.log(`✅ Ítems de fallback insertados: ${fallbackRes.rowsAffected[0]}`);

    // 6. Actualizar secuencias y modalidad
    await pool.request().query(`
      UPDATE FacturaTRS.dbo.secuencias_ncf SET siguiente = 12818, final = 14026 WHERE id_empresa = ${companyId} AND tipo = 'B01';
      UPDATE FacturaTRS.dbo.secuencias_ncf SET siguiente = 5, final = 3000 WHERE id_empresa = ${companyId} AND tipo = 'B02';
      UPDATE FacturaTRS.dbo.empresas SET proximo_numero_factura = 8297, modalidad_facturacion = 'tradicional' WHERE id = ${companyId};
      UPDATE FacturaTRS.dbo.configuracion_empresa SET proximo_numero_factura = 8297;
    `);

    console.log('\n==================================================');
    console.log('🎉 MIGRACIÓN COMPLETA ULTRA-RÁPIDA FINALIZADA CON ÉXITO!');
    console.log('==================================================');

    await pool.close();
  } catch (err: any) {
    console.error('❌ Error durante la migración:', err.message);
  }
}

fastMigrate();
