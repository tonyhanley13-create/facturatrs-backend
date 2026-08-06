import sql from 'mssql';

async function checkCompaniesAndPuringo2() {
  const configMaster: sql.config = {
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
    const poolMaster = await sql.connect(configMaster);
    console.log('✅ Conectado a FacturaTRS (Master)!');

    // 1. Listar empresas existentes
    const companies = await poolMaster.request().query(`
      SELECT id, nombre, rnc, id_usuario, modalidad_facturacion, proximo_numero_factura, rnc_secuencias
      FROM empresas
    `);
    console.log('\n🏢 Empresas existentes en FacturaTRS:');
    console.table(companies.recordset);

    await poolMaster.close();

    // 2. Conectar a BD puringo2
    const configPuringo2: sql.config = {
      user: 'sa',
      password: 'Kibalion2',
      server: 'localhost',
      database: 'puringo2',
      options: {
        trustServerCertificate: true,
        encrypt: false,
      },
    };

    const poolPuringo2 = await sql.connect(configPuringo2);
    console.log('\n✅ Conectado a BD puringo2!');

    // Inspeccionar tablas en puringo2
    const tables = await poolPuringo2.request().query(`
      SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_TYPE = 'BASE TABLE'
    `);
    console.log('📋 Tablas en puringo2:');
    console.log(tables.recordset.map((t: any) => t.TABLE_NAME).join(', '));

    // Contar registros principales
    const clientesCount = await poolPuringo2.request().query('SELECT COUNT(*) as c FROM clientes');
    const mercsCount = await poolPuringo2.request().query('SELECT COUNT(*) as c FROM mercs');
    const imtrCount = await poolPuringo2.request().query('SELECT COUNT(*) as c FROM imtr');
    const imtrdCount = await poolPuringo2.request().query('SELECT COUNT(*) as c FROM imtrd');

    console.log(`\n📊 Conteos en puringo2:`);
    console.log(`   - Clientes: ${clientesCount.recordset[0].c}`);
    console.log(`   - Productos (mercs): ${mercsCount.recordset[0].c}`);
    console.log(`   - Facturas (imtr): ${imtrCount.recordset[0].c}`);
    console.log(`   - Ítems de detalle (imtrd): ${imtrdCount.recordset[0].c}`);

    // Tipos de documentos y rangos NCF
    const docTypes = await poolPuringo2.request().query(`
      SELECT doc, COUNT(*) as total, MIN(numero) as min_num, MAX(numero) as max_num 
      FROM imtr 
      GROUP BY doc 
      ORDER BY total DESC
    `);
    console.log('\n📑 Tipos de documento en puringo2:');
    console.table(docTypes.recordset);

    const ncfTypes = await poolPuringo2.request().query(`
      SELECT SUBSTRING(ncf, 1, 3) as ncf_prefix, COUNT(*) as total, MIN(ncf) as min_ncf, MAX(ncf) as max_ncf 
      FROM imtr 
      WHERE ncf IS NOT NULL AND LEN(ncf) >= 3
      GROUP BY SUBSTRING(ncf, 1, 3)
    `);
    console.log('\n📜 Rangos NCF en puringo2:');
    console.table(ncfTypes.recordset);

    await poolPuringo2.close();
  } catch (err: any) {
    console.error('❌ Error:', err.message);
  }
}

checkCompaniesAndPuringo2();
