import sql from 'mssql';

async function migrateFullPuringoWithItems() {
  console.log('🚀 Iniciando re-importación completa de PURINGO con comentarios e items de detalle...');

  const config: sql.config = {
    user: 'sa',
    password: 'Kibalion2',
    server: 'localhost',
    options: {
      trustServerCertificate: true,
      encrypt: false,
    },
  };

  try {
    const pool = await sql.connect(config);
    console.log('✅ Conectado a SQL Server.');

    // 1. Obtener empresa Puringo Cruz
    const companyRes = await pool.request().query(`
      SELECT id, nombre FROM FacturaTRS.dbo.empresas 
      WHERE id = 28 OR rnc = '00102620424' OR nombre LIKE '%PURINGO%'
    `);

    if (companyRes.recordset.length === 0) {
      console.error('❌ No se encontró la empresa Puringo Cruz en FacturaTRS.');
      await pool.close();
      return;
    }

    const companyId = companyRes.recordset[0].id;
    console.log(`🏢 Empresa seleccionada: ID ${companyId} - ${companyRes.recordset[0].nombre}`);

    // Obtener usuario ID
    const userRes = await pool.request().query(`SELECT TOP 1 id FROM FacturaTRS.dbo.usuarios ORDER BY id ASC`);
    const userId = userRes.recordset[0]?.id || 1;

    // 2. Limpiar facturas e items previos para evitar duplicados incompletos
    console.log('🧹 Limpiando facturas e items antiguos...');
    await pool.request().query(`
      DELETE FROM FacturaTRS.dbo.detalle_facturas 
      WHERE id_factura IN (SELECT id FROM FacturaTRS.dbo.facturas WHERE id_empresa = ${companyId});

      DELETE FROM FacturaTRS.dbo.facturas WHERE id_empresa = ${companyId};
    `);

    // 3. Crear mapa de clientes (codigo -> id)
    console.log('👥 Cargando mapa de clientes...');
    const clientRes = await pool.request().query(`SELECT id, nombre, rnc_cedula FROM FacturaTRS.dbo.clientes WHERE id_empresa = ${companyId}`);
    const puringoClients = await pool.request().query(`SELECT codigo, nombre, rnc FROM PURINGO.dbo.clientes`);
    
    const clientMap = new Map<string, number>();
    for (const c of puringoClients.recordset) {
      const code = c.codigo?.trim();
      const name = c.nombre?.trim();
      const rnc = c.rnc?.trim();
      if (!code) continue;

      const match = clientRes.recordset.find((cr: any) => 
        (rnc && cr.rnc_cedula === rnc) || (name && cr.nombre === name)
      );

      if (match) {
        clientMap.set(code, match.id);
      } else if (clientRes.recordset.length > 0) {
        clientMap.set(code, clientRes.recordset[0].id);
      }
    }
    const defaultClientId = clientRes.recordset[0]?.id || 1;

    // 4. Cargar todos los detalles de imtrd en memoria agrupados por 'control'
    console.log('📦 Cargando todos los ítems de detalle de imtrd...');
    const imtrdRes = await pool.request().query(`SELECT * FROM PURINGO.dbo.imtrd`);
    const itemsMap = new Map<string, any[]>();

    for (const row of imtrdRes.recordset) {
      const ctrl = row.control?.trim();
      if (!ctrl) continue;
      if (!itemsMap.has(ctrl)) {
        itemsMap.set(ctrl, []);
      }
      itemsMap.get(ctrl)!.push(row);
    }
    console.log(`✅ Detalle cargado para ${itemsMap.size} facturas.`);

    // 5. Cargar todas las facturas de imtr
    console.log('📄 Importando facturas con comentarios y creando sus ítems...');
    const imtrRes = await pool.request().query(`SELECT * FROM PURINGO.dbo.imtr ORDER BY fcreacion ASC`);
    
    let totalInvoices = 0;
    let totalItems = 0;

    for (const row of imtrRes.recordset) {
      const ctrl = row.control?.trim();
      const docType = row.doc?.trim() || 'FACT';
      const num = row.numero || 0;
      const docNum = `${docType}-${num}`;
      const clientCode = row.entidad?.trim();
      
      let ncf = row.ncf?.trim() || null;
      if (ncf) {
        ncf = ncf.replace(/\s+/g, '');
      }

      const comentario = row.comentario?.trim() || `Factura ${docNum}`;
      const fcreacion = row.fcreacion ? new Date(row.fcreacion).toISOString() : new Date().toISOString();
      const subtotal = row.valor || 0;
      const itbis = row.itbis || 0;
      const total = row.total || (subtotal + itbis);
      const isAnulada = row.cancelado === true;
      const statusStr = isAnulada ? 'voided' : 'sent_to_alanube';

      const clientId = (clientCode ? clientMap.get(clientCode) : undefined) || defaultClientId;

      const cleanDocNum = docNum.replace(/'/g, "''");
      const cleanDesc = comentario.replace(/'/g, "''");

      // Insertar factura encabezado
      const insInvRes = await pool.request().query(`
        INSERT INTO FacturaTRS.dbo.facturas (
          id_usuario, id_empresa, id_cliente, numero_factura, descripcion, 
          monto_bruto, subtotal, monto_itbis, monto_total, moneda, estado, ncf, notas, fecha_creacion
        )
        OUTPUT INSERTED.id
        VALUES (
          ${userId}, ${companyId}, ${clientId}, '${cleanDocNum}', '${cleanDesc}',
          ${total}, ${subtotal}, ${itbis}, ${total}, 'DOP', '${statusStr}', ${ncf ? `'${ncf}'` : 'NULL'}, '${cleanDesc}', '${fcreacion}'
        )
      `);

      const newInvoiceId = insInvRes.recordset[0].id;
      totalInvoices++;

      // Insertar detalle_facturas (items)
      const detailItems = ctrl ? itemsMap.get(ctrl) : null;
      if (detailItems && detailItems.length > 0) {
        let lineNo = 1;
        for (const item of detailItems) {
          const itemSku = (item.merc?.trim() || '').replace(/'/g, "''");
          const itemDesc = (item.descrip?.trim() || 'Servicio/Producto').replace(/'/g, "''");
          const qty = item.cantidad || 1;
          const price = item.precio || 0;
          const itemSub = item.valor || (qty * price);
          const itemItbis = item.itbis || 0;
          const itemTot = item.total || (itemSub + itemItbis);
          const itemTaxPct = item.excento ? 0 : 18;

          await pool.request().query(`
            INSERT INTO FacturaTRS.dbo.detalle_facturas (
              id_factura, numero_linea, codigo_item, nombre_item, descripcion,
              cantidad, precio_unitario, porcentaje_itbis, subtotal, monto_itbis, monto_total
            )
            VALUES (
              ${newInvoiceId}, ${lineNo}, '${itemSku}', '${itemDesc}', '${itemDesc}',
              ${qty}, ${price}, ${itemTaxPct}, ${itemSub}, ${itemItbis}, ${itemTot}
            )
          `);
          lineNo++;
          totalItems++;
        }
      } else {
        // Si no tiene ítems en imtrd, agregar un item general con el valor total
        const cleanName = cleanDesc.length > 255 ? cleanDesc.substring(0, 255) : cleanDesc;
        await pool.request().query(`
          INSERT INTO FacturaTRS.dbo.detalle_facturas (
            id_factura, numero_linea, codigo_item, nombre_item, descripcion,
            cantidad, precio_unitario, porcentaje_itbis, subtotal, monto_itbis, monto_total
          )
          VALUES (
            ${newInvoiceId}, 1, 'SERV-01', '${cleanName}', '${cleanDesc}',
            1, ${subtotal}, ${itbis > 0 ? 18 : 0}, ${subtotal}, ${itbis}, ${total}
          )
        `);
        totalItems++;
      }
    }

    console.log(`\n✅ ${totalInvoices} Facturas importadas con sus comentarios.`);
    console.log(`✅ ${totalItems} Ítems de detalle insertados en detalle_facturas.`);

    // Sincronizar secuencias NCF (B01 a 12818, B02 a 5)
    await pool.request().query(`
      UPDATE FacturaTRS.dbo.secuencias_ncf SET siguiente = 12818, final = 14026 WHERE id_empresa = ${companyId} AND tipo = 'B01';
      UPDATE FacturaTRS.dbo.secuencias_ncf SET siguiente = 5, final = 3000 WHERE id_empresa = ${companyId} AND tipo = 'B02';
      UPDATE FacturaTRS.dbo.empresas SET proximo_numero_factura = 8297, modalidad_facturacion = 'tradicional' WHERE id = ${companyId};
      UPDATE FacturaTRS.dbo.configuracion_empresa SET proximo_numero_factura = 8297;
    `);

    console.log('\n==================================================');
    console.log(`🎉 RE-IMPORTACIÓN COMPLETA FINALIZADA CON ÉXITO!`);
    console.log('==================================================');

    await pool.close();
  } catch (err: any) {
    console.error('❌ Error:', err.message);
  }
}

migrateFullPuringoWithItems();
