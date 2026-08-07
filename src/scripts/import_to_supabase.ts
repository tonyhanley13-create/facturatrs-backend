import { Client } from 'pg';
import * as fs from 'fs';
import * as path from 'path';

process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

const SUPABASE_URL = 'postgresql://postgres.ewtacqiyschgtcpflzub:Kibalion2%40%40%21@aws-0-ca-central-1.pooler.supabase.com:5432/facturatrs_dev?sslmode=require';

async function importToSupabase() {
  const pg = new Client({ connectionString: SUPABASE_URL, ssl: { rejectUnauthorized: false } });
  await pg.connect();
  console.log('✅ Conectado a Supabase (facturatrs_dev)...');

  const sqlPath = path.join(__dirname, '../../hostinger_sync.sql');
  const sql = fs.readFileSync(sqlPath, 'utf8');

  console.log(`📄 Ejecutando todo el script hostinger_sync.sql (${(sql.length / 1024 / 1024).toFixed(2)} MB)...`);
  
  await pg.query(sql);

  console.log('✅ Sincronización a Supabase completada con éxito.');
  await pg.end();
}

importToSupabase().catch(err => {
  console.error('❌ Error en importToSupabase:', err);
  process.exit(1);
});
