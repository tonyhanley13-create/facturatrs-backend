import sql from 'mssql';
import { Client } from 'pg';

const SQL_CONFIG: sql.config = {
  user: 'sa',
  password: 'Kibalion2',
  server: 'localhost',
  database: 'FacturaTRS',
  options: { trustServerCertificate: true, encrypt: false },
};

const SUPABASE_URL =
  'postgresql://postgres.ewtacqiyschgtcpflzub:Kibalion2%40%40%21@aws-0-ca-central-1.pooler.supabase.com:5432/facturatrs_dev';

// Empresas a borrar en Supabase (Puringo id=3 vieja + reemplazos si re-ejecutamos)
const TARGET_COMPANIES = [3, 28, 29];

// Mapeo usuarios SQL -> Supabase (SQL 30 puro -> Supabase 38 puro)
const USER_MAP: Record<number, number> = { 20: 20, 28: 28, 29: 29, 30: 38 };

const PG_COLS = {
  empresas:
    'id,nombre,rnc,direccion,telefono,correo,url_logo,moneda_defecto,porcentaje_itbis,proximo_numero_factura,prefijo_factura,rangos_ncf,id_empresa_alanube,ambiente_alanube,proveedor_fiscal,id_empresa_gae,codigo_vendedor_gae,ambiente_gae,ambiente_dgii,nombre_certificado,contenido_certificado,clave_certificado,vencimiento_certificado,modalidad_facturacion,fecha_inicio_electronica,es_plantilla,fecha_creacion,fecha_actualizacion',
  clientes:
    'id,id_usuario,id_empresa,nombre,rnc_cedula,telefono,direccion,persona_contacto,correo_electronico,tipo_cliente,id_fiscal,campos_personalizados,fecha_creacion',
  productos:
    'id,id_usuario,id_empresa,codigo,nombre,descripcion,categoria,precio_unitario,porcentaje_itbis,tipo,unidad_medida,indicador_facturacion,indicador_bien_servicio,esta_activo,fecha_creacion,fecha_actualizacion',
  facturas:
    'id,id_usuario,id_empresa,id_cliente,numero_factura,descripcion,monto_bruto,subtotal,monto_itbis,monto_descuento,monto_total,moneda,estado,id_alanube,ncf,fecha_vencimiento,estado_pago,metodo_pago,notas,tipo_documento,ncf_referencia,campos_personalizados,id_seguimiento_dgii,codigo_seguridad_dgii,xml_firmado_dgii,estado_dgii,es_contingencia,error_dgii,fecha_creacion',
  detalle:
    'id,id_factura,numero_linea,codigo_item,nombre_item,descripcion,cantidad,precio_unitario,porcentaje_descuento,porcentaje_itbis,subtotal,monto_itbis,monto_total,indicador_facturacion,indicador_bien_servicio,unidad_medida,fecha_creacion',
  secuencias: 'id,id_empresa,tipo,prefijo,siguiente,final',
  certificacion:
    'id,id_empresa,paso_actual,estado,requisitos_verificados,solicitud_completada,fecha_solicitud,datos_prueba_enviados,datos_prueba_aprobados,simulacion_enviada,simulacion_aprobada,cantidad_ecf_prueba,pdf_enviado,pdf_aprobado,url_recepcion,url_aprobacion,url_autenticacion,comunicacion_listo,comunicacion_aprobada,xml_postulacion,xml_postulacion_firmado,nombre_software,version_software,tipo_software,nombre_proveedor,contacto_proveedor,xml_declaracion,xml_declaracion_firmado,declaracion_enviada,rnc_verificado,url_recepcion_produccion,url_aprobacion_produccion,url_autenticacion_produccion,motivo_cancelacion,fecha_inicio,fecha_completado,fecha_creacion,fecha_actualizacion',
  ue: 'id_usuario,id_empresa,rol,puede_cambiar_empresa,permisos,fecha_creacion',
};

async function deleteCompanyData(pg: Client, companyId: number) {
  console.log(`🗑️  Borrando datos de empresa ${companyId} en Supabase...`);
  await pg.query(`DELETE FROM detalle_facturas WHERE id_factura IN (SELECT id FROM facturas WHERE id_empresa=$1)`, [companyId]);
  await pg.query(`DELETE FROM auditoria_facturas WHERE id_factura IN (SELECT id FROM facturas WHERE id_empresa=$1)`, [companyId]);
  await pg.query(`DELETE FROM facturas WHERE id_empresa=$1`, [companyId]);
  await pg.query(`DELETE FROM clientes WHERE id_empresa=$1`, [companyId]);
  await pg.query(`DELETE FROM productos_servicios WHERE id_empresa=$1`, [companyId]);
  await pg.query(`DELETE FROM secuencias_ncf WHERE id_empresa=$1`, [companyId]);
  await pg.query(`DELETE FROM progreso_certificacion WHERE id_empresa=$1`, [companyId]);
  await pg.query(`DELETE FROM reportes_dgii WHERE id_empresa=$1`, [companyId]);
  await pg.query(`DELETE FROM recibidos_ecf WHERE id_empresa=$1`, [companyId]);
  await pg.query(`DELETE FROM compras_manual WHERE id_empresa=$1`, [companyId]);
  await pg.query(`DELETE FROM catalogo_cuentas WHERE id_empresa=$1`, [companyId]);
  await pg.query(`DELETE FROM usuario_empresas WHERE id_empresa=$1`, [companyId]);
  await pg.query(`DELETE FROM empresas WHERE id=$1`, [companyId]);
  console.log(`  ✅ Empresa ${companyId} limpiada`);
}

async function insertTable(pg: Client, table: string, cols: string, rows: any[]): Promise<void> {
  if (!rows.length) return;
  const colArr = cols.split(',');
  const BATCH = 500;
  for (let i = 0; i < rows.length; i += BATCH) {
    const batch = rows.slice(i, i + BATCH);
    const placeholders: string[] = [];
    const values: any[] = [];
    batch.forEach((r, ri) => {
      colArr.forEach((c, ci) => {
        values.push(r[c]);
        placeholders.push(`$${ri * colArr.length + ci + 1}`);
      });
    });
    const sqlText = `INSERT INTO ${table} (${cols}) VALUES ${batch.map((_, ri) => `(${placeholders.slice(ri * colArr.length, (ri + 1) * colArr.length).join(',')})`).join(',')}`;
    await pg.query(sqlText, values);
  }
}

async function fetchAll(ps: sql.ConnectionPool, query: string, params: any[] = []): Promise<any[]> {
  const req = ps.request();
  params.forEach((p, i) => req.input(`p${i}`, p));
  const r = await req.query(query);
  return r.recordset;
}

async function setSequences(pg: Client) {
  const seqs = [
    ['empresas_id_seq', 'empresas'],
    ['clientes_id_seq', 'clientes'],
    ['productos_servicios_id_seq', 'productos_servicios'],
    ['facturas_id_seq', 'facturas'],
    ['detalle_facturas_id_seq', 'detalle_facturas'],
    ['secuencias_ncf_id_seq', 'secuencias_ncf'],
    ['progreso_certificacion_id_seq', 'progreso_certificacion'],
  ];
  for (const [seq, tbl] of seqs) {
    const r = await pg.query(`SELECT COALESCE(MAX(id),0) m FROM ${tbl}`);
    await pg.query(`SELECT setval('${seq}', GREATEST(${Number(r.rows[0].m)}, 1))`);
  }
  console.log('✅ Secuencias actualizadas');
}

async function main() {
  const ps = await sql.connect(SQL_CONFIG);
  const pg = new Client({ connectionString: SUPABASE_URL, ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 20000 });
  await pg.connect();
  console.log('🔌 Conectado a SQL Server y Supabase\n');

  // 1. Limpiar empresas objetivo en Supabase
  for (const cid of TARGET_COMPANIES) await deleteCompanyData(pg, cid);

  // 2. Empresas 28 y 29
  const empRows = await fetchAll(ps, `SELECT * FROM FacturaTRS.dbo.empresas WHERE id IN (28,29) ORDER BY id`);
  const empClean = empRows.map((r: any) => {
    const { nombre_db, ...rest } = r;
    return rest;
  });
  await insertTable(pg, 'empresas', PG_COLS.empresas, empClean);
  console.log(`✅ Empresas insertadas: ${empClean.length}`);

  // 3. Clientes
  const cliRows = await fetchAll(ps, `SELECT * FROM FacturaTRS.dbo.clientes WHERE id_empresa IN (28,29) ORDER BY id`);
  await insertTable(pg, 'clientes', PG_COLS.clientes, cliRows);
  console.log(`✅ Clientes insertados: ${cliRows.length}`);

  // 4. Productos
  const prodRows = await fetchAll(ps, `SELECT * FROM FacturaTRS.dbo.productos_servicios WHERE id_empresa IN (28,29) ORDER BY id`);
  await insertTable(pg, 'productos_servicios', PG_COLS.productos, prodRows);
  console.log(`✅ Productos insertados: ${prodRows.length}`);

  // 5. Facturas
  const facRows = await fetchAll(ps, `SELECT * FROM FacturaTRS.dbo.facturas WHERE id_empresa IN (28,29) ORDER BY id`);
  await insertTable(pg, 'facturas', PG_COLS.facturas, facRows);
  console.log(`✅ Facturas insertadas: ${facRows.length}`);

  // 6. Detalle (todas las de las facturas copiadas)
  const detRows = await fetchAll(ps, `
    SELECT df.* FROM FacturaTRS.dbo.detalle_facturas df
    JOIN FacturaTRS.dbo.facturas f ON df.id_factura = f.id
    WHERE f.id_empresa IN (28,29) ORDER BY df.id
  `);
  await insertTable(pg, 'detalle_facturas', PG_COLS.detalle, detRows);
  console.log(`✅ Detalle insertado: ${detRows.length}`);

  // 7. Secuencias NCF
  const secRows = await fetchAll(ps, `SELECT * FROM FacturaTRS.dbo.secuencias_ncf WHERE id_empresa IN (28,29) ORDER BY id`);
  await insertTable(pg, 'secuencias_ncf', PG_COLS.secuencias, secRows);
  console.log(`✅ Secuencias NCF insertadas: ${secRows.length}`);

  // 8. Progreso de certificación
  const certRows = await fetchAll(ps, `SELECT * FROM FacturaTRS.dbo.progreso_certificacion WHERE id_empresa IN (28,29) ORDER BY id`);
  await insertTable(pg, 'progreso_certificacion', PG_COLS.certificacion, certRows);
  console.log(`✅ Progreso certificación insertado: ${certRows.length}`);

  // 9. usuario_empresas (mapear usuarios SQL -> Supabase)
  const ueRows = await fetchAll(ps, `SELECT * FROM FacturaTRS.dbo.usuario_empresas WHERE id_empresa IN (28,29) ORDER BY id_usuario, id_empresa`);
  const ueMapped = ueRows.map((r: any) => ({ ...r, id_usuario: USER_MAP[r.id_usuario] ?? r.id_usuario }));
  await insertTable(pg, 'usuario_empresas', PG_COLS.ue, ueMapped);
  console.log(`✅ usuario_empresas insertadas: ${ueMapped.length}`);

  // 10. Actualizar secuencias autoincrement
  await setSequences(pg);

  // Verificación
  console.log('\n📊 VERIFICACIÓN:');
  for (const cid of [1, 28, 29]) {
    const f = await pg.query(`SELECT COUNT(*) n FROM facturas WHERE id_empresa=$1`, [cid]);
    const c = await pg.query(`SELECT COUNT(*) n FROM clientes WHERE id_empresa=$1`, [cid]);
    const p = await pg.query(`SELECT COUNT(*) n FROM productos_servicios WHERE id_empresa=$1`, [cid]);
    const s = await pg.query(`SELECT COUNT(*) n FROM secuencias_ncf WHERE id_empresa=$1`, [cid]);
    console.log(`  Empresa ${cid}: facturas=${f.rows[0].n} clientes=${c.rows[0].n} productos=${p.rows[0].n} secuencias=${s.rows[0].n}`);
  }
  const e3 = await pg.query(`SELECT COUNT(*) n FROM empresas WHERE id=3`);
  console.log(`  Empresa 3 (Puringo vieja) en Supabase: ${e3.rows[0].n === 0 ? 'ELIMINADA ✅' : 'AÚN EXISTE ❌'}`);

  await ps.close();
  await pg.end();
  console.log('\n🎉 Migración completada');
}

main().catch((err) => {
  console.error('❌ Error:', err);
  process.exit(1);
});
