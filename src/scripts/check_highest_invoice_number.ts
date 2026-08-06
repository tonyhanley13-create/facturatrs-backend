import sql from 'mssql';

async function checkHighestInvoiceNumber() {
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

    const companies = [1, 28];
    for (const compId of companies) {
      console.log(`\n==================================================`);
      console.log(`🔍 Análisis de número máximo de factura para Empresa ID ${compId}`);

      // Buscar todos los números de factura que tengan formato con guión ej 'FTC-2341'
      const invs = await pool.request().query(`
        SELECT numero_factura 
        FROM facturas 
        WHERE id_empresa = ${compId} AND numero_factura LIKE '%-%'
      `);

      let maxNum = 0;
      let maxStr = '';

      for (const row of invs.recordset) {
        const parts = row.numero_factura.split('-');
        const numPart = parseInt(parts[parts.length - 1], 10);
        if (!isNaN(numPart) && numPart > maxNum) {
          maxNum = numPart;
          maxStr = row.numero_factura;
        }
      }

      console.log(`📌 Número máximo numérico extraído de facturas: ${maxNum} (${maxStr})`);

      // Verificar next_invoice_number actual en empresas
      const currentRes = await pool.request().query(`SELECT next_invoice_number, rnc, nombre FROM empresas WHERE id = ${compId}`);
      console.log(`📌 next_invoice_number en empresas: ${currentRes.recordset[0]?.next_invoice_number}`);
    }

    await pool.close();
  } catch (err: any) {
    console.error('❌ Error:', err.message);
  }
}

checkHighestInvoiceNumber();
