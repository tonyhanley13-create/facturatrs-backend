-- Script para renombrar company_settings de Inglés a Español en FacturaTRS
USE FacturaTRS;
GO

EXEC sp_rename 'company_settings.user_id', 'id_usuario', 'COLUMN';
EXEC sp_rename 'company_settings.company_name', 'nombre_empresa', 'COLUMN';
EXEC sp_rename 'company_settings.company_rnc', 'rnc_empresa', 'COLUMN';
EXEC sp_rename 'company_settings.company_address', 'direccion_empresa', 'COLUMN';
EXEC sp_rename 'company_settings.company_phone', 'telefono_empresa', 'COLUMN';
EXEC sp_rename 'company_settings.company_email', 'correo_empresa', 'COLUMN';
EXEC sp_rename 'company_settings.company_logo_url', 'url_logo_empresa', 'COLUMN';
EXEC sp_rename 'company_settings.default_currency', 'moneda_defecto', 'COLUMN';
EXEC sp_rename 'company_settings.tax_percentage', 'porcentaje_itbis', 'COLUMN';
EXEC sp_rename 'company_settings.next_invoice_number', 'proximo_numero_factura', 'COLUMN';
EXEC sp_rename 'company_settings.invoice_prefix', 'prefijo_factura', 'COLUMN';
EXEC sp_rename 'company_settings.alanube_company_id', 'id_empresa_alanube', 'COLUMN';
EXEC sp_rename 'company_settings.alanube_environment', 'ambiente_alanube', 'COLUMN';
EXEC sp_rename 'company_settings.required_client_fields', 'campos_clientes_requeridos', 'COLUMN';
EXEC sp_rename 'company_settings.client_custom_fields', 'campos_personalizados_clientes', 'COLUMN';
EXEC sp_rename 'company_settings.invoice_template', 'plantilla_factura', 'COLUMN';
EXEC sp_rename 'company_settings.plan_type', 'tipo_plan', 'COLUMN';
EXEC sp_rename 'company_settings.monthly_invoice_limit', 'limite_facturas_mensual', 'COLUMN';
EXEC sp_rename 'company_settings.user_limit', 'limite_usuarios', 'COLUMN';
EXEC sp_rename 'company_settings.created_at', 'fecha_creacion', 'COLUMN';
EXEC sp_rename 'company_settings.updated_at', 'fecha_actualizacion', 'COLUMN';
EXEC sp_rename 'company_settings', 'configuracion_empresa';
GO
