import sql from 'mssql';

async function migratePuringo() {
  console.log('🚀 Iniciando migración directa desde [PURINGO] a la empresa [PURINGO CRUZ] en [FacturaTRS]...');

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
    console.log('✅ Conectado a SQL Server local.');

    // 1. Obtener o verificar la empresa PURINGO CRUZ en FacturaTRS
    let companyRes = await pool.request().query(`
      SELECT TOP 1 id, nombre, rnc 
      FROM FacturaTRS.dbo.empresas 
      WHERE rnc = '00102620424' OR nombre LIKE '%PURINGO%'
    `);

    let companyId: number;
    let companyName: string;

    if (companyRes.recordset.length === 0) {
      console.log('ℹ️ Creando la empresa PURINGO CRUZ en FacturaTRS...');
      const createCompRes = await pool.request().query(`
        INSERT INTO FacturaTRS.dbo.empresas (nombre, rnc, direccion, telefono, email, modalidad_facturacion)
        OUTPUT INSERTED.id, INSERTED.nombre
        VALUES ('PURINGO CRUZ', '00102620424', 'TERMINAL DE CARGA DEL AILA', '809-860-7022', 'puringocruz@gmail.com', 'tradicional')
      `);
      companyId = createCompRes.recordset[0].id;
      companyName = createCompRes.recordset[0].nombre;
    } else {
      companyId = companyRes.recordset[0].id;
      companyName = companyRes.recordset[0].nombre;
    }

    console.log(`🏢 Empresa destino identificada: ID ${companyId} - ${companyName}`);

    // Obtener usuario activo
    const userRes = await pool.request().query(`SELECT TOP 1 id FROM FacturaTRS.dbo.usuarios ORDER BY id ASC`);
    const userId = userRes.recordset[0]?.id || 1;

    // Vincular hanley si existe
    const hanleyRes = await pool.request().query(`SELECT id FROM FacturaTRS.dbo.usuarios WHERE nombre_usuario = 'hanley'`);
    if (hanleyRes.recordset.length > 0) {
      const hanleyId = hanleyRes.recordset[0].id;
      await pool.request().query(`
        IF NOT EXISTS (SELECT 1 FROM FacturaTRS.dbo.usuario_empresas WHERE id_usuario = ${hanleyId} AND id_empresa = ${companyId})
        BEGIN
          INSERT INTO FacturaTRS.dbo.usuario_empresas (id_usuario, id_empresa, rol)
          VALUES (${hanleyId}, ${companyId}, 'admin')
        END
      `);
    }

    // 2. Migrar Clientes desde PURINGO.dbo.clientes
    console.log('\n👥 Migrando Clientes...');
    const puringoClients = await pool.request().query(`SELECT * FROM PURINGO.dbo.clientes`);
    const clientMap = new Map<string, number>(); // codigo_puringo -> id_facturatrs

    for (const c of puringoClients.recordset) {
      const code = c.codigo?.trim();
      const name = c.nombre?.trim() || 'Cliente Sin Nombre';
      const rnc = c.rnc?.trim() ? c.rnc.trim() : '000000000';
      const phone = c.telefono1?.trim() || c.telefono2?.trim() || null;
      const address = c.direccion?.trim() || null;
      const email = c.email?.trim() || null;

      if (!code) continue;

      const cleanName = name.replace(/'/g, "''");
      const cleanRnc = rnc.replace(/'/g, "''");

      const existingClient = await pool.request().query(`
        SELECT id FROM FacturaTRS.dbo.clientes 
        WHERE id_empresa = ${companyId} AND (rnc_cedula = '${cleanRnc}' OR nombre = '${cleanName}')
      `);

      let newClientId: number;
      if (existingClient.recordset.length > 0) {
        newClientId = existingClient.recordset[0].id;
      } else {
        const insClient = await pool.request().query(`
          INSERT INTO FacturaTRS.dbo.clientes (id_usuario, id_empresa, nombre, rnc_cedula, telefono, direccion, correo_electronico, tipo_cliente)
          OUTPUT INSERTED.id
          VALUES (${userId}, ${companyId}, '${cleanName}', '${cleanRnc}', ${phone ? `'${phone.replace(/'/g, "''")}'` : 'NULL'}, ${address ? `'${address.replace(/'/g, "''")}'` : 'NULL'}, ${email ? `'${email.replace(/'/g, "''")}'` : 'NULL'}, 'individual')
        `);
        newClientId = insClient.recordset[0].id;
      }
      clientMap.set(code, newClientId);
    }
    console.log(`✅ ${clientMap.size} Clientes sincronizados.`);

    // 3. Migrar Productos desde PURINGO.dbo.mercs
    console.log('\n📦 Migrando Productos...');
    const puringoMercs = await pool.request().query(`SELECT * FROM PURINGO.dbo.mercs`);
    let prodCount = 0;

    for (const m of puringoMercs.recordset) {
      const sku = m.codigo?.trim();
      const name = m.nombre?.trim();
      const price = m.precio1 || 0;
      const taxPct = m.excento ? 0 : 18;
      const isActive = m.inactivo ? 0 : 1;

      if (!name) continue;

      const cleanName = name.replace(/'/g, "''");
      const cleanSku = sku ? sku.replace(/'/g, "''") : '';

      const existingProd = await pool.request().query(`
        SELECT id FROM FacturaTRS.dbo.productos_servicios 
        WHERE id_empresa = ${companyId} AND (codigo = '${cleanSku}' OR nombre = '${cleanName}')
      `);

      if (existingProd.recordset.length === 0) {
        await pool.request().query(`
          INSERT INTO FacturaTRS.dbo.productos_servicios (id_usuario, id_empresa, codigo, nombre, precio_unitario, porcentaje_itbis, tipo, esta_activo)
          VALUES (${userId}, ${companyId}, '${cleanSku}', '${cleanName}', ${price}, ${taxPct}, 'product', ${isActive})
        `);
        prodCount++;
      }
    }
    console.log(`✅ ${prodCount} nuevos Productos agregados.`);

    // 4. Migrar Secuencias NCF desde PURINGO.dbo.fiscal
    console.log('\n🔢 Migrando Secuencias NCF...');
    const puringoFiscal = await pool.request().query(`SELECT * FROM PURINGO.dbo.fiscal`);
    for (const f of puringoFiscal.recordset) {
      const rawPrefix = f.prefijo?.trim();
      const type = rawPrefix;
      const nextVal = f.contador || f.desde || 1;
      const endVal = f.hasta || 999999;

      if (!type || !rawPrefix) continue;

      await pool.request().query(`
        IF EXISTS (SELECT 1 FROM FacturaTRS.dbo.secuencias_ncf WHERE id_empresa = ${companyId} AND tipo = '${type}')
        BEGIN
          UPDATE FacturaTRS.dbo.secuencias_ncf 
          SET siguiente = ${nextVal}, final = ${endVal}
          WHERE id_empresa = ${companyId} AND tipo = '${type}'
        END
        ELSE
        BEGIN
          INSERT INTO FacturaTRS.dbo.secuencias_ncf (id_empresa, tipo, prefijo, siguiente, final)
          VALUES (${companyId}, '${type}', '${rawPrefix}', ${nextVal}, ${endVal})
        END
      `);
      console.log(`   - Secuencia ${type}: Siguiente = ${nextVal}, Final = ${endVal}`);
    }

    // 5. Migrar Facturas desde PURINGO.dbo.imtr
    console.log('\n📄 Migrando Facturas e Historial desde PURINGO.dbo.imtr...');
    const puringoImtr = await pool.request().query(`SELECT * FROM PURINGO.dbo.imtr ORDER BY fcreacion ASC`);
    let invCount = 0;

    for (const row of puringoImtr.recordset) {
      const docNum = `${row.doc?.trim() || 'FACT'}-${row.numero || row.control?.trim()}`;
      const clientCode = row.entidad?.trim();
      let ncf = row.ncf?.trim() || null;
      if (ncf) {
        // Limpiar espacios en NCF ej: "B01        00001021" -> "B0100001021"
        ncf = ncf.replace(/\s+/g, '');
      }

      const fcreacion = row.fcreacion ? new Date(row.fcreacion).toISOString() : new Date().toISOString();
      const subtotal = row.valor || 0;
      const itbis = row.itbis || 0;
      const total = row.total || (subtotal + itbis);
      const isAnulada = row.cancelado === true;
      const statusStr = isAnulada ? 'voided' : 'sent_to_alanube';

      let clientId = clientCode ? clientMap.get(clientCode) : undefined;
      if (!clientId) {
        // Fallback: usar el primer cliente disponible
        clientId = Array.from(clientMap.values())[0];
      }

      if (!clientId) continue;

      const cleanDocNum = docNum.replace(/'/g, "''");
      const cleanDesc = (row.comentario?.trim() || `Factura ${docNum}`).replace(/'/g, "''");

      // Verificar si ya fue insertada
      const existingInv = await pool.request().query(`
        SELECT id FROM FacturaTRS.dbo.facturas 
        WHERE id_empresa = ${companyId} AND numero_factura = '${cleanDocNum}'
      `);

      if (existingInv.recordset.length === 0) {
        await pool.request().query(`
          INSERT INTO FacturaTRS.dbo.facturas (
            id_usuario, id_empresa, id_cliente, numero_factura, descripcion, 
            monto_bruto, subtotal, monto_itbis, monto_total, moneda, estado, ncf, fecha_creacion
          )
          VALUES (
            ${userId}, ${companyId}, ${clientId}, '${cleanDocNum}', '${cleanDesc}',
            ${total}, ${subtotal}, ${itbis}, ${total}, 'DOP', '${statusStr}', ${ncf ? `'${ncf}'` : 'NULL'}, '${fcreacion}'
          )
        `);
        invCount++;
      }
    }
    console.log(`✅ ${invCount} Facturas históricas migras exitosamente.`);

    // 6. Configurar modalidad tradicional para PURINGO CRUZ
    await pool.request().query(`
      UPDATE FacturaTRS.dbo.empresas 
      SET modalidad_facturacion = 'tradicional'
      WHERE id = ${companyId}
    `);

    console.log('\n==================================================');
    console.log(`🎉 MIGRACIÓN DE [PURINGO] A [${companyName}] COMPLETADA CON ÉXITO!`);
    console.log('==================================================');

    await pool.close();
  } catch (err: any) {
    console.error('❌ Error durante la migración:', err.message);
  }
}

migratePuringo();
