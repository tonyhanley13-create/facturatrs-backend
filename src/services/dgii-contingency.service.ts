import prisma from '../models/db';
import * as dgiiService from './dgii.service';

export async function sendWithContingency(
  companyId: number,
  invoiceId: number,
  encfNumber: string,
  rncEmisor: string,
  rncComprador: string,
  montoTotal: number,
  environment?: string,
  documentType?: string,
  referenceNcf?: string,
  modificationCode?: string,
): Promise<{
  success: boolean;
  trackId?: string;
  signedXml?: string;
  securityCode?: string;
  contingency?: boolean;
  message: string;
  detail?: any;
}> {
  try {
    const result = await dgiiService.sendInvoice(
      companyId, invoiceId, encfNumber, rncEmisor, rncComprador, montoTotal,
      environment, documentType, referenceNcf, modificationCode,
    );

    // Éxito: actualizar factura con trackId
    await prisma.invoice.update({
      where: { id: invoiceId },
      data: {
        dgii_track_id: result.trackId,
        dgii_security_code: result.securityCode,
        dgii_signed_xml: result.signedXml,
        dgii_status: 'sent',
        dgii_contingency: false,
      },
    });

    return {
      success: true,
      trackId: result.trackId,
      signedXml: result.signedXml,
      securityCode: result.securityCode,
      contingency: false,
      message: 'Enviado a DGII exitosamente',
    };
  } catch (error: any) {
    // Si falla, almacenar en contingencia
    const invoice = await prisma.invoice.findUnique({
      where: { id: invoiceId },
      include: { items: true, client: true, company: true },
    });

    if (!invoice) throw error;

    // Intentar firmar localmente aunque falle el envío
    let signedXml = '';
    try {
      const certs = await dgiiService.loadCertificate(companyId);
      const { ECF, Transformer, Signature } = require('dgii-ecf');
      const transformer = new Transformer();

      const ecfType = parseInt(encfNumber.substring(1, 3), 10);
      const todayStr = _formatDate(new Date());

      const dgiiItems = _buildItems(invoice);
      const hasTax = Number(invoice.tax_amount) > 0;
      const totales = hasTax
        ? { MontoGravadoTotal: Number(invoice.subtotal), MontoGravadoI1: Number(invoice.subtotal), ITBIS1: 18, TotalITBIS: Number(invoice.tax_amount), TotalITBIS1: Number(invoice.tax_amount), MontoTotal: Number(invoice.total_amount) }
        : { MontoExento: Number(invoice.total_amount), MontoTotal: Number(invoice.total_amount) };

      const ecfBody: any = {
        Encabezado: {
          Version: '1.0',
          IdDoc: { TipoeCF: ecfType, eNCF: encfNumber, FechaVencimientoSecuencia: '31-12-2028', IndicadorEnvioDiferido: 1, TipoIngresos: '01', TipoPago: ecfType === 34 ? 2 : 1, TotalPaginas: 1 },
          Emisor: { RNCEmisor: rncEmisor.replace(/-/g, ''), RazonSocialEmisor: (invoice.company?.name || '').substring(0, 80), DireccionEmisor: (invoice.company?.address || 'CALLE PRINCIPAL #1').substring(0, 70), FechaEmision: todayStr },
          Comprador: { RNCComprador: rncComprador.replace(/-/g, ''), RazonSocialComprador: (invoice.client?.name || 'CLIENTE FINAL').substring(0, 80) },
          Totales: totales,
        },
        DetallesItems: { Item: dgiiItems.length === 1 ? dgiiItems[0] : dgiiItems },
      };

      ecfBody.Paginacion = { Pagina: { PaginaNo: 1, NoLineaDesde: 1, NoLineaHasta: dgiiItems.length, SubtotalMontoGravadoPagina: hasTax ? Number(invoice.subtotal) : 0, SubtotalMontoGravado1Pagina: hasTax ? Number(invoice.subtotal) : 0, SubtotalExentoPagina: hasTax ? 0 : Number(invoice.total_amount), SubtotalItbisPagina: Number(invoice.tax_amount), SubtotalItbis1Pagina: Number(invoice.tax_amount), MontoSubtotalPagina: Number(invoice.total_amount), SubtotalMontoNoFacturablePagina: 0 } };
      ecfBody.FechaHoraFirma = _formatFullDate(new Date());

      const xml = transformer.json2xml({ ECF: ecfBody });
      const signature = new Signature(certs.key, certs.cert);
      signedXml = signature.signXml(xml, 'ECF');
    } catch (_) {
      // Si falla la firma local, no tenemos XML firmado
    }

    await prisma.invoice.update({
      where: { id: invoiceId },
      data: {
        dgii_signed_xml: signedXml || null,
        dgii_status: 'contingency',
        dgii_contingency: true,
        dgii_error: error.message,
      },
    });

    return {
      success: false,
      signedXml: signedXml || undefined,
      contingency: true,
      message: `DGII no disponible. Factura guardada en contingencia: ${error.message}`,
      detail: error.message,
    };
  }
}

export async function resendContingency(companyId: number): Promise<{ sent: number; failed: number; errors: string[] }> {
  const contingencyInvoices = await prisma.invoice.findMany({
    where: { company_id: companyId, dgii_contingency: true, dgii_status: 'contingency' },
    include: { client: true, company: true },
  });

  let sent = 0;
  let failed = 0;
  const errors: string[] = [];

  for (const inv of contingencyInvoices) {
    if (inv.dgii_track_id) {
      // Ya tiene trackId, fue reenviado antes
      continue;
    }

    try {
      const result = await dgiiService.sendInvoice(
        companyId, inv.id, inv.ncf || '',
        (inv.company?.rnc || '').replace(/-/g, ''),
        (inv.client?.rnc || '').replace(/-/g, ''),
        Number(inv.total_amount),
        inv.company?.dgii_environment || 'Test',
      );

      await prisma.invoice.update({
        where: { id: inv.id },
        data: {
          dgii_track_id: result.trackId,
          dgii_security_code: result.securityCode,
          dgii_signed_xml: result.signedXml,
          dgii_status: 'sent',
          dgii_contingency: false,
          dgii_error: null,
        },
      });
      sent++;
    } catch (e: any) {
      errors.push(`Factura #${inv.invoice_number}: ${e.message}`);
      failed++;
    }
  }

  return { sent, failed, errors };
}

export async function listContingency(companyId: number) {
  return prisma.invoice.findMany({
    where: { company_id: companyId, dgii_contingency: true },
    orderBy: { created_at: 'desc' },
    include: { client: true },
  });
}

function _formatDate(d: Date): string {
  return `${String(d.getDate()).padStart(2, '0')}-${String(d.getMonth() + 1).padStart(2, '0')}-${d.getFullYear()}`;
}

function _formatFullDate(d: Date): string {
  return `${_formatDate(d)} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}`;
}

function _buildItems(invoice: any): any[] {
  if (invoice.items?.length > 0) {
    return invoice.items.map((item: any, index: number) => {
      const qty = Number(item.quantity) || 1;
      const price = Number(item.unit_price) || 0;
      const itemTotal = Number(item.total_amount) || (qty * price);
      const taxAmount = Number(item.tax_amount) || 0;
      return {
        NumeroLinea: (index + 1).toString(),
        IndicadorFacturacion: taxAmount > 0 ? 1 : 4,
        NombreItem: (item.item_name || item.description || 'Producto/Servicio').substring(0, 80),
        IndicadorBienoServicio: Number(item.good_service_indicator) || 1,
        CantidadItem: qty,
        PrecioUnitarioItem: price,
        MontoItem: itemTotal - taxAmount,
      };
    });
  }
  return [{
    NumeroLinea: '1',
    IndicadorFacturacion: 1,
    NombreItem: (invoice.description || 'Servicio').substring(0, 80),
    IndicadorBienoServicio: 2,
    CantidadItem: 1,
    PrecioUnitarioItem: Number(invoice.total_amount),
    MontoItem: Number(invoice.total_amount),
  }];
}
