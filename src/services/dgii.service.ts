import { ECF, P12Reader, Signature, Transformer, ENVIRONMENT, setAuthToken, restClient } from 'dgii-ecf';
import { generateEcfQRCodeURL, generateFcQRCodeURL, getCodeSixDigitfromSignature, generateRandomAlphaNumeric } from 'dgii-ecf';
import prisma from '../models/db';

const DGII_TIMEOUT_MS = 30000; // 30 segundos

restClient.defaults.timeout = DGII_TIMEOUT_MS;

function getEnv(env: string): ENVIRONMENT {
  switch (env) {
    case 'Production': return ENVIRONMENT.PROD;
    case 'Certification': return ENVIRONMENT.CERT;
    default: return ENVIRONMENT.DEV;
  }
}

export async function loadCertificate(companyId: number): Promise<{ key: string; cert: string }> {
  const company = await prisma.company.findUnique({ where: { id: companyId } });
  if (!company?.certificate_content || !company?.certificate_password) {
    throw new Error('Certificado digital no configurado. Configure el certificado .p12 en la configuración de DGII.');
  }
  const reader = new P12Reader(company.certificate_password);
  const result = reader.getKeyFromStringBase64(company.certificate_content);
  if (!result.key || !result.cert) {
    throw new Error('No se pudieron extraer la clave y certificado del archivo .p12');
  }
  return { key: result.key, cert: result.cert };
}

export async function authenticate(companyId: number, environment?: string): Promise<ECF> {
  const company = await prisma.company.findUnique({ where: { id: companyId } });
  const env = getEnv(environment || company?.dgii_environment || 'Test');
  const certs = await loadCertificate(companyId);
  const ecf = new ECF(certs, env);
  await ecf.authenticate();
  return ecf;
}

export async function sendInvoice(
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
): Promise<{ trackId: string; signedXml: string; securityCode: string; firmaFecha: string; estado: string; codigo: string; mensajes: any[]; secuenciaUtilizada: boolean }> {
  // 1. Obtener datos completos de la factura, items y cliente
  const invoice = await prisma.invoice.findUnique({
    where: { id: invoiceId },
    include: {
      items: true,
      client: true,
      company: true,
    },
  });

  if (!invoice) throw new Error('Factura no encontrada');
  const company = invoice.company;
  if (!company) throw new Error('Empresa no encontrada');
  const client = invoice.client;

  const env = getEnv(environment || company.dgii_environment || 'Test');
  const ecf = await authenticate(companyId, environment);

  const ecfType = parseInt(encfNumber.substring(1, 3), 10);
  const isE34 = ecfType === 34;

  // E32: Comprobante Fiscal (CF) — uses RFCE structure and sendSummary API
  if (ecfType === 32) {
    return sendSummaryInvoice(companyId, invoiceId, encfNumber, rncEmisor, rncComprador, montoTotal, environment);
  }

  function formatDgiiDate(d: Date): string {
    const dd = String(d.getDate()).padStart(2, '0');
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const yyyy = d.getFullYear();
    return `${dd}-${mm}-${yyyy}`;
  }

  function formatDgiiFullDate(d: Date): string {
    const dd = String(d.getDate()).padStart(2, '0');
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const yyyy = d.getFullYear();
    const hh = String(d.getHours()).padStart(2, '0');
    const min = String(d.getMinutes()).padStart(2, '0');
    const ss = String(d.getSeconds()).padStart(2, '0');
    return `${dd}-${mm}-${yyyy} ${hh}:${min}:${ss}`;
  }

  const todayStr = formatDgiiDate(new Date());
  const nowFullStr = formatDgiiFullDate(new Date());

  // 2. Mapear items reales (o crear item sintético si no hay items)
  let dgiiItems: any[];
  let calculatedTaxedAmount = 0;
  let calculatedExemptAmount = 0;

  if (invoice.items.length > 0) {
    dgiiItems = invoice.items.map((item, index) => {
      const qty = Number(item.quantity) || 1;
      const price = Number(item.unit_price) || 0;
      const subtotal = qty * price;
      const taxRate = Number(item.tax_percentage) || 0;
      const isItemTaxed = taxRate > 0;
      const itemTaxAmount = (subtotal * taxRate) / 100;

      if (isItemTaxed) {
        calculatedTaxedAmount += subtotal;
      } else {
        calculatedExemptAmount += subtotal;
      }

      return {
        NumeroLinea: (index + 1).toString(),
        IndicadorFacturacion: isItemTaxed ? 1 : 4, // 1 = Gravado, 4 = Exento
        NombreItem: (item.item_name || item.description || 'Producto/Servicio').substring(0, 80),
        IndicadorBienoServicio: Number(item.good_service_indicator) || 1,
        CantidadItem: qty,
        PrecioUnitarioItem: price,
        MontoItem: subtotal,
      };
    });
  } else {
    const subtotal = Number(invoice.subtotal);
    const hasTaxAmount = Number(invoice.tax_amount) > 0;
    if (hasTaxAmount) {
      calculatedTaxedAmount = subtotal;
    } else {
      calculatedExemptAmount = subtotal;
    }

    dgiiItems = [{
      NumeroLinea: '1',
      IndicadorFacturacion: hasTaxAmount ? 1 : 4,
      NombreItem: (invoice.description || 'Servicio').substring(0, 80),
      IndicadorBienoServicio: 2,
      CantidadItem: 1,
      PrecioUnitarioItem: subtotal,
      MontoItem: subtotal,
    }];
  }

  // 3. Construir payload completo
  const taxTotal = Number(invoice.tax_amount);

  // Construir objeto Totales respetando el orden del esquema e-CF
  const totales: any = {};
  if (calculatedTaxedAmount > 0) {
    totales.MontoGravadoTotal = calculatedTaxedAmount;
    totales.MontoGravadoI1 = calculatedTaxedAmount;
  }

  if (calculatedExemptAmount > 0) {
    totales.MontoExento = calculatedExemptAmount;
  }

  if (taxTotal > 0) {
    totales.ITBIS1 = 18; // Tasa
    totales.TotalITBIS = taxTotal;
    totales.TotalITBIS1 = taxTotal;
  }

  totales.MontoTotal = Number(invoice.total_amount);

  const idDoc: any = {
    TipoeCF: ecfType,
    eNCF: encfNumber,
  };

  if (isE34) {
    idDoc.IndicadorNotaCredito = '0';
  }
  const hasTax = taxTotal > 0;
  // Basado en ID 19 (E34 aceptada), usaba IndicadorMontoGravado: 1
  idDoc.IndicadorMontoGravado = (hasTax || isE34) ? 1 : 2; // 1 = Gravado/Mixto, 2 = Exento
  if (!isE34) {
    idDoc.IndicadorEnvioDiferido = 1;
  }
  idDoc.TipoIngresos = '01';
  idDoc.TipoPago = isE34 ? 2 : 1;
  if (isE34) {
    idDoc.FechaLimitePago = formatDgiiDate(new Date(Date.now() + 30 * 86400000));
  }
  idDoc.TotalPaginas = 1;

  const ecfBody: any = {
    Encabezado: {
      Version: '1.0',
      IdDoc: idDoc,
      Emisor: {
        RNCEmisor: rncEmisor.replace(/-/g, ''),
        RazonSocialEmisor: company.name.substring(0, 80),
        DireccionEmisor: (company.address || 'CALLE PRINCIPAL #1').substring(0, 70),
        FechaEmision: todayStr,
      },
      Comprador: {
        RNCComprador: rncComprador.replace(/-/g, ''),
        RazonSocialComprador: (client.name || 'CLIENTE FINAL').substring(0, 80),
      },
      Totales: totales,
    },
    DetallesItems: {
      Item: dgiiItems.length === 1 ? dgiiItems[0] : dgiiItems,
    },
  };

  const totalItems = dgiiItems.length;
  ecfBody.Paginacion = {
    Pagina: {
      PaginaNo: 1,
      NoLineaDesde: 1,
      NoLineaHasta: totalItems,
      SubtotalMontoGravadoPagina: calculatedTaxedAmount,
      SubtotalMontoGravado1Pagina: calculatedTaxedAmount,
      SubtotalExentoPagina: calculatedExemptAmount,
      SubtotalItbisPagina: taxTotal,
      SubtotalItbis1Pagina: taxTotal,
      MontoSubtotalPagina: Number(invoice.total_amount),
      SubtotalMontoNoFacturablePagina: 0,
    },
  };

  if ((ecfType === 33 || ecfType === 34) && referenceNcf) {
    let fechaOriginal = todayStr;
    try {
      const orig = await prisma.invoice.findFirst({
        where: { ncf: referenceNcf, company_id: companyId },
        select: { dgii_signed_xml: true },
      });
      if (orig?.dgii_signed_xml) {
        const match = orig.dgii_signed_xml.match(/<FechaEmision>(\d{2}-\d{2}-\d{4})<\/FechaEmision>/);
        if (match) {
          fechaOriginal = match[1];
        }
      }
    } catch (_) { }
    ecfBody.InformacionReferencia = {
      NCFModificado: referenceNcf,
      FechaNCFModificado: fechaOriginal,
      CodigoModificacion: modificationCode || '3',
    };
  }

  ecfBody.FechaHoraFirma = nowFullStr;

  const invoicePayload = { ECF: ecfBody };

  const transformer = new Transformer();
  const xml = transformer.json2xml(invoicePayload);

  console.log('=== GENERATED XML (before sign) ===');
  console.log(xml.substring(0, 2000));

  const certs = await loadCertificate(companyId);
  const signature = new Signature(certs.key, certs.cert);
  const signedXml = signature.signXml(xml, 'ECF');
  console.log('=== SIGNED XML (first 500 chars) ===');
  console.log(signedXml.substring(0, 500));

  const fileName = `${rncEmisor}${encfNumber}.xml`;

  const response: any = await ecf.sendElectronicDocument(signedXml, fileName);

  const trackId = response?.trackId || '';
  if (!trackId) {
    throw new Error(`DGII no retornó trackId: ${JSON.stringify(response)}`);
  }

  const securityCode = getCodeSixDigitfromSignature(signedXml) || '';

  return {
    trackId,
    signedXml,
    securityCode,
    firmaFecha: nowFullStr,
    estado: response?.estado || '',
    codigo: response?.codigo || '',
    mensajes: response?.mensajes || [],
    secuenciaUtilizada: response?.secuenciaUtilizada || false,
  };
}

export async function sendSummaryInvoice(
  companyId: number,
  invoiceId: number,
  encfNumber: string,
  rncEmisor: string,
  rncComprador: string,
  montoTotal: number,
  environment?: string,
): Promise<{ trackId: string; signedXml: string; securityCode: string; firmaFecha: string; estado: string; codigo: string; mensajes: any[]; secuenciaUtilizada: boolean }> {
  const invoice = await prisma.invoice.findUnique({
    where: { id: invoiceId },
    include: { client: true, company: true },
  });
  if (!invoice) throw new Error('Factura no encontrada');
  const company = invoice.company;
  if (!company) throw new Error('Empresa no encontrada');
  const client = invoice.client;

  function formatDgiiDate(d: Date): string {
    const dd = String(d.getDate()).padStart(2, '0');
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const yyyy = d.getFullYear();
    return `${dd}-${mm}-${yyyy}`;
  }

  const todayStr = formatDgiiDate(new Date());
  const hasTax = Number(invoice.tax_amount) > 0;

  const securityCode = generateRandomAlphaNumeric(6);

  const rfcePayload = {
    RFCE: {
      Encabezado: {
        Version: '1.0',
        IdDoc: {
          TipoeCF: 32,
          eNCF: encfNumber,
          TipoIngresos: '01',
          TipoPago: 1,
          TablaFormasPago: {
            FormaDePago: {
              FormaPago: 1,
              MontoPago: Number(invoice.total_amount),
            },
          },
        },
        Emisor: {
          RNCEmisor: rncEmisor.replace(/-/g, ''),
          RazonSocialEmisor: company.name.substring(0, 80),
          FechaEmision: todayStr,
        },
        Comprador: {
          RNCComprador: rncComprador.replace(/-/g, ''),
          RazonSocialComprador: (client.name || 'CLIENTE FINAL').substring(0, 80),
        },
        Totales: {
          ...(hasTax
            ? {
              MontoGravadoTotal: Number(invoice.subtotal),
              MontoGravadoI1: Number(invoice.subtotal),
              TotalITBIS: Number(invoice.tax_amount),
              TotalITBIS1: Number(invoice.tax_amount),
            }
            : {
              MontoExento: Number(invoice.total_amount),
            }),
          MontoTotal: Number(invoice.total_amount),
          MontoNoFacturable: 0,
          MontoPeriodo: Number(invoice.total_amount),
        },
        CodigoSeguridadeCF: securityCode,
      },
    },
  };

  const transformer = new Transformer();
  const xml = transformer.json2xml(rfcePayload);

  console.log('=== GENERATED RFCE XML (before sign) ===');
  console.log(xml);

  const certs = await loadCertificate(companyId);
  const signature = new Signature(certs.key, certs.cert);
  const signedXml = signature.signXml(xml, 'RFCE');
  console.log('=== SIGNED RFCE XML (first 500 chars) ===');
  console.log(signedXml.substring(0, 500));

  const ecf = await authenticate(companyId, environment);
  const fileName = `${rncEmisor}${encfNumber}.xml`;

  const response: any = await ecf.sendSummary(signedXml, fileName);
  console.log('=== RFCE SEND SUMMARY RESPONSE ===');
  console.log(JSON.stringify(response, null, 2));

  return {
    trackId: response?.trackId || `rfce-${encfNumber}`,
    signedXml,
    securityCode,
    firmaFecha: todayStr,
    estado: response?.estado || '',
    codigo: String(response?.codigo || ''),
    mensajes: response?.mensajes || [],
    secuenciaUtilizada: response?.secuenciaUtilizada || false,
  };
}

export async function checkStatus(trackId: string, companyId: number, environment?: string): Promise<any> {
  const company = await prisma.company.findUnique({ where: { id: companyId } });
  const env = getEnv(environment || company?.dgii_environment || 'Test');
  const certs = await loadCertificate(companyId);
  const ecf = new ECF(certs, env);
  const token = await ecf.authenticate();
  return ecf.statusTrackId(trackId);
}

export async function getCustomerDirectory(rnc: string, companyId: number, environment?: string): Promise<any> {
  const company = await prisma.company.findUnique({ where: { id: companyId } });
  const env = getEnv(environment || company?.dgii_environment || 'Test');
  const certs = await loadCertificate(companyId);
  const ecf = new ECF(certs, env);
  await ecf.authenticate();
  return ecf.getCustomerDirectory(rnc);
}

export async function voidEncf(
  companyId: number,
  rnc: string,
  encf: string,
  desde: number,
  hasta: number,
  environment?: string,
): Promise<any> {
  const company = await prisma.company.findUnique({ where: { id: companyId } });
  const env = getEnv(environment || company?.dgii_environment || 'Test');
  const ecf = await authenticate(companyId, environment);

  const voidPayload = {
    SolicitudAnulacion: {
      RNCEmisor: rnc,
      eNCF: encf,
      FechaHoraAnulacion: new Date().toISOString(),
      Rango: {
        Desde: desde,
        Hasta: hasta,
        Motivo: 'Anulación de rango no utilizado',
      },
    },
  };

  const transformer = new Transformer();
  const xml = transformer.json2xml(voidPayload);

  const certs = await loadCertificate(companyId);
  const signature = new Signature(certs.key, certs.cert);
  const signedXml = signature.signXml(xml);

  const fileName = `${rnc}${encf}_void.xml`;

  return ecf.voidENCF(signedXml, fileName);
}

export function generateQR(
  ecfType: number,
  rncEmisor: string,
  rncComprador: string,
  encf: string,
  montoTotal: number,
  fechaEmision: string,
  fechaFirma: string,
  securityCode: string,
  environment: string,
): string {
  const env = getEnv(environment);

  if (ecfType === 32) {
    return generateFcQRCodeURL(
      rncEmisor.replace(/-/g, ''),
      encf,
      montoTotal,
      securityCode,
      env,
    );
  }

  return generateEcfQRCodeURL(
    rncEmisor.replace(/-/g, ''),
    rncComprador ? rncComprador.replace(/-/g, '') : '',
    encf,
    montoTotal.toFixed(2),
    fechaEmision,
    fechaFirma,
    securityCode,
    env,
  );
}

export async function authenticateOnly(companyId: number, environment?: string): Promise<{ success: boolean; message: string; token?: string }> {
  try {
    const company = await prisma.company.findUnique({ where: { id: companyId } });
    if (!company) return { success: false, message: 'Empresa no encontrada' };
    if (!company.certificate_content || !company.certificate_password) {
      return { success: false, message: 'Certificado no configurado. Suba un certificado .p12 primero.' };
    }
    const env = getEnv(environment || company?.dgii_environment || 'Test');
    const reader = new P12Reader(company.certificate_password);
    const certs = reader.getKeyFromStringBase64(company.certificate_content);
    if (!certs.key || !certs.cert) {
      return { success: false, message: 'No se pudieron extraer clave y certificado del .p12' };
    }
    const ecf = new ECF({ key: certs.key, cert: certs.cert }, env);
    const tokenData = await ecf.authenticate();
    if (tokenData?.token) {
      return { success: true, message: 'Autenticación DGII exitosa', token: tokenData.token };
    }
    return { success: false, message: 'DGII no retornó un token de acceso' };
  } catch (error: any) {
    return { success: false, message: `Error de autenticación DGII: ${error.message}` };
  }
}
