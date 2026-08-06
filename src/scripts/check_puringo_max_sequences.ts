import sql from 'mssql';

async function checkMaxSequences() {
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

    // 1. Obtener la empresa Transporte Puringo Cruz
    const companyRes = await pool.request().query("SELECT id, nombre, rnc, next_invoice_number FROM empresas WHERE id = 28 OR rnc = '00102620424' OR nombre LIKE '%PURINGO%'");
    console.log('🏢 Empresas encontradas:');
    console.table(companyRes.recordset);

    for (const company of companyRes.recordset) {
      const companyId = company.id;
      console.log(`\n==================================================`);
      console.log(`📊 Análisis de Secuencias para Empresa ID ${companyId} (${company.nombre})`);

      // 2. Facturas máximas por prefijo NCF
      const ncfRes = await pool.request().query(`
        SELECT 
          tipo, 
          prefijo, 
          siguiente as siguiente_en_tabla_secuencias, 
          final
        FROM secuencias_ncf 
        WHERE id_empresa = ${companyId}
      `);
      console.log('\n🔢 Secuencias en secuencias_ncf:');
      console.table(ncfRes.recordset);

      // 3. Revisar en FacturaTRS.dbo.facturas las facturas emitidas y sus NCF
      const maxB01 = await pool.request().query(`
        SELECT MAX(CAST(SUBSTRING(ncf, 4, 8) AS INT)) as max_b01 
        FROM facturas 
        WHERE id_empresa = ${companyId} AND ncf LIKE 'B01%'
      `);

      const maxB02 = await pool.request().query(`
        SELECT MAX(CAST(SUBSTRING(ncf, 4, 8) AS INT)) as max_b02 
        FROM facturas 
        WHERE id_empresa = ${companyId} AND ncf LIKE 'B02%'
      `);

      console.log(`📈 NCF máximo B01 en tabla facturas: ${maxB01.recordset[0].max_b01 || 'Ninguno'}`);
      console.log(`📈 NCF máximo B02 en tabla facturas: ${maxB02.recordset[0].max_b02 || 'Ninguno'}`);

      // 4. Correlativo numérico de número de factura
      const maxInvNumRes = await pool.request().query(`SELECT TOP 10 numero_factura FROM facturas WHERE id_empresa = ${companyId} ORDER BY id DESC`);
      console.log(`\n📝 Últimos 10 números de factura ingresados:`);
      console.table(maxInvNumRes.recordset);
    }

    await pool.close();
  } catch (err: any) {
    console.error('❌ Error:', err.message);
  }
}

checkMaxSequences();
