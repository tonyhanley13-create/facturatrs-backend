-- CreateTable
CREATE TABLE "usuarios" (
    "id" SERIAL NOT NULL,
    "nombre_usuario" VARCHAR(50),
    "correo_electronico" TEXT NOT NULL,
    "clave_acceso" TEXT NOT NULL,
    "nombre" VARCHAR(100),
    "apellido" VARCHAR(100),
    "nombre_empresa" VARCHAR(255),
    "es_super_admin" BOOLEAN NOT NULL DEFAULT false,
    "token_sesion" VARCHAR(500),
    "fecha_creacion" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "usuarios_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "empresas" (
    "id" SERIAL NOT NULL,
    "nombre" VARCHAR(255) NOT NULL,
    "rnc" VARCHAR(20) NOT NULL,
    "direccion" TEXT,
    "telefono" VARCHAR(20),
    "correo" VARCHAR(255),
    "url_logo" VARCHAR(500),
    "moneda_defecto" VARCHAR(3) NOT NULL DEFAULT 'DOP',
    "porcentaje_itbis" DECIMAL(5,2) NOT NULL DEFAULT 18.00,
    "proximo_numero_factura" INTEGER NOT NULL DEFAULT 1,
    "prefijo_factura" VARCHAR(10) NOT NULL DEFAULT 'FACT-',
    "rangos_ncf" TEXT,
    "id_empresa_alanube" VARCHAR(50),
    "ambiente_alanube" VARCHAR(20) NOT NULL DEFAULT 'sandbox',
    "proveedor_fiscal" VARCHAR(20) NOT NULL DEFAULT 'alanube',
    "id_empresa_gae" VARCHAR(50),
    "codigo_vendedor_gae" VARCHAR(50),
    "ambiente_gae" VARCHAR(20) NOT NULL DEFAULT 'Test',
    "ambiente_dgii" VARCHAR(20) NOT NULL DEFAULT 'Test',
    "nombre_certificado" VARCHAR(255),
    "contenido_certificado" TEXT,
    "clave_certificado" VARCHAR(500),
    "vencimiento_certificado" TIMESTAMP(3),
    "modalidad_facturacion" VARCHAR(20) NOT NULL DEFAULT 'electronica',
    "fecha_inicio_electronica" DATE,
    "es_plantilla" BOOLEAN NOT NULL DEFAULT false,
    "fecha_creacion" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fecha_actualizacion" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "empresas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "usuario_empresas" (
    "id_usuario" INTEGER NOT NULL,
    "id_empresa" INTEGER NOT NULL,
    "rol" VARCHAR(50) NOT NULL DEFAULT 'admin',
    "puede_cambiar_empresa" BOOLEAN NOT NULL DEFAULT true,
    "permisos" TEXT,
    "fecha_creacion" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "usuario_empresas_pkey" PRIMARY KEY ("id_usuario","id_empresa")
);

-- CreateTable
CREATE TABLE "catalogo_cuentas" (
    "id" SERIAL NOT NULL,
    "id_empresa" INTEGER NOT NULL,
    "codigo" VARCHAR(50) NOT NULL,
    "nombre" VARCHAR(255) NOT NULL,
    "tipo" VARCHAR(50) NOT NULL,
    "id_padre" INTEGER,
    "nivel" INTEGER NOT NULL DEFAULT 1,
    "es_grupo" BOOLEAN NOT NULL DEFAULT false,
    "fecha_creacion" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "catalogo_cuentas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "clientes" (
    "id" SERIAL NOT NULL,
    "id_usuario" INTEGER NOT NULL,
    "id_empresa" INTEGER,
    "nombre" VARCHAR(255) NOT NULL,
    "rnc_cedula" VARCHAR(20) NOT NULL,
    "telefono" VARCHAR(20),
    "direccion" TEXT,
    "persona_contacto" VARCHAR(255),
    "correo_electronico" VARCHAR(255),
    "tipo_cliente" VARCHAR(50) DEFAULT 'individual',
    "id_fiscal" VARCHAR(20),
    "campos_personalizados" TEXT,
    "fecha_creacion" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "clientes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "configuracion_empresa" (
    "id" SERIAL NOT NULL,
    "id_usuario" INTEGER NOT NULL,
    "nombre_empresa" VARCHAR(255) NOT NULL,
    "rnc_empresa" VARCHAR(20) NOT NULL,
    "direccion_empresa" TEXT,
    "telefono_empresa" VARCHAR(20),
    "correo_empresa" VARCHAR(255),
    "url_logo_empresa" VARCHAR(500),
    "moneda_defecto" VARCHAR(3) NOT NULL DEFAULT 'DOP',
    "porcentaje_itbis" DECIMAL(5,2) NOT NULL DEFAULT 18.00,
    "proximo_numero_factura" INTEGER NOT NULL DEFAULT 1,
    "prefijo_factura" VARCHAR(10) NOT NULL DEFAULT 'FACT-',
    "id_empresa_alanube" VARCHAR(50),
    "ambiente_alanube" VARCHAR(20) NOT NULL DEFAULT 'sandbox',
    "campos_clientes_requeridos" TEXT,
    "campos_personalizados_clientes" TEXT,
    "plantilla_factura" VARCHAR(50) NOT NULL DEFAULT 'default',
    "tipo_plan" VARCHAR(20) NOT NULL DEFAULT 'starter',
    "limite_facturas_mensual" INTEGER NOT NULL DEFAULT 50,
    "limite_usuarios" INTEGER NOT NULL DEFAULT 1,
    "fecha_creacion" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fecha_actualizacion" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "configuracion_empresa_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "facturas" (
    "id" SERIAL NOT NULL,
    "id_usuario" INTEGER NOT NULL,
    "id_empresa" INTEGER,
    "id_cliente" INTEGER NOT NULL,
    "numero_factura" VARCHAR(50) NOT NULL,
    "descripcion" TEXT,
    "monto_bruto" DECIMAL(18,2) NOT NULL,
    "subtotal" DECIMAL(18,2) NOT NULL,
    "monto_itbis" DECIMAL(18,2) NOT NULL,
    "monto_descuento" DECIMAL(18,2) NOT NULL DEFAULT 0.00,
    "monto_total" DECIMAL(18,2) NOT NULL,
    "moneda" VARCHAR(3) NOT NULL DEFAULT 'DOP',
    "estado" VARCHAR(50) NOT NULL DEFAULT 'draft',
    "id_alanube" VARCHAR(100),
    "ncf" VARCHAR(50),
    "fecha_vencimiento" DATE,
    "estado_pago" VARCHAR(20) NOT NULL DEFAULT 'pending',
    "metodo_pago" VARCHAR(50) NOT NULL DEFAULT '01',
    "notas" TEXT,
    "tipo_documento" VARCHAR(50),
    "ncf_referencia" VARCHAR(50),
    "campos_personalizados" TEXT,
    "id_seguimiento_dgii" VARCHAR(100),
    "codigo_seguridad_dgii" VARCHAR(20),
    "xml_firmado_dgii" TEXT,
    "estado_dgii" VARCHAR(20),
    "es_contingencia" BOOLEAN NOT NULL DEFAULT false,
    "error_dgii" TEXT,
    "fecha_creacion" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "facturas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "detalle_facturas" (
    "id" SERIAL NOT NULL,
    "id_factura" INTEGER NOT NULL,
    "numero_linea" INTEGER NOT NULL,
    "codigo_item" VARCHAR(50),
    "nombre_item" VARCHAR(255) NOT NULL,
    "descripcion" TEXT,
    "cantidad" DECIMAL(10,3) NOT NULL DEFAULT 1.000,
    "precio_unitario" DECIMAL(18,2) NOT NULL,
    "porcentaje_descuento" DECIMAL(5,2) NOT NULL DEFAULT 0.00,
    "porcentaje_itbis" DECIMAL(5,2) NOT NULL DEFAULT 18.00,
    "subtotal" DECIMAL(18,2) NOT NULL,
    "monto_itbis" DECIMAL(18,2) NOT NULL,
    "monto_total" DECIMAL(18,2) NOT NULL,
    "indicador_facturacion" INTEGER NOT NULL DEFAULT 1,
    "indicador_bien_servicio" INTEGER NOT NULL DEFAULT 2,
    "unidad_medida" VARCHAR(10) NOT NULL DEFAULT 'UND',
    "fecha_creacion" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "detalle_facturas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "productos_servicios" (
    "id" SERIAL NOT NULL,
    "id_usuario" INTEGER NOT NULL,
    "id_empresa" INTEGER,
    "codigo" VARCHAR(50),
    "nombre" VARCHAR(255) NOT NULL,
    "descripcion" TEXT,
    "categoria" VARCHAR(100),
    "precio_unitario" DECIMAL(18,2) NOT NULL,
    "porcentaje_itbis" DECIMAL(5,2) NOT NULL DEFAULT 18.00,
    "tipo" VARCHAR(20) NOT NULL DEFAULT 'service',
    "unidad_medida" VARCHAR(10) NOT NULL DEFAULT 'UND',
    "indicador_facturacion" INTEGER NOT NULL DEFAULT 1,
    "indicador_bien_servicio" INTEGER NOT NULL DEFAULT 2,
    "esta_activo" BOOLEAN NOT NULL DEFAULT true,
    "fecha_creacion" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fecha_actualizacion" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "productos_servicios_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "analiticas_uso" (
    "id" SERIAL NOT NULL,
    "id_usuario" INTEGER NOT NULL,
    "inicio_periodo" DATE NOT NULL,
    "fin_periodo" DATE NOT NULL,
    "facturas_creadas" INTEGER NOT NULL DEFAULT 0,
    "ingresos_totales" DECIMAL(18,2) NOT NULL DEFAULT 0.00,
    "clientes_activos" INTEGER NOT NULL DEFAULT 0,
    "peticiones_alanube" INTEGER NOT NULL DEFAULT 0,
    "limite_facturas_plan" INTEGER,
    "limite_usuarios_plan" INTEGER,
    "fecha_creacion" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "analiticas_uso_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "recibidos_ecf" (
    "id" SERIAL NOT NULL,
    "id_empresa" INTEGER NOT NULL,
    "encf" VARCHAR(50) NOT NULL,
    "rnc_emisor" VARCHAR(20) NOT NULL,
    "rnc_comprador" VARCHAR(20) NOT NULL,
    "monto_total" DECIMAL(18,2) NOT NULL,
    "xml_firmado" TEXT NOT NULL,
    "estado" VARCHAR(20) NOT NULL DEFAULT 'pending',
    "aprobacion" VARCHAR(20),
    "respuesta_original" TEXT,
    "fecha_creacion" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "recibidos_ecf_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "progreso_certificacion" (
    "id" SERIAL NOT NULL,
    "id_empresa" INTEGER NOT NULL,
    "paso_actual" INTEGER NOT NULL DEFAULT 0,
    "estado" VARCHAR(20) NOT NULL DEFAULT 'not_started',
    "requisitos_verificados" BOOLEAN NOT NULL DEFAULT false,
    "solicitud_completada" BOOLEAN NOT NULL DEFAULT false,
    "fecha_solicitud" TIMESTAMP(3),
    "datos_prueba_enviados" BOOLEAN NOT NULL DEFAULT false,
    "datos_prueba_aprobados" BOOLEAN NOT NULL DEFAULT false,
    "simulacion_enviada" BOOLEAN NOT NULL DEFAULT false,
    "simulacion_aprobada" BOOLEAN NOT NULL DEFAULT false,
    "cantidad_ecf_prueba" INTEGER NOT NULL DEFAULT 0,
    "pdf_enviado" BOOLEAN NOT NULL DEFAULT false,
    "pdf_aprobado" BOOLEAN,
    "url_recepcion" VARCHAR(500),
    "url_aprobacion" VARCHAR(500),
    "url_autenticacion" VARCHAR(500),
    "comunicacion_listo" BOOLEAN NOT NULL DEFAULT false,
    "comunicacion_aprobada" BOOLEAN NOT NULL DEFAULT false,
    "xml_postulacion" TEXT,
    "xml_postulacion_firmado" TEXT,
    "nombre_software" VARCHAR(255),
    "version_software" VARCHAR(50),
    "tipo_software" VARCHAR(50),
    "nombre_proveedor" VARCHAR(255),
    "contacto_proveedor" VARCHAR(255),
    "xml_declaracion" TEXT,
    "xml_declaracion_firmado" TEXT,
    "declaracion_enviada" BOOLEAN NOT NULL DEFAULT false,
    "rnc_verificado" BOOLEAN NOT NULL DEFAULT false,
    "url_recepcion_produccion" VARCHAR(500),
    "url_aprobacion_produccion" VARCHAR(500),
    "url_autenticacion_produccion" VARCHAR(500),
    "motivo_cancelacion" TEXT,
    "fecha_inicio" TIMESTAMP(3),
    "fecha_completado" TIMESTAMP(3),
    "fecha_creacion" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fecha_actualizacion" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "progreso_certificacion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "secuencias_ncf" (
    "id" SERIAL NOT NULL,
    "id_empresa" INTEGER NOT NULL,
    "tipo" VARCHAR(10) NOT NULL,
    "prefijo" VARCHAR(10) NOT NULL,
    "siguiente" INTEGER NOT NULL DEFAULT 1,
    "final" INTEGER NOT NULL DEFAULT 999999,

    CONSTRAINT "secuencias_ncf_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "compras_manual" (
    "id" SERIAL NOT NULL,
    "id_empresa" INTEGER NOT NULL,
    "ncf" VARCHAR(50) NOT NULL,
    "rnc_proveedor" VARCHAR(20) NOT NULL,
    "nombre_proveedor" VARCHAR(255) NOT NULL,
    "fecha" DATE NOT NULL,
    "monto_total" DECIMAL(18,2) NOT NULL,
    "itbis" DECIMAL(18,2) NOT NULL,
    "tipo_comprobante" VARCHAR(2) NOT NULL,
    "fecha_creacion" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "compras_manual_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reportes_dgii" (
    "id" SERIAL NOT NULL,
    "id_empresa" INTEGER NOT NULL,
    "tipo" VARCHAR(10) NOT NULL,
    "anio" INTEGER NOT NULL,
    "mes" INTEGER NOT NULL,
    "estado" VARCHAR(20) NOT NULL DEFAULT 'draft',
    "contenido_xml" TEXT,
    "xml_firmado" TEXT,
    "id_seguimiento" VARCHAR(100),
    "mensaje_error" TEXT,
    "fecha_creacion" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fecha_actualizacion" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "reportes_dgii_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "auditoria_facturas" (
    "id" SERIAL NOT NULL,
    "id_factura" INTEGER NOT NULL,
    "id_usuario" INTEGER NOT NULL,
    "accion" VARCHAR(50) NOT NULL,
    "estado_anterior" TEXT,
    "estado_nuevo" TEXT,
    "detalles" TEXT,
    "fecha_creacion" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "auditoria_facturas_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "usuarios_correo_electronico_key" ON "usuarios"("correo_electronico");

-- CreateIndex
CREATE UNIQUE INDEX "progreso_certificacion_id_empresa_key" ON "progreso_certificacion"("id_empresa");

-- CreateIndex
CREATE UNIQUE INDEX "secuencias_ncf_id_empresa_tipo_key" ON "secuencias_ncf"("id_empresa", "tipo");

-- CreateIndex
CREATE UNIQUE INDEX "reportes_dgii_id_empresa_tipo_anio_mes_key" ON "reportes_dgii"("id_empresa", "tipo", "anio", "mes");

-- AddForeignKey
ALTER TABLE "usuario_empresas" ADD CONSTRAINT "usuario_empresas_id_usuario_fkey" FOREIGN KEY ("id_usuario") REFERENCES "usuarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "usuario_empresas" ADD CONSTRAINT "usuario_empresas_id_empresa_fkey" FOREIGN KEY ("id_empresa") REFERENCES "empresas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "catalogo_cuentas" ADD CONSTRAINT "catalogo_cuentas_id_empresa_fkey" FOREIGN KEY ("id_empresa") REFERENCES "empresas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clientes" ADD CONSTRAINT "clientes_id_usuario_fkey" FOREIGN KEY ("id_usuario") REFERENCES "usuarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clientes" ADD CONSTRAINT "clientes_id_empresa_fkey" FOREIGN KEY ("id_empresa") REFERENCES "empresas"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "configuracion_empresa" ADD CONSTRAINT "configuracion_empresa_id_usuario_fkey" FOREIGN KEY ("id_usuario") REFERENCES "usuarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "facturas" ADD CONSTRAINT "facturas_id_usuario_fkey" FOREIGN KEY ("id_usuario") REFERENCES "usuarios"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "facturas" ADD CONSTRAINT "facturas_id_empresa_fkey" FOREIGN KEY ("id_empresa") REFERENCES "empresas"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "facturas" ADD CONSTRAINT "facturas_id_cliente_fkey" FOREIGN KEY ("id_cliente") REFERENCES "clientes"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "detalle_facturas" ADD CONSTRAINT "detalle_facturas_id_factura_fkey" FOREIGN KEY ("id_factura") REFERENCES "facturas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "productos_servicios" ADD CONSTRAINT "productos_servicios_id_usuario_fkey" FOREIGN KEY ("id_usuario") REFERENCES "usuarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "productos_servicios" ADD CONSTRAINT "productos_servicios_id_empresa_fkey" FOREIGN KEY ("id_empresa") REFERENCES "empresas"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "analiticas_uso" ADD CONSTRAINT "analiticas_uso_id_usuario_fkey" FOREIGN KEY ("id_usuario") REFERENCES "usuarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recibidos_ecf" ADD CONSTRAINT "recibidos_ecf_id_empresa_fkey" FOREIGN KEY ("id_empresa") REFERENCES "empresas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "progreso_certificacion" ADD CONSTRAINT "progreso_certificacion_id_empresa_fkey" FOREIGN KEY ("id_empresa") REFERENCES "empresas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "secuencias_ncf" ADD CONSTRAINT "secuencias_ncf_id_empresa_fkey" FOREIGN KEY ("id_empresa") REFERENCES "empresas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "compras_manual" ADD CONSTRAINT "compras_manual_id_empresa_fkey" FOREIGN KEY ("id_empresa") REFERENCES "empresas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reportes_dgii" ADD CONSTRAINT "reportes_dgii_id_empresa_fkey" FOREIGN KEY ("id_empresa") REFERENCES "empresas"("id") ON DELETE CASCADE ON UPDATE CASCADE;
