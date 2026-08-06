import { Client } from 'pg';

const PROD_URL = 'postgresql://postgres.ewtacqiyschgtcpflzub:Kibalion2%40%40%21@aws-0-ca-central-1.pooler.supabase.com:5432/postgres';
const DEV_URL = 'postgresql://postgres.ewtacqiyschgtcpflzub:Kibalion2%40%40%21@aws-0-ca-central-1.pooler.supabase.com:5432/facturatrs_dev';

const COMPANY_ID = 1;

async function syncCompany1() {
  const prodPg = new Client({ connectionString: PROD_URL });
  const devPg = new Client({ connectionString: DEV_URL });

  try {
    await prodPg.connect();
    await devPg.connect();
    console.log('✅ Conectado a ambas bases de datos (PROD postgres y DEV facturatrs_dev)');

    // 1. Limpiar datos antiguos de Empresa 1 en DEV
    console.log(`🗑️  Limpiando datos antiguos de Empresa ${COMPANY_ID} en DEV...`);
    await devPg.query(`DELETE FROM detalle_facturas WHERE id_factura IN (SELECT id FROM facturas WHERE id_empresa=$1)`, [COMPANY_ID]);
    await devPg.query(`DELETE FROM auditoria_facturas WHERE id_factura IN (SELECT id FROM facturas WHERE id_empresa=$1)`, [COMPANY_ID]);
    await devPg.query(`DELETE FROM facturas WHERE id_empresa=$1`, [COMPANY_ID]);
    await devPg.query(`DELETE FROM clientes WHERE id_empresa=$1`, [COMPANY_ID]);
    await devPg.query(`DELETE FROM productos_servicios WHERE id_empresa=$1`, [COMPANY_ID]);
    await devPg.query(`DELETE FROM secuencias_ncf WHERE id_empresa=$1`, [COMPANY_ID]);
    await devPg.query(`DELETE FROM progreso_certificacion WHERE id_empresa=$1`, [COMPANY_ID]);
    await devPg.query(`DELETE FROM reportes_dgii WHERE id_empresa=$1`, [COMPANY_ID]);
    await devPg.query(`DELETE FROM recibidos_ecf WHERE id_empresa=$1`, [COMPANY_ID]);
    await devPg.query(`DELETE FROM compras_manual WHERE id_empresa=$1`, [COMPANY_ID]);
    await devPg.query(`DELETE FROM catalogo_cuentas WHERE id_empresa=$1`, [COMPANY_ID]);
    await devPg.query(`DELETE FROM usuario_empresas WHERE id_empresa=$1`, [COMPANY_ID]);
    await devPg.query(`DELETE FROM empresas WHERE id=$1`, [COMPANY_ID]);
    console.log(`  ✅ Datos antiguos de Empresa ${COMPANY_ID} eliminados en DEV`);

    // 2. Extraer datos de PROD
    console.log(`\n📦 Extrayendo datos de Empresa ${COMPANY_ID} desde PROD...`);
    const empRows = (await prodPg.query(`SELECT * FROM empresas WHERE id=$1`, [COMPANY_ID])).rows;
    const clientRows = (await prodPg.query(`SELECT * FROM clientes WHERE id_empresa=$1`, [COMPANY_ID])).rows;
    const prodRows = (await prodPg.query(`SELECT * FROM productos_servicios WHERE id_empresa=$1`, [COMPANY_ID])).rows;
    const invRows = (await prodPg.query(`SELECT * FROM facturas WHERE id_empresa=$1`, [COMPANY_ID])).rows;
    
    const invIds = invRows.map(r => r.id);
    let detailRows: any[] = [];
    if (invIds.length > 0) {
      detailRows = (await prodPg.query(`SELECT * FROM detalle_facturas WHERE id_factura = ANY($1::int[])`, [invIds])).rows;
    }

    const seqRows = (await prodPg.query(`SELECT * FROM secuencias_ncf WHERE id_empresa=$1`, [COMPANY_ID])).rows;
    const certRows = (await prodPg.query(`SELECT * FROM progreso_certificacion WHERE id_empresa=$1`, [COMPANY_ID])).rows;
    const ueRows = (await prodPg.query(`SELECT * FROM usuario_empresas WHERE id_empresa=$1`, [COMPANY_ID])).rows;

    console.log(`  - Empresa: ${empRows.length}`);
    console.log(`  - Clientes: ${clientRows.length}`);
    console.log(`  - Productos/Servicios: ${prodRows.length}`);
    console.log(`  - Facturas: ${invRows.length}`);
    console.log(`  - Ítems de Detalle: ${detailRows.length}`);
    console.log(`  - Secuencias NCF: ${seqRows.length}`);
    console.log(`  - Progreso Certificación: ${certRows.length}`);
    console.log(`  - Usuarios por Empresa: ${ueRows.length}`);

    // Helper para insertar preservando columnas (opcionalmente excluyendo id)
    async function insertRows(table: string, rows: any[], excludeId: boolean = false) {
      if (!rows.length) return;
      let keys = Object.keys(rows[0]);
      if (excludeId) {
        keys = keys.filter(k => k !== 'id');
      }
      const colsStr = keys.join(',');
      const batchSize = 200;
      for (let i = 0; i < rows.length; i += batchSize) {
        const batch = rows.slice(i, i + batchSize);
        const values: any[] = [];
        const placeholders = batch.map((r, ri) => {
          const rowPh = keys.map((k, ki) => {
            values.push(r[k]);
            return `$${ri * keys.length + ki + 1}`;
          });
          return `(${rowPh.join(',')})`;
        });
        const sqlText = `INSERT INTO ${table} (${colsStr}) VALUES ${placeholders.join(',')}`;
        await devPg.query(sqlText, values);
      }
      console.log(`  ✅ Insertados ${rows.length} registros en ${table}`);
    }

    // 3. Insertar datos en DEV
    console.log(`\n🚀 Insertando datos en DEV...`);
    await insertRows('empresas', empRows);
    await insertRows('clientes', clientRows);
    await insertRows('productos_servicios', prodRows);
    await insertRows('facturas', invRows);
    await insertRows('detalle_facturas', detailRows);
    await insertRows('secuencias_ncf', seqRows, true); // Omit id to avoid sequence ID collision with other companies
    await insertRows('progreso_certificacion', certRows, true); // Omit id to avoid sequence ID collision

    // Para usuario_empresas, ignorar duplicados por si el usuario ya está asociado
    for (const ue of ueRows) {
      try {
        await devPg.query(
          `INSERT INTO usuario_empresas (id_usuario, id_empresa, rol, puede_cambiar_empresa, permisos, fecha_creacion)
           VALUES ($1, $2, $3, $4, $5, $6) ON CONFLICT (id_usuario, id_empresa) DO NOTHING`,
          [ue.id_usuario, ue.id_empresa, ue.rol, ue.puede_cambiar_empresa, ue.permisos, ue.fecha_creacion]
        );
      } catch (e: any) {
        console.warn(`  ⚠️ usuario_empresa fallback: ${e.message}`);
      }
    }

    // 4. Actualizar secuencias PostgreSQL
    console.log('\n🔢 Sincronizando secuencias ID de PostgreSQL en DEV...');
    const tablesWithSeq = [
      ['empresas_id_seq', 'empresas'],
      ['clientes_id_seq', 'clientes'],
      ['productos_servicios_id_seq', 'productos_servicios'],
      ['facturas_id_seq', 'facturas'],
      ['detalle_facturas_id_seq', 'detalle_facturas'],
      ['secuencias_ncf_id_seq', 'secuencias_ncf'],
      ['progreso_certificacion_id_seq', 'progreso_certificacion'],
    ];
    for (const [seq, tbl] of tablesWithSeq) {
      const r = await devPg.query(`SELECT COALESCE(MAX(id),0) m FROM ${tbl}`);
      await devPg.query(`SELECT setval('${seq}', GREATEST(${Number(r.rows[0].m)}, 1))`);
    }
    console.log('✅ Secuencias sincronizadas');

    console.log('\n🎉 ¡Sincronización completada exitosamente!');
  } catch (err: any) {
    console.error('❌ Error en sincronización:', err);
  } finally {
    await prodPg.end();
    await devPg.end();
  }
}

syncCompany1();
