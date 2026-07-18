import { ECF, P12Reader, Signature, Transformer, ENVIRONMENT, ReceivedStatus, NoReceivedCode, SenderReceiver } from 'dgii-ecf';
import prisma from '../models/db';
import { loadCertificate } from './dgii.service';

function getEnv(env: string): ENVIRONMENT {
  switch (env) {
    case 'Production': return ENVIRONMENT.PROD;
    case 'Certification': return ENVIRONMENT.CERT;
    default: return ENVIRONMENT.DEV;
  }
}

export async function receiveEcf(
  xml: string,
  rncComprador: string,
): Promise<{ xmlResponse: string; status: string; receivedId?: number }> {
  const senderReceiver = new SenderReceiver();
  const cleanRncComprador = rncComprador.replace(/-/g, '');

  // 1. Buscar la empresa
  const company = await prisma.company.findFirst({
    where: { rnc: cleanRncComprador },
  });

  if (!company) {
    // Si no existe la empresa, no tenemos certificado para firmar.
    // Generamos acuse de recibo no firmado con error "RNC Comprador no corresponde"
    const unsignedXml = senderReceiver.getECFDataFromXML(
      xml,
      cleanRncComprador,
      ReceivedStatus['e-CF No Recibido'],
      NoReceivedCode['RNC Comprador no corresponde']
    );
    return {
      xmlResponse: unsignedXml,
      status: ReceivedStatus['e-CF No Recibido'],
    };
  }

  // 2. Intentar cargar el certificado para poder firmar
  let signature: Signature | null = null;
  try {
    const certs = await loadCertificate(company.id);
    signature = new Signature(certs.key, certs.cert);
  } catch (err) {
    console.error('No se pudo cargar el certificado de la empresa receptora:', err);
  }

  // 3. Crear el registro en base de datos
  let received;
  try {
    received = await prisma.receivedEcf.create({
      data: {
        company_id: company.id,
        encf: '',
        rnc_emisor: '',
        rnc_comprador: cleanRncComprador,
        monto_total: 0,
        xml_signed: xml,
        status: 'received',
      },
    });
  } catch (dbErr: any) {
    const unsignedXml = senderReceiver.getECFDataFromXML(
      xml,
      cleanRncComprador,
      ReceivedStatus['e-CF No Recibido'],
      NoReceivedCode['Error de especificación']
    );
    const signedXml = signature ? signature.signXml(unsignedXml, 'ARECF') : unsignedXml;
    return {
      xmlResponse: signedXml,
      status: ReceivedStatus['e-CF No Recibido'],
    };
  }

  // 4. Extraer datos e intentar parsear
  let encf = '';
  let rncEmisor = '';
  let monto = 0;
  let parseError = false;

  try {
    const extractMatch = (tag: string) => {
      const m = xml.match(new RegExp(`<${tag}>([^<]+)</${tag}>`));
      return m ? m[1].trim() : '';
    };

    encf = extractMatch('eNCF') || extractMatch('ENCF');
    rncEmisor = extractMatch('RNCEmisor');
    const montoStr = extractMatch('MontoTotal');
    monto = parseFloat(montoStr) || 0;

    if (!encf || !rncEmisor) {
      parseError = true;
    } else {
      await prisma.receivedEcf.update({
        where: { id: received.id },
        data: {
          encf,
          rnc_emisor: rncEmisor.replace(/-/g, ''),
          monto_total: monto,
        },
      });
    }
  } catch (_) {
    parseError = true;
  }

  if (parseError) {
    const unsignedXml = senderReceiver.getECFDataFromXML(
      xml,
      cleanRncComprador,
      ReceivedStatus['e-CF No Recibido'],
      NoReceivedCode['Error de especificación']
    );
    const signedXml = signature ? signature.signXml(unsignedXml, 'ARECF') : unsignedXml;
    return {
      xmlResponse: signedXml,
      status: ReceivedStatus['e-CF No Recibido'],
      receivedId: received.id,
    };
  }

  // 5. Todo bien -> Retornar acuse recibido
  const unsignedXml = senderReceiver.getECFDataFromXML(
    xml,
    cleanRncComprador,
    ReceivedStatus['e-CF Recibido']
  );
  const signedXml = signature ? signature.signXml(unsignedXml, 'ARECF') : unsignedXml;

  // Guardar la respuesta original enviada
  await prisma.receivedEcf.update({
    where: { id: received.id },
    data: { raw_response: signedXml },
  });

  return {
    xmlResponse: signedXml,
    status: ReceivedStatus['e-CF Recibido'],
    receivedId: received.id,
  };
}

export async function approveReception(
  receivedId: number,
  companyId: number,
  approved: boolean,
): Promise<{ success: boolean; message: string }> {
  const received = await prisma.receivedEcf.findFirst({
    where: { id: receivedId, company_id: companyId },
  });

  if (!received) {
    return { success: false, message: 'Documento no encontrado' };
  }

  await prisma.receivedEcf.update({
    where: { id: receivedId },
    data: { approval: approved ? 'approved' : 'rejected' },
  });

  return { success: true, message: approved ? 'Aprobado comercialmente' : 'Rechazado' };
}

export async function listReceived(companyId: number) {
  return prisma.receivedEcf.findMany({
    where: { company_id: companyId },
    orderBy: { created_at: 'desc' },
    take: 50,
  });
}
