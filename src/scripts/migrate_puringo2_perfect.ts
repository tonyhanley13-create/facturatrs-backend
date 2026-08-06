import sql from 'mssql';

async function migratePuringo2Perfect() {
  const dbConfig: sql.config = {
    user: 'sa',
    password: 'Kibalion2',
    server: 'localhost',
    options: {
      trustServerCertificate: true,
      encrypt: false,
    },
  };

  try {
    const pool = await sql.connect(dbConfig);
    console.log('🚀 Iniciando migración ultra-rápida y perfecta de puringo2 -> FacturaTRS...');

    // 1. Obtener o Crear la Empresa "Ooptions Xpress" en FacturaTRS
    const companyCheck = await pool.request().query(`
      SELECT id FROM FacturaTRS.dbo.empresas WHERE nombre LIKE '%Ooptions Xpress%' OR nombre LIKE '%Options Xpress%'
    `);

    let companyId: number;

    if (companyCheck.recordset.length > 0) {
      companyId = companyCheck.recordset[0].id;
      console.log(`✅ Empresa 'Ooptions Xpress' encontrada con ID: ${companyId}`);
    } else {
      const createComp = await pool.request().query(`
        INSERT INTO FacturaTRS.dbo.empresas 
        (nombre, rnc, direccion, telefono, email, modalidad_facturacion, proximo_numero_factura, id_usuario, fecha_creacion)
        OUTPUT INSERTED.id
        VALUES 
        ('Ooptions Xpress', '131976077', 'Santo Domingo, Rep. Dom.', '809-566-5080', 'info@optionsxpress.com', 'tradicional', 4124, 20, GETDATE())
      `);
      companyId = createComp.recordset[0].id;
      console.log(`✨ Creada nueva empresa 'Ooptions Xpress' con ID: ${companyId}`);
    }

    // Vinculo con Super Admin (usuario 20)
    await pool.request().query(`
      IF NOT EXISTS (SELECT 1 FROM FacturaTRS.dbo.usuario_empresas WHERE id_empresa = ${companyId} AND id_usuario = 20)
      BEGIN
        INSERT INTO FacturaTRS.dbo.usuario_empresas (id_empresa, id_usuario, rol, fecha_creacion)
        VALUES (${companyId}, 20, 'admin', GETDATE())
      END
    `);

    // Limpiar datos previos si existieran para re-importación limpia
    console.log('🧹 Limpiando facturas e ítems previos para esta empresa...');
    await pool.request().query(`
      DELETE FROM FacturaTRS.dbo.detalle_facturas 
      WHERE id_factura IN (SELECT id FROM FacturaTRS.dbo.facturas WHERE id_empresa = ${companyId});
      DELETE FROM FacturaTRS.dbo.facturas WHERE id_empresa = ${companyId};
      DELETE FROM FacturaTRS.dbo.productos_servicios WHERE id_empresa = ${companyId};
      DELETE FROM FacturaTRS.dbo.clientes WHERE id_empresa = ${companyId};
    `);

    // 2. MIGRAR CLIENTES
    console.log('👤 Migrando clientes desde puringo2...');
    const oldClients = await pool.request().query('SELECT * FROM puringo2.dbo.clientes');
    const clientMap = new Map<string, number>();

    for (const cl of oldClients.recordset) {
      const code = String(cl.codigo || '').trim();
      const name = String(cl.nombre || 'CLIENTE').trim();
      const rnc = String(cl.rnc || cl.cedula || '00000000000').replaceAll(/\D/g, '');
      const phone = String(cl.telefono1 || '').trim();
      const address = String(cl.direccion || '').trim();
      const created = cl._updated ? new Date(cl._updated).toISOString() : new Date().toISOString();

      const ins = await pool.request().query(`
        INSERT INTO FacturaTRS.dbo.clientes 
        (id_empresa, id_usuario, nombre, rnc_cedula, telefono, direccion, tipo_cliente, fecha_creacion)
        OUTPUT INSERTED.id
        VALUES 
        (${companyId}, 20, '${name.replace(/'/g, "''")}', '${rnc}', '${phone.replace(/'/g, "''")}', '${address.replace(/'/g, "''")}', 'individual', '${created}')
      `);
      clientMap.set(code, ins.recordset[0].id);
    }
    console.log(`✅ ${clientMap.size} clientes migrados.`);

    // 3. MIGRAR PRODUCTOS
    console.log('📦 Migrando productos desde puringo2...');
    const oldMercs = await pool.request().query('SELECT * FROM puringo2.dbo.mercs');
    const productMap = new Map<string, number>();

    for (const m of oldMercs.recordset) {
      const code = String(m.codigo || '').trim();
      const name = String(m.nombre || 'PRODUCTO').trim();
      const price = Number(m.precio1 || m.costo || 0);
      const created = m._updated ? new Date(m._updated).toISOString() : new Date().toISOString();

      const ins = await pool.request().query(`
        INSERT INTO FacturaTRS.dbo.productos_servicios 
        (id_empresa, id_usuario, codigo, nombre, descripcion, precio_unitario, porcentaje_itbis, tipo, esta_activo, fecha_creacion)
        OUTPUT INSERTED.id
        VALUES 
        (${companyId}, 20, '${code.replace(/'/g, "''")}', '${name.replace(/'/g, "''")}', '${name.replace(/'/g, "''")}', ${price}, 18, 'servicio', 1, '${created}')
      `);
      productMap.set(code, ins.recordset[0].id);
    }
    console.log(`✅ ${productMap.size} productos migrados.`);

    // 4. MIGRAR FACTURAS
    console.log('📜 Migrando facturas desde puringo2...');
    const oldInvoices = await pool.request().query('SELECT * FROM puringo2.dbo.imtr ORDER BY fcreacion ASC');

    const controlMap = new Map<string, number>();
    let migratedInvoicesCount = 0;
    let maxInvoiceNum = 0;

    for (const inv of oldInvoices.recordset) {
      const control = String(inv.control || '').trim();
      const docType = String(inv.doc || 'FC').trim();
      const num = Number(inv.numero || 0);
      if (num > maxInvoiceNum) maxInvoiceNum = num;

      const invNumber = `${docType}-${num}`;
      let ncfRaw = inv.ncf ? String(inv.ncf).replaceAll(/\s+/g, '').trim() : null;
      if (ncfRaw && ncfRaw.length < 11 && ncfRaw.startsWith('B01')) {
        const digits = ncfRaw.substring(3);
        ncfRaw = 'B01' + digits.padStart(8, '0');
      } else if (ncfRaw && ncfRaw.length < 11 && ncfRaw.startsWith('B02')) {
        const digits = ncfRaw.substring(3);
        ncfRaw = 'B02' + digits.padStart(8, '0');
      }

      const clieCode = String(inv.entidad || '').trim();
      const clientId = clientMap.get(clieCode) || Array.from(clientMap.values())[0] || null;

      const total = Number(inv.total || inv.valor || 0);
      const tax = Number(inv.itbis || 0);
      const subtotal = total - tax;
      const comment = inv.comentario ? String(inv.comentario).trim() : '';
      const created = inv.fcreacion ? new Date(inv.fcreacion).toISOString() : (inv.fecha ? new Date(inv.fecha).toISOString() : new Date().toISOString());

      const ncfStr = ncfRaw ? `'${ncfRaw}'` : 'NULL';
      const clieStr = clientId ? `${clientId}` : 'NULL';

      const ins = await pool.request().query(`
        INSERT INTO FacturaTRS.dbo.facturas 
        (id_empresa, id_cliente, id_usuario, numero_factura, ncf, tipo_documento, monto_bruto, subtotal, monto_itbis, monto_descuento, monto_total, moneda, estado, descripcion, fecha_creacion)
        OUTPUT INSERTED.id
        VALUES 
        (${companyId}, ${clieStr}, 20, '${invNumber}', ${ncfStr}, 'tradicional', ${subtotal}, ${subtotal}, ${tax}, 0, ${total}, 'DOP', 'issued', '${comment.replace(/'/g, "''")}', '${created}')
      `);

      const newId = ins.recordset[0].id;
      controlMap.set(control, newId);
      migratedInvoicesCount++;
    }
    console.log(`✅ ${migratedInvoicesCount} facturas migradas. Número mayor: ${maxInvoiceNum}`);

    // 5. MIGRAR DETALLE DE FACTURAS
    console.log('🧩 Migrando detalles de factura (imtrd) desde puringo2...');
    const oldItems = await pool.request().query('SELECT * FROM puringo2.dbo.imtrd');
    let itemInsertCount = 0;

    for (const item of oldItems.recordset) {
      const control = String(item.control || '').trim();
      const invId = controlMap.get(control);

      if (!invId) continue;

      const mercCode = String(item.merc || '').trim();
      const productId = productMap.get(mercCode) || null;
      const prodStr = productId ? `${productId}` : 'NULL';
      const description = item.descrip ? String(item.descrip).trim() : 'SERVICIO DE TRANSPORTE';
      const qty = Number(item.cantidad || 1);
      const price = Number(item.precio || 0);
      const itemTax = Number(item.itbis || 0);
      const total = Number(item.total || item.valor || price * qty);
      const subtotal = total - itemTax;
      const created = item._updated ? new Date(item._updated).toISOString() : new Date().toISOString();

      await pool.request().query(`
        INSERT INTO FacturaTRS.dbo.detalle_facturas 
        (id_factura, numero_linea, codigo_item, nombre_item, descripcion, cantidad, precio_unitario, porcentaje_descuento, porcentaje_itbis, subtotal, monto_itbis, monto_total, indicador_facturacion, indicador_bien_servicio, unidad_medida, fecha_creacion)
        VALUES 
        (${invId}, 1, '${mercCode.replace(/'/g, "''")}', '${description.replace(/'/g, "''")}', '${description.replace(/'/g, "''")}', ${qty}, ${price}, 0, 18, ${subtotal}, ${itemTax}, ${total}, 1, 2, 'unidad', '${created}')
      `);
      itemInsertCount++;
    }
    console.log(`✅ ${itemInsertCount} detalles de factura migrados.`);

    // 6. ACTUALIZAR CONTADORES Y RANGOS NCF EN FacturaTRS
    const nextInvoice = maxInvoiceNum + 1;
    console.log(`🔄 Sincronizando secuencias NCF y contador (${nextInvoice}) para Ooptions Xpress...`);

    await pool.request().query(`
      UPDATE FacturaTRS.dbo.empresas 
      SET 
        proximo_numero_factura = '${nextInvoice}',
        modalidad_facturacion = 'tradicional',
        fecha_actualizacion = GETDATE()
      WHERE id = ${companyId};
    `);

    // Sincronizar secuencias_ncf si existe
    try {
      await pool.request().query(`
        IF EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'secuencias_ncf')
        BEGIN
          MERGE FacturaTRS.dbo.secuencias_ncf AS target
          USING (VALUES (${companyId}, 'B01', 5590, 9000, '31-12-2028'), (${companyId}, 'B02', 7, 3000, '31-12-2028'))
          AS source (id_empresa, tipo_ncf, siguiente, fin, fecha_vencimiento)
          ON target.id_empresa = source.id_empresa AND target.tipo_ncf = source.tipo_ncf
          WHEN MATCHED THEN 
            UPDATE SET siguiente = source.siguiente, fin = source.fin, fecha_vencimiento = source.fecha_vencimiento
          WHEN NOT MATCHED THEN
            INSERT (id_empresa, tipo_ncf, siguiente, fin, fecha_vencimiento)
            VALUES (source.id_empresa, source.tipo_ncf, source.siguiente, source.fin, source.fecha_vencimiento);
        END
      `);
    } catch (_) {}

    console.log('\n🎉 ¡MIGRACIÓN PERFECTA DE puringo2 A Ooptions Xpress COMPLETADA CON ÉXITO!');
    console.log(`🏢 Empresa ID: ${companyId} (Ooptions Xpress)`);
    console.log(`👤 Clientes: ${clientMap.size}`);
    console.log(`📦 Productos: ${productMap.size}`);
    console.log(`📜 Facturas: ${migratedInvoicesCount}`);
    console.log(`🧩 Ítems de detalle: ${itemInsertCount}`);
    console.log(`🔢 Próxima Factura: FC-${nextInvoice}`);
    console.log(`📜 Próximo NCF B01: B0100005590 (Rango hasta 9000)`);

    await pool.close();
  } catch (err: any) {
    console.error('❌ Error en la migración:', err.message);
  }
}

migratePuringo2Perfect();
