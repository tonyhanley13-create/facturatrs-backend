import sql from 'mssql';
import prisma from '../models/db';

const SQL_CONFIG: sql.config = {
  server: 'localhost',
  database: 'FacturaTRS',
  user: 'SA',
  password: 'Kibalion2',
  options: {
    encrypt: false,
    trustServerCertificate: true,
  },
};

async function migrate() {
  const pool = await sql.connect(SQL_CONFIG);
  console.log('✅ Conectado a SQL Server');

  const transaction = await sql.connect(SQL_CONFIG);
  console.log('📦 Iniciando migración...\n');

  // 1. Migrar usuarios
  const usuarios = await transaction.request().query(`
    SELECT id, nombre_usuario, correo_electronico, clave_acceso,
           nombre, apellido, nombre_empresa, es_super_admin, fecha_creacion
    FROM usuarios ORDER BY id
  `);
  console.log(`📋 ${usuarios.recordset.length} usuarios encontrados`);

  for (const u of usuarios.recordset) {
    await prisma.user.upsert({
      where: { id: u.id },
      update: {
        username: u.nombre_usuario,
        email: u.correo_electronico,
        password: u.clave_acceso,
        first_name: u.nombre,
        last_name: u.apellido,
        company_name: u.nombre_empresa,
        is_super_admin: !!u.es_super_admin,
      },
      create: {
        id: u.id,
        username: u.nombre_usuario,
        email: u.correo_electronico,
        password: u.clave_acceso,
        first_name: u.nombre,
        last_name: u.apellido,
        company_name: u.nombre_empresa,
        is_super_admin: !!u.es_super_admin,
      },
    });
  }
  console.log('✅ Usuarios migrados');

  // 2. Migrar empresas
  const empresas = await transaction.request().query(`
    SELECT id, nombre, rnc, direccion, telefono, correo,
           url_logo, moneda_defecto, porcentaje_itbis,
           proximo_numero_factura, prefijo_factura, rangos_ncf,
           id_empresa_alanube, ambiente_alanube, proveedor_fiscal,
           id_empresa_gae, codigo_vendedor_gae, ambiente_gae,
           ambiente_dgii, nombre_certificado, contenido_certificado,
           clave_certificado, vencimiento_certificado, es_plantilla,
           fecha_creacion, fecha_actualizacion
    FROM empresas ORDER BY id
  `);
  console.log(`📋 ${empresas.recordset.length} empresas encontradas`);

  for (const e of empresas.recordset) {
    await prisma.company.upsert({
      where: { id: e.id },
      update: {
        name: e.nombre,
        rnc: e.rnc,
        address: e.direccion,
        phone: e.telefono,
        email: e.correo,
        logo_url: e.url_logo,
        default_currency: e.moneda_defecto || 'DOP',
        tax_percentage: e.porcentaje_itbis ?? 18.00,
        next_invoice_number: e.proximo_numero_factura ?? 1,
        invoice_prefix: e.prefijo_factura || 'FACT-',
        ncf_ranges: e.rangos_ncf,
        alanube_company_id: e.id_empresa_alanube,
        alanube_environment: e.ambiente_alanube || 'sandbox',
        fiscal_provider: e.proveedor_fiscal || 'alanube',
        gae_company_id: e.id_empresa_gae,
        gae_seller_code: e.codigo_vendedor_gae,
        gae_environment: e.ambiente_gae || 'Test',
        dgii_environment: e.ambiente_dgii || 'Test',
        certificate_name: e.nombre_certificado,
        certificate_content: e.contenido_certificado,
        certificate_password: e.clave_certificado,
        certificate_expiry: e.vencimiento_certificado,
        is_template: !!e.es_plantilla,
      },
      create: {
        id: e.id,
        name: e.nombre,
        rnc: e.rnc,
        address: e.direccion,
        phone: e.telefono,
        email: e.correo,
        logo_url: e.url_logo,
        default_currency: e.moneda_defecto || 'DOP',
        tax_percentage: e.porcentaje_itbis ?? 18.00,
        next_invoice_number: e.proximo_numero_factura ?? 1,
        invoice_prefix: e.prefijo_factura || 'FACT-',
        ncf_ranges: e.rangos_ncf,
        alanube_company_id: e.id_empresa_alanube,
        alanube_environment: e.ambiente_alanube || 'sandbox',
        fiscal_provider: e.proveedor_fiscal || 'alanube',
        gae_company_id: e.id_empresa_gae,
        gae_seller_code: e.codigo_vendedor_gae,
        gae_environment: e.ambiente_gae || 'Test',
        dgii_environment: e.ambiente_dgii || 'Test',
        certificate_name: e.nombre_certificado,
        certificate_content: e.contenido_certificado,
        certificate_password: e.clave_certificado,
        certificate_expiry: e.vencimiento_certificado,
        is_template: !!e.es_plantilla,
      },
    });
  }
  console.log('✅ Empresas migradas');

  // 3. Migrar usuario_empresas
  const ue = await transaction.request().query(`
    SELECT id_usuario, id_empresa, rol, puede_cambiar_empresa, fecha_creacion
    FROM usuario_empresas ORDER BY id_usuario, id_empresa
  `);
  console.log(`📋 ${ue.recordset.length} relaciones usuario-empresa encontradas`);

  for (const r of ue.recordset) {
    await prisma.userCompany.upsert({
      where: { user_id_company_id: { user_id: r.id_usuario, company_id: r.id_empresa } },
      update: {
        role: r.rol || 'user',
        can_switch_company: r.puede_cambiar_empresa !== false,
      },
      create: {
        user_id: r.id_usuario,
        company_id: r.id_empresa,
        role: r.rol || 'user',
        can_switch_company: r.puede_cambiar_empresa !== false,
      },
    });
  }
  console.log('✅ Relaciones usuario-empresa migradas');

  // 4. Migrar configuracion_empresa
  const configs = await transaction.request().query(`
    SELECT * FROM configuracion_empresa ORDER BY id
  `);
  console.log(`📋 ${configs.recordset.length} configuraciones encontradas`);

  for (const c of configs.recordset) {
    await prisma.companySettings.upsert({
      where: { id: c.id },
      update: {
        user_id: c.id_usuario,
        company_name: c.nombre_empresa,
        company_rnc: c.rnc_empresa,
        company_address: c.direccion_empresa,
        company_phone: c.telefono_empresa,
        company_email: c.correo_empresa,
        company_logo_url: c.url_logo_empresa,
        default_currency: c.moneda_defecto || 'DOP',
        tax_percentage: c.porcentaje_itbis ?? 18.00,
        next_invoice_number: c.proximo_numero_factura ?? 1,
        invoice_prefix: c.prefijo_factura || 'FACT-',
        alanube_company_id: c.id_empresa_alanube,
        alanube_environment: c.ambiente_alanube || 'sandbox',
        required_client_fields: c.campos_clientes_requeridos,
        client_custom_fields: c.campos_personalizados_clientes,
        invoice_template: c.plantilla_factura || 'default',
        plan_type: c.tipo_plan || 'starter',
        monthly_invoice_limit: c.limite_facturas_mensual ?? 50,
        user_limit: c.limite_usuarios ?? 1,
      },
      create: {
        id: c.id,
        user_id: c.id_usuario,
        company_name: c.nombre_empresa,
        company_rnc: c.rnc_empresa,
        company_address: c.direccion_empresa,
        company_phone: c.telefono_empresa,
        company_email: c.correo_empresa,
        company_logo_url: c.url_logo_empresa,
        default_currency: c.moneda_defecto || 'DOP',
        tax_percentage: c.porcentaje_itbis ?? 18.00,
        next_invoice_number: c.proximo_numero_factura ?? 1,
        invoice_prefix: c.prefijo_factura || 'FACT-',
        alanube_company_id: c.id_empresa_alanube,
        alanube_environment: c.ambiente_alanube || 'sandbox',
        required_client_fields: c.campos_clientes_requeridos,
        client_custom_fields: c.campos_personalizados_clientes,
        invoice_template: c.plantilla_factura || 'default',
        plan_type: c.tipo_plan || 'starter',
        monthly_invoice_limit: c.limite_facturas_mensual ?? 50,
        user_limit: c.limite_usuarios ?? 1,
      },
    });
  }
  console.log('✅ Configuraciones migradas');

  // 5. Migrar clientes
  const clientes = await transaction.request().query(`
    SELECT * FROM clientes ORDER BY id
  `);
  console.log(`📋 ${clientes.recordset.length} clientes encontrados`);

  for (const c of clientes.recordset) {
    await prisma.client.upsert({
      where: { id: c.id },
      update: {
        user_id: c.id_usuario,
        company_id: c.id_empresa,
        name: c.nombre,
        rnc: c.rnc_cedula,
        phone: c.telefono,
        address: c.direccion,
        contact_person: c.persona_contacto,
        email: c.correo_electronico,
        client_type: c.tipo_cliente || 'individual',
        tax_id: c.id_fiscal,
        custom_fields: c.campos_personalizados,
      },
      create: {
        id: c.id,
        user_id: c.id_usuario,
        company_id: c.id_empresa,
        name: c.nombre,
        rnc: c.rnc_cedula,
        phone: c.telefono,
        address: c.direccion,
        contact_person: c.persona_contacto,
        email: c.correo_electronico,
        client_type: c.tipo_cliente || 'individual',
        tax_id: c.id_fiscal,
        custom_fields: c.campos_personalizados,
      },
    });
  }
  console.log('✅ Clientes migrados');

  // 6. Migrar productos_servicios
  const productos = await transaction.request().query(`
    SELECT * FROM productos_servicios ORDER BY id
  `);
  console.log(`📋 ${productos.recordset.length} productos encontrados`);

  for (const p of productos.recordset) {
    await prisma.productService.upsert({
      where: { id: p.id },
      update: {
        user_id: p.id_usuario,
        company_id: p.id_empresa,
        code: p.codigo,
        name: p.nombre,
        description: p.descripcion,
        category: p.categoria,
        unit_price: p.precio_unitario,
        tax_percentage: p.porcentaje_itbis ?? 18.00,
        type: p.tipo || 'service',
        unit_of_measure: p.unidad_medida || 'UND',
        billing_indicator: p.indicador_facturacion ?? 1,
        good_service_indicator: p.indicador_bien_servicio ?? 2,
        is_active: p.esta_activo !== false,
      },
      create: {
        id: p.id,
        user_id: p.id_usuario,
        company_id: p.id_empresa,
        code: p.codigo,
        name: p.nombre,
        description: p.descripcion,
        category: p.categoria,
        unit_price: p.precio_unitario,
        tax_percentage: p.porcentaje_itbis ?? 18.00,
        type: p.tipo || 'service',
        unit_of_measure: p.unidad_medida || 'UND',
        billing_indicator: p.indicador_facturacion ?? 1,
        good_service_indicator: p.indicador_bien_servicio ?? 2,
        is_active: p.esta_activo !== false,
      },
    });
  }
  console.log('✅ Productos migrados');

  // 7. Migrar facturas
  const facturas = await transaction.request().query(`
    SELECT * FROM facturas ORDER BY id
  `);
  console.log(`📋 ${facturas.recordset.length} facturas encontradas`);

  for (const f of facturas.recordset) {
    await prisma.invoice.upsert({
      where: { id: f.id },
      update: {
        user_id: f.id_usuario,
        company_id: f.id_empresa,
        client_id: f.id_cliente,
        invoice_number: f.numero_factura,
        description: f.descripcion,
        amount: f.monto_bruto,
        subtotal: f.subtotal,
        tax_amount: f.monto_itbis,
        discount_amount: f.monto_descuento ?? 0.00,
        total_amount: f.monto_total,
        currency: f.moneda || 'DOP',
        status: f.estado || 'draft',
        alanube_id: f.id_alanube,
        ncf: f.ncf,
        due_date: f.fecha_vencimiento,
        payment_status: f.estado_pago || 'pending',
        payment_method: f.metodo_pago || '01',
        notes: f.notas,
        custom_fields: f.campos_personalizados,
        dgii_track_id: f.id_seguimiento_dgii,
        dgii_security_code: f.codigo_seguridad_dgii,
        dgii_signed_xml: f.xml_firmado_dgii,
        dgii_status: f.estado_dgii,
        dgii_contingency: !!f.es_contingencia,
        dgii_error: f.error_dgii,
      },
      create: {
        id: f.id,
        user_id: f.id_usuario,
        company_id: f.id_empresa,
        client_id: f.id_cliente,
        invoice_number: f.numero_factura,
        description: f.descripcion,
        amount: f.monto_bruto,
        subtotal: f.subtotal,
        tax_amount: f.monto_itbis,
        discount_amount: f.monto_descuento ?? 0.00,
        total_amount: f.monto_total,
        currency: f.moneda || 'DOP',
        status: f.estado || 'draft',
        alanube_id: f.id_alanube,
        ncf: f.ncf,
        due_date: f.fecha_vencimiento,
        payment_status: f.estado_pago || 'pending',
        payment_method: f.metodo_pago || '01',
        notes: f.notas,
        custom_fields: f.campos_personalizados,
        dgii_track_id: f.id_seguimiento_dgii,
        dgii_security_code: f.codigo_seguridad_dgii,
        dgii_signed_xml: f.xml_firmado_dgii,
        dgii_status: f.estado_dgii,
        dgii_contingency: !!f.es_contingencia,
        dgii_error: f.error_dgii,
      },
    });
  }
  console.log('✅ Facturas migradas');

  // 8. Migrar detalle_facturas
  const items = await transaction.request().query(`
    SELECT * FROM detalle_facturas ORDER BY id
  `);
  console.log(`📋 ${items.recordset.length} items de factura encontrados`);

  for (const i of items.recordset) {
    await prisma.invoiceItem.upsert({
      where: { id: i.id },
      update: {
        invoice_id: i.id_factura,
        line_number: i.numero_linea,
        item_code: i.codigo_item,
        item_name: i.nombre_item,
        description: i.descripcion,
        quantity: i.cantidad ?? 1.000,
        unit_price: i.precio_unitario,
        discount_percentage: i.porcentaje_descuento ?? 0.00,
        tax_percentage: i.porcentaje_itbis ?? 18.00,
        subtotal: i.subtotal,
        tax_amount: i.monto_itbis,
        total_amount: i.monto_total,
        billing_indicator: i.indicador_facturacion ?? 1,
        good_service_indicator: i.indicador_bien_servicio ?? 2,
        unit_of_measure: i.unidad_medida || 'UND',
      },
      create: {
        id: i.id,
        invoice_id: i.id_factura,
        line_number: i.numero_linea,
        item_code: i.codigo_item,
        item_name: i.nombre_item,
        description: i.descripcion,
        quantity: i.cantidad ?? 1.000,
        unit_price: i.precio_unitario,
        discount_percentage: i.porcentaje_descuento ?? 0.00,
        tax_percentage: i.porcentaje_itbis ?? 18.00,
        subtotal: i.subtotal,
        tax_amount: i.monto_itbis,
        total_amount: i.monto_total,
        billing_indicator: i.indicador_facturacion ?? 1,
        good_service_indicator: i.indicador_bien_servicio ?? 2,
        unit_of_measure: i.unidad_medida || 'UND',
      },
    });
  }
  console.log('✅ Items de factura migrados');

  // 9. Migrar catalogo_cuentas
  const cuentas = await transaction.request().query(`
    SELECT * FROM catalogo_cuentas ORDER BY id
  `);
  console.log(`📋 ${cuentas.recordset.length} cuentas contables encontradas`);

  for (const c of cuentas.recordset) {
    await prisma.chartOfAccount.upsert({
      where: { id: c.id },
      update: {
        company_id: c.id_empresa,
        code: c.codigo,
        name: c.nombre,
        type: c.tipo,
        parent_id: c.id_padre,
        level: c.nivel ?? 1,
        is_group: !!c.es_grupo,
      },
      create: {
        id: c.id,
        company_id: c.id_empresa,
        code: c.codigo,
        name: c.nombre,
        type: c.tipo,
        parent_id: c.id_padre,
        level: c.nivel ?? 1,
        is_group: !!c.es_grupo,
      },
    });
  }
  console.log('✅ Catálogo de cuentas migrado');

  // 10. Migrar analiticas_uso
  const analiticas = await transaction.request().query(`
    SELECT * FROM analiticas_uso ORDER BY id
  `);
  console.log(`📋 ${analiticas.recordset.length} analíticas encontradas`);

  for (const a of analiticas.recordset) {
    await prisma.usageAnalytics.upsert({
      where: { id: a.id },
      update: {
        user_id: a.id_usuario,
        period_start: a.inicio_periodo,
        period_end: a.fin_periodo,
        invoices_created: a.facturas_creadas ?? 0,
        total_revenue: a.ingresos_totales ?? 0.00,
        clients_active: a.clientes_activos ?? 0,
        alanube_requests: a.peticiones_alanube ?? 0,
        plan_invoice_limit: a.limite_facturas_plan,
        plan_user_limit: a.limite_usuarios_plan,
      },
      create: {
        id: a.id,
        user_id: a.id_usuario,
        period_start: a.inicio_periodo,
        period_end: a.fin_periodo,
        invoices_created: a.facturas_creadas ?? 0,
        total_revenue: a.ingresos_totales ?? 0.00,
        clients_active: a.clientes_activos ?? 0,
        alanube_requests: a.peticiones_alanube ?? 0,
        plan_invoice_limit: a.limite_facturas_plan,
        plan_user_limit: a.limite_usuarios_plan,
      },
    });
  }
  console.log('✅ Analíticas migradas');

  // 11. Migrar recibidos_ecf
  const recibidos = await transaction.request().query(`
    SELECT * FROM recibidos_ecf ORDER BY id
  `);
  console.log(`📋 ${recibidos.recordset.length} ECF recibidos encontrados`);

  for (const r of recibidos.recordset) {
    await prisma.receivedEcf.upsert({
      where: { id: r.id },
      update: {
        company_id: r.id_empresa,
        encf: r.encf,
        rnc_emisor: r.rnc_emisor,
        rnc_comprador: r.rnc_comprador,
        monto_total: r.monto_total,
        xml_signed: r.xml_firmado,
        status: r.estado || 'pending',
        approval: r.aprobacion,
        raw_response: r.respuesta_original,
      },
      create: {
        id: r.id,
        company_id: r.id_empresa,
        encf: r.encf,
        rnc_emisor: r.rnc_emisor,
        rnc_comprador: r.rnc_comprador,
        monto_total: r.monto_total,
        xml_signed: r.xml_firmado,
        status: r.estado || 'pending',
        approval: r.aprobacion,
        raw_response: r.respuesta_original,
      },
    });
  }
  console.log('✅ ECF recibidos migrados');

  // 12. Migrar progreso_certificacion
  const cert = await transaction.request().query(`
    SELECT * FROM progreso_certificacion ORDER BY id
  `);
  console.log(`📋 ${cert.recordset.length} progresos de certificación encontrados`);

  for (const c of cert.recordset) {
    await prisma.certificationProgress.upsert({
      where: { id: c.id },
      update: {
        company_id: c.id_empresa,
        current_step: c.paso_actual ?? 0,
        status: c.estado || 'not_started',
        postulation_xml: c.xml_postulacion,
        postulation_signed_xml: c.xml_postulacion_firmado,
        software_name: c.nombre_software,
        software_version: c.version_software,
        software_type: c.tipo_software,
        provider_name: c.nombre_proveedor,
        provider_contact: c.contacto_proveedor,
        url_recepcion: c.url_recepcion,
        url_aprobacion: c.url_aprobacion,
        url_autenticacion: c.url_autenticacion,
        url_recepcion_prod: c.url_recepcion_produccion,
        url_aprobacion_prod: c.url_aprobacion_produccion,
        url_autenticacion_prod: c.url_autenticacion_produccion,
        test_data_sent: !!c.datos_prueba_enviados,
        test_data_approved: !!c.datos_prueba_aprobados,
        simulation_sent: !!c.simulacion_enviada,
        simulation_approved: !!c.simulacion_aprobada,
        pdf_sent: !!c.pdf_enviado,
        pdf_approved: c.pdf_aprobado,
        communication_ready: !!c.comunicacion_listo,
        communication_passed: !!c.comunicacion_aprobada,
        declaration_xml: c.xml_declaracion,
        declaration_signed_xml: c.xml_declaracion_firmado,
        declaration_submitted: !!c.declaracion_enviada,
        rnc_verified: !!c.rnc_verificado,
        cancel_reason: c.motivo_cancelacion,
        started_at: c.fecha_inicio,
        completed_at: c.fecha_completado,
      },
      create: {
        id: c.id,
        company_id: c.id_empresa,
        current_step: c.paso_actual ?? 0,
        status: c.estado || 'not_started',
        postulation_xml: c.xml_postulacion,
        postulation_signed_xml: c.xml_postulacion_firmado,
        software_name: c.nombre_software,
        software_version: c.version_software,
        software_type: c.tipo_software,
        provider_name: c.nombre_proveedor,
        provider_contact: c.contacto_proveedor,
        url_recepcion: c.url_recepcion,
        url_aprobacion: c.url_aprobacion,
        url_autenticacion: c.url_autenticacion,
        url_recepcion_prod: c.url_recepcion_produccion,
        url_aprobacion_prod: c.url_aprobacion_produccion,
        url_autenticacion_prod: c.url_autenticacion_produccion,
        test_data_sent: !!c.datos_prueba_enviados,
        test_data_approved: !!c.datos_prueba_aprobados,
        simulation_sent: !!c.simulacion_enviada,
        simulation_approved: !!c.simulacion_aprobada,
        pdf_sent: !!c.pdf_enviado,
        pdf_approved: c.pdf_aprobado,
        communication_ready: !!c.comunicacion_listo,
        communication_passed: !!c.comunicacion_aprobada,
        declaration_xml: c.xml_declaracion,
        declaration_signed_xml: c.xml_declaracion_firmado,
        declaration_submitted: !!c.declaracion_enviada,
        rnc_verified: !!c.rnc_verificado,
        cancel_reason: c.motivo_cancelacion,
        started_at: c.fecha_inicio,
        completed_at: c.fecha_completado,
      },
    });
  }
  console.log('✅ Progresos de certificación migrados');

  await pool.close();
  await prisma.$disconnect();
  console.log('\n🎉 Migración completada exitosamente!');
}

migrate().catch((err) => {
  console.error('❌ Error en migración:', err);
  process.exit(1);
});
