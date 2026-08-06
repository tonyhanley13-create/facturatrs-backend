import sql from 'mssql';

async function syncSequences() {
  console.log('🚀 Sincronizando contadores de factura y secuencias NCF con los datos migrados...');

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
    const companyIds = [1, 28];

    for (const companyId of companyIds) {
      // 1. Sincronizar next_invoice_number de la Empresa (ID 28 tuvo factura FTC-2341 -> siguiente 2342)
      const invs = await pool.request().query(`
        SELECT numero_factura 
        FROM facturas 
        WHERE id_empresa = ${companyId} AND numero_factura LIKE '%-%'
      `);

      let maxNum = 0;
      for (const row of invs.recordset) {
        const parts = row.numero_factura.split('-');
        const numPart = parseInt(parts[parts.length - 1], 10);
        if (!isNaN(numPart) && numPart > maxNum) {
          maxNum = numPart;
        }
      }

      const nextInvoiceNum = Math.max(maxNum + 1, 2342);

      await pool.request().query(`
        UPDATE empresas 
        SET next_invoice_number = ${nextInvoiceNum}, modalidad_facturacion = 'tradicional'
        WHERE id = ${companyId}
      `);

      // También actualizar en company_settings legacy por consistencia
      await pool.request().query(`
        UPDATE company_settings 
        SET next_invoice_number = ${nextInvoiceNum}
        WHERE user_id IN (SELECT id_usuario FROM usuario_empresas WHERE id_empresa = ${companyId})
      `);

      console.log(`✅ Empresa ID ${companyId}: próximo número de factura actualizado a ${nextInvoiceNum} (FACT-${nextInvoiceNum.toString().padStart(6, '0')})`);

      // 2. Sincronizar secuencias NCF (B01 a 12818, B02 a 5)
      await pool.request().query(`
        UPDATE secuencias_ncf
        SET siguiente = 12818, final = 14026
        WHERE id_empresa = ${companyId} AND tipo = 'B01';

        UPDATE secuencias_ncf
        SET siguiente = 5, final = 3000
        WHERE id_empresa = ${companyId} AND tipo = 'B02';
      `);

      console.log(`✅ Empresa ID ${companyId}: Secuencias NCF B01 (siguiente: 12818) y B02 (siguiente: 5) sincronizadas.`);
    }

    await pool.close();
    console.log('\n🎉 Sincronización completa finalizada exitosamente.');
  } catch (err: any) {
    console.error('❌ Error:', err.message);
  }
}

syncSequences();
