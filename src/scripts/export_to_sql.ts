import { Client } from 'pg';
import * as fs from 'fs';
import * as path from 'path';

const DEV_URL = 'postgresql://postgres.ewtacqiyschgtcpflzub:Kibalion2%40%40%21@aws-0-ca-central-1.pooler.supabase.com:5432/facturatrs_dev';

async function exportSql() {
  const pg = new Client({ connectionString: DEV_URL, ssl: { rejectUnauthorized: false } });
  await pg.connect();
  console.log('✅ Conectado a DEV para exportar script SQL...');

  let sql = `-- BACKUP COMPLETO PARA HOSTINGER (Puringo Cruz, Options Xpress y Transporte Máximo)\n\n`;

  const tables = ['empresas', 'clientes', 'productos_servicios', 'facturas', 'detalle_facturas', 'secuencias_ncf', 'progreso_certificacion', 'usuario_empresas'];

  for (const tbl of tables) {
    const rows = (await pg.query(`SELECT * FROM ${tbl}`)).rows;
    if (!rows.length) continue;

    sql += `-- Tabla: ${tbl} (${rows.length} registros)\n`;
    
    // Generar INSERT statements
    const keys = Object.keys(rows[0]);
    const colsStr = keys.map(k => `"${k}"`).join(',');

    const batchSize = 100;
    for (let i = 0; i < rows.length; i += batchSize) {
      const batch = rows.slice(i, i + batchSize);
      const valuesStr = batch.map(r => {
        const rowVals = keys.map(k => {
          const val = r[k];
          if (val === null || val === undefined) return 'NULL';
          if (typeof val === 'number' || typeof val === 'boolean') return val;
          if (val instanceof Date) return `'${val.toISOString()}'`;
          if (typeof val === 'object') return `'${JSON.stringify(val).replace(/'/g, "''")}'`;
          return `'${String(val).replace(/'/g, "''")}'`;
        });
        return `(${rowVals.join(',')})`;
      }).join(',\n');

      if (tbl === 'usuario_empresas') {
        sql += `INSERT INTO "${tbl}" (${colsStr}) VALUES\n${valuesStr}\nON CONFLICT (id_usuario, id_empresa) DO NOTHING;\n\n`;
      } else {
        sql += `INSERT INTO "${tbl}" (${colsStr}) VALUES\n${valuesStr}\nON CONFLICT (id) DO UPDATE SET ${keys.filter(k => k !== 'id').map(k => `"${k}" = EXCLUDED."${k}"`).join(', ')};\n\n`;
      }
    }
  }

  // Secuencias
  const seqs = [
    ['empresas_id_seq', 'empresas'],
    ['clientes_id_seq', 'clientes'],
    ['productos_servicios_id_seq', 'productos_servicios'],
    ['facturas_id_seq', 'facturas'],
    ['detalle_facturas_id_seq', 'detalle_facturas'],
    ['secuencias_ncf_id_seq', 'secuencias_ncf'],
    ['progreso_certificacion_id_seq', 'progreso_certificacion'],
  ];

  sql += `-- Sincronización de secuencias\n`;
  for (const [seq, tbl] of seqs) {
    sql += `SELECT setval('${seq}', COALESCE((SELECT MAX(id) FROM "${tbl}"), 1));\n`;
  }

  const outputPath = path.join(__dirname, '../../hostinger_sync.sql');
  fs.writeFileSync(outputPath, sql);
  console.log(`✅ Archivo SQL generado exitosamente en: ${outputPath}`);

  await pg.end();
}

exportSql().catch(console.error);
