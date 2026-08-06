import sql from 'mssql';

async function addMissingColumns() {
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
    console.log('✅ Conectado a FacturaTRS para asegurar columnas...');

    // 1. token_sesion en usuarios
    await pool.request().query(`
      IF NOT EXISTS (
        SELECT * FROM INFORMATION_SCHEMA.COLUMNS 
        WHERE TABLE_NAME = 'usuarios' AND COLUMN_NAME = 'token_sesion'
      )
      BEGIN
        ALTER TABLE FacturaTRS.dbo.usuarios ADD token_sesion VARCHAR(500);
        PRINT 'Columna token_sesion agregada a usuarios';
      END
    `);

    // 2. nombre_db en empresas
    await pool.request().query(`
      IF NOT EXISTS (
        SELECT * FROM INFORMATION_SCHEMA.COLUMNS 
        WHERE TABLE_NAME = 'empresas' AND COLUMN_NAME = 'nombre_db'
      )
      BEGIN
        ALTER TABLE FacturaTRS.dbo.empresas ADD nombre_db VARCHAR(100);
        PRINT 'Columna nombre_db agregada a empresas';
      END
    `);

    // 3. modalidad_facturacion en empresas (si falta)
    await pool.request().query(`
      IF NOT EXISTS (
        SELECT * FROM INFORMATION_SCHEMA.COLUMNS 
        WHERE TABLE_NAME = 'empresas' AND COLUMN_NAME = 'modalidad_facturacion'
      )
      BEGIN
        ALTER TABLE FacturaTRS.dbo.empresas ADD modalidad_facturacion VARCHAR(20) DEFAULT 'tradicional';
        PRINT 'Columna modalidad_facturacion agregada a empresas';
      END
    `);

    console.log('🎉 Todas las columnas necesarias fueron agregadas a SQL Server.');
    await pool.close();
  } catch (err: any) {
    console.error('❌ Error agregando columnas:', err.message);
  }
}

addMissingColumns();
