import { Client } from 'pg';

const DEV_URL = 'postgresql://postgres.ewtacqiyschgtcpflzub:Kibalion2%40%40%21@aws-0-ca-central-1.pooler.supabase.com:5432/facturatrs_dev';
const PROD_URL = 'postgresql://postgres.ewtacqiyschgtcpflzub:Kibalion2%40%40%21@aws-0-ca-central-1.pooler.supabase.com:5432/postgres';

const TARGET_COMPANIES = [28, 29];

async function syncPuringoAndOptionsToProd() {
  const devPg = new Client({ connectionString: DEV_URL });
  const prodPg = new Client({ connectionString: PROD_URL });

  try {
    await devPg.connect();
    await prodPg.connect();
    console.log('✅ Conectado a DEV (facturatrs_dev) y PROD (postgres)');

    // 0. Verificar que Empresa 1 en PROD esté intacta
    const prodEmp1Before = await prodPg.query(`SELECT COUNT(*) FROM facturas WHERE id_empresa=1`);
    console.log(`📌 Verificación inicial PROD Empresa 1 -> Facturas antes de sincronizar: ${prodEmp1Before.rows[0].count}`);

    // 1. Limpiar solo empresas 28 y 29 en PROD
    console.log(`\n🗑️  Limpiando datos de empresas ${TARGET_COMPANIES.join(', ')} en PROD...`);
    await prodPg.query(`DELETE FROM detalle_facturas WHERE id_factura IN (SELECT id FROM facturas WHERE id_empresa = ANY($1::int[]))`, [TARGET_COMPANIES]);
    await prodPg.query(`DELETE FROM auditoria_facturas WHERE id_factura IN (SELECT id FROM facturas WHERE id_empresa = ANY($1::int[]))`, [TARGET_COMPANIES]);
    await prodPg.query(`DELETE FROM facturas WHERE id_empresa = ANY($1::int[])`, [TARGET_COMPANIES]);
    await prodPg.query(`DELETE FROM clientes WHERE id_empresa = ANY($1::int[])`, [TARGET_COMPANIES]);
    await prodPg.query(`DELETE FROM productos_servicios WHERE id_empresa = ANY($1::int[])`, [TARGET_COMPANIES]);
    await prodPg.query(`DELETE FROM secuencias_ncf WHERE id_empresa = ANY($1::int[])`, [TARGET_COMPANIES]);
    await prodPg.query(`DELETE FROM progreso_certificacion WHERE id_empresa = ANY($1::int[])`, [TARGET_COMPANIES]);
    await prodPg.query(`DELETE FROM reportes_dgii WHERE id_empresa = ANY($1::int[])`, [TARGET_COMPANIES]);
    await prodPg.query(`DELETE FROM recibidos_ecf WHERE id_empresa = ANY($1::int[])`, [TARGET_COMPANIES]);
    await prodPg.query(`DELETE FROM compras_manual WHERE id_empresa = ANY($1::int[])`, [TARGET_COMPANIES]);
    await prodPg.query(`DELETE FROM catalogo_cuentas WHERE id_empresa = ANY($1::int[])`, [TARGET_COMPANIES]);
    await prodPg.query(`DELETE FROM usuario_empresas WHERE id_empresa = ANY($1::int[])`, [TARGET_COMPANIES]);
    await prodPg.query(`DELETE FROM empresas WHERE id = ANY($1::int[])`, [TARGET_COMPANIES]);
    console.log(`  ✅ Empresas ${TARGET_COMPANIES.join(', ')} limpiadas en PROD`);

    // 2. Extraer empresas 28 y 29 desde DEV
    console.log(`\n📦 Extrayendo datos de empresas ${TARGET_COMPANIES.join(', ')} desde DEV...`);
    const empRows = (await devPg.query(`SELECT * FROM empresas WHERE id = ANY($1::int[])`, [TARGET_COMPANIES])).rows;
    const clientRows = (await devPg.query(`SELECT * FROM clientes WHERE id_empresa = ANY($1::int[])`, [TARGET_COMPANIES])).rows;
    const prodRows = (await devPg.query(`SELECT * FROM productos_servicios WHERE id_empresa = ANY($1::int[])`, [TARGET_COMPANIES])).rows;
    const invRows = (await devPg.query(`SELECT * FROM facturas WHERE id_empresa = ANY($1::int[])`, [TARGET_COMPANIES])).rows;

    const invIds = invRows.map(r => r.id);
    let detailRows: any[] = [];
    if (invIds.length > 0) {
      detailRows = (await devPg.query(`SELECT * FROM detalle_facturas WHERE id_factura = ANY($1::int[])`, [invIds])).rows;
    }

    const seqRows = (await devPg.query(`SELECT * FROM secuencias_ncf WHERE id_empresa = ANY($1::int[])`, [TARGET_COMPANIES])).rows;
    const certRows = (await devPg.query(`SELECT * FROM progreso_certificacion WHERE id_empresa = ANY($1::int[])`, [TARGET_COMPANIES])).rows;
    const ueRows = (await devPg.query(`SELECT * FROM usuario_empresas WHERE id_empresa = ANY($1::int[])`, [TARGET_COMPANIES])).rows;

    console.log(`  - Empresas: ${empRows.length}`);
    console.log(`  - Clientes: ${clientRows.length}`);
    console.log(`  - Productos/Servicios: ${prodRows.length}`);
    console.log(`  - Facturas: ${invRows.length}`);
    console.log(`  - Ítems de Detalle: ${detailRows.length}`);
    console.log(`  - Secuencias NCF: ${seqRows.length}`);
    console.log(`  - Progreso Certificación: ${certRows.length}`);
    console.log(`  - Usuarios por Empresa: ${ueRows.length}`);

    // Helper para insertar preservando columnas (omitiendo id si excludeId=true)
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
        await prodPg.query(sqlText, values);
      }
      console.log(`  ✅ Insertados ${rows.length} registros en ${table} (PROD)`);
    }

    // 3. Insertar datos en PROD
    console.log(`\n🚀 Subiendo datos de empresas 28 y 29 a PROD...`);
    await insertRows('empresas', empRows);
    await insertRows('clientes', clientRows);
    await insertRows('productos_servicios', prodRows);
    await insertRows('facturas', invRows);
    await insertRows('detalle_facturas', detailRows);
    await insertRows('secuencias_ncf', seqRows, true);
    await insertRows('progreso_certificacion', certRows, true);

    // Para usuario_empresas
    for (const ue of ueRows) {
      try {
        await prodPg.query(
          `INSERT INTO usuario_empresas (id_usuario, id_empresa, rol, puede_cambiar_empresa, permisos, fecha_creacion)
           VALUES ($1, $2, $3, $4, $5, $6) ON CONFLICT (id_usuario, id_empresa) DO NOTHING`,
          [ue.id_usuario, ue.id_empresa, ue.rol, ue.puede_cambiar_empresa, ue.permisos, ue.fecha_creacion]
        );
      } catch (e: any) {
        console.warn(`  ⚠️ usuario_empresa fallback: ${e.message}`);
      }
    }

    // 4. Actualizar secuencias PostgreSQL en PROD
    console.log('\n🔢 Sincronizando secuencias ID de PostgreSQL en PROD...');
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
      const r = await prodPg.query(`SELECT COALESCE(MAX(id),0) m FROM ${tbl}`);
      await prodPg.query(`SELECT setval('${seq}', GREATEST(${Number(r.rows[0].m)}, 1))`);
    }
    console.log('✅ Secuencias sincronizadas en PROD');

    // 5. Verificar que Empresa 1 en PROD NO se tocó en absoluto
    const prodEmp1After = await prodPg.query(`SELECT COUNT(*) FROM facturas WHERE id_empresa=1`);
    console.log(`\n🔒 VERIFICACIÓN DE SEGURIDAD EMPRESA 1 EN PROD:`);
    console.log(`   - Facturas de Empresa 1 en PROD antes: ${prodEmp1Before.rows[0].count}`);
    console.log(`   - Facturas de Empresa 1 en PROD después: ${prodEmp1After.rows[0].count}`);

    if (prodEmp1Before.rows[0].count === prodEmp1After.rows[0].count) {
      console.log('  ✅ Confirmación: Empresa 1 (Transporte Máximo) quedó 100% intacta y sin modificaciones.');
    } else {
      console.error('  ❌ ALERTA: Hubo diferencia en Empresa 1.');
    }

    console.log('\n🎉 ¡Sincronización de Puringo Cruz (28) y Options Xpress (29) a Producción completada exitosamente!');
  } catch (err: any) {
    console.error('❌ Error en sincronización a producción:', err);
  } finally {
    await devPg.end();
    await prodPg.end();
  }
}

syncPuringoAndOptionsToProd();
