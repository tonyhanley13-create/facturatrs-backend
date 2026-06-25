-- Script para renombrar tablas y columnas de Inglés a Español en FacturaTRS
-- Basado en el mapeo definido en schema.prisma

USE FacturaTRS;
GO

-- 1. Usuarios (users -> usuarios)
EXEC sp_rename 'users.email', 'correo_electronico', 'COLUMN';
EXEC sp_rename 'users.password', 'clave_acceso', 'COLUMN';
EXEC sp_rename 'users.first_name', 'nombre', 'COLUMN';
EXEC sp_rename 'users.last_name', 'apellido', 'COLUMN';
EXEC sp_rename 'users.company_name', 'nombre_empresa', 'COLUMN';
EXEC sp_rename 'users.created_at', 'fecha_creacion', 'COLUMN';
EXEC sp_rename 'users', 'usuarios';
GO

-- 2. Clientes (clients -> clientes)
EXEC sp_rename 'clients.user_id', 'id_usuario', 'COLUMN';
EXEC sp_rename 'clients.name', 'nombre', 'COLUMN';
EXEC sp_rename 'clients.rnc', 'rnc_cedula', 'COLUMN';
EXEC sp_rename 'clients.phone', 'telefono', 'COLUMN';
EXEC sp_rename 'clients.address', 'direccion', 'COLUMN';
EXEC sp_rename 'clients.contact_person', 'persona_contacto', 'COLUMN';
EXEC sp_rename 'clients.email', 'correo_electronico', 'COLUMN';
EXEC sp_rename 'clients.client_type', 'tipo_cliente', 'COLUMN';
EXEC sp_rename 'clients.tax_id', 'id_fiscal', 'COLUMN';
EXEC sp_rename 'clients.custom_fields', 'campos_personalizados', 'COLUMN';
EXEC sp_rename 'clients.created_at', 'fecha_creacion', 'COLUMN';
EXEC sp_rename 'clients', 'clientes';
GO

-- 3. Productos y Servicios (products_services -> productos_servicios)
EXEC sp_rename 'products_services.user_id', 'id_usuario', 'COLUMN';
EXEC sp_rename 'products_services.code', 'codigo', 'COLUMN';
EXEC sp_rename 'products_services.name', 'nombre', 'COLUMN';
EXEC sp_rename 'products_services.description', 'descripcion', 'COLUMN';
EXEC sp_rename 'products_services.category', 'categoria', 'COLUMN';
EXEC sp_rename 'products_services.unit_price', 'precio_unitario', 'COLUMN';
EXEC sp_rename 'products_services.tax_percentage', 'porcentaje_itbis', 'COLUMN';
EXEC sp_rename 'products_services.type', 'tipo', 'COLUMN';
EXEC sp_rename 'products_services.unit_of_measure', 'unidad_medida', 'COLUMN';
EXEC sp_rename 'products_services.billing_indicator', 'indicador_facturacion', 'COLUMN';
EXEC sp_rename 'products_services.good_service_indicator', 'indicador_bien_servicio', 'COLUMN';
EXEC sp_rename 'products_services.is_active', 'esta_activo', 'COLUMN';
EXEC sp_rename 'products_services.created_at', 'fecha_creacion', 'COLUMN';
EXEC sp_rename 'products_services.updated_at', 'fecha_actualizacion', 'COLUMN';
EXEC sp_rename 'products_services', 'productos_servicios';
GO

-- 4. Facturas (invoices -> facturas)
EXEC sp_rename 'invoices.user_id', 'id_usuario', 'COLUMN';
EXEC sp_rename 'invoices.client_id', 'id_cliente', 'COLUMN';
EXEC sp_rename 'invoices.invoice_number', 'numero_factura', 'COLUMN';
EXEC sp_rename 'invoices.description', 'descripcion', 'COLUMN';
EXEC sp_rename 'invoices.amount', 'monto_bruto', 'COLUMN';
EXEC sp_rename 'invoices.subtotal', 'subtotal', 'COLUMN';
EXEC sp_rename 'invoices.tax_amount', 'monto_itbis', 'COLUMN';
EXEC sp_rename 'invoices.discount_amount', 'monto_descuento', 'COLUMN';
EXEC sp_rename 'invoices.total_amount', 'monto_total', 'COLUMN';
EXEC sp_rename 'invoices.currency', 'moneda', 'COLUMN';
EXEC sp_rename 'invoices.status', 'estado', 'COLUMN';
EXEC sp_rename 'invoices.alanube_id', 'id_alanube', 'COLUMN';
EXEC sp_rename 'invoices.ncf', 'ncf', 'COLUMN';
EXEC sp_rename 'invoices.due_date', 'fecha_vencimiento', 'COLUMN';
EXEC sp_rename 'invoices.payment_status', 'estado_pago', 'COLUMN';
EXEC sp_rename 'invoices.payment_method', 'metodo_pago', 'COLUMN';
EXEC sp_rename 'invoices.notes', 'notas', 'COLUMN';
EXEC sp_rename 'invoices.custom_fields', 'campos_personalizados', 'COLUMN';
EXEC sp_rename 'invoices.created_at', 'fecha_creacion', 'COLUMN';
EXEC sp_rename 'invoices', 'facturas';
GO

-- 5. Detalle de Facturas (invoice_items -> detalle_facturas)
EXEC sp_rename 'invoice_items.invoice_id', 'id_factura', 'COLUMN';
EXEC sp_rename 'invoice_items.line_number', 'numero_linea', 'COLUMN';
EXEC sp_rename 'invoice_items.item_code', 'codigo_item', 'COLUMN';
EXEC sp_rename 'invoice_items.item_name', 'nombre_item', 'COLUMN';
EXEC sp_rename 'invoice_items.description', 'descripcion', 'COLUMN';
EXEC sp_rename 'invoice_items.quantity', 'cantidad', 'COLUMN';
EXEC sp_rename 'invoice_items.unit_price', 'precio_unitario', 'COLUMN';
EXEC sp_rename 'invoice_items.discount_percentage', 'porcentaje_descuento', 'COLUMN';
EXEC sp_rename 'invoice_items.tax_percentage', 'porcentaje_itbis', 'COLUMN';
EXEC sp_rename 'invoice_items.subtotal', 'subtotal', 'COLUMN';
EXEC sp_rename 'invoice_items.tax_amount', 'monto_itbis', 'COLUMN';
EXEC sp_rename 'invoice_items.total_amount', 'monto_total', 'COLUMN';
EXEC sp_rename 'invoice_items.billing_indicator', 'indicador_facturacion', 'COLUMN';
EXEC sp_rename 'invoice_items.good_service_indicator', 'indicador_bien_servicio', 'COLUMN';
EXEC sp_rename 'invoice_items.unit_of_measure', 'unidad_medida', 'COLUMN';
EXEC sp_rename 'invoice_items.created_at', 'fecha_creacion', 'COLUMN';
EXEC sp_rename 'invoice_items', 'detalle_facturas';
GO

-- 6. Analíticas (usage_analytics -> analiticas_uso)
EXEC sp_rename 'usage_analytics.user_id', 'id_usuario', 'COLUMN';
EXEC sp_rename 'usage_analytics.period_start', 'inicio_periodo', 'COLUMN';
EXEC sp_rename 'usage_analytics.period_end', 'fin_periodo', 'COLUMN';
EXEC sp_rename 'usage_analytics.invoices_created', 'facturas_creadas', 'COLUMN';
EXEC sp_rename 'usage_analytics.total_revenue', 'ingresos_totales', 'COLUMN';
EXEC sp_rename 'usage_analytics.clients_active', 'clientes_activos', 'COLUMN';
EXEC sp_rename 'usage_analytics.alanube_requests', 'peticiones_alanube', 'COLUMN';
EXEC sp_rename 'usage_analytics.plan_invoice_limit', 'limite_facturas_plan', 'COLUMN';
EXEC sp_rename 'usage_analytics.plan_user_limit', 'limite_usuarios_plan', 'COLUMN';
EXEC sp_rename 'usage_analytics.created_at', 'fecha_creacion', 'COLUMN';
EXEC sp_rename 'usage_analytics', 'analiticas_uso';
GO
