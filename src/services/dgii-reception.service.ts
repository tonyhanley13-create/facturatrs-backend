import { ECF, P12Reader, Signature, Transformer, ENVIRONMENT, ReceivedStatus, NoReceivedCode } from 'dgii-ecf';
import prisma from '../models/db';

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
): Promise<{ status: string; code?: string; detail?: string; receivedId?: number }> {
  try {
    // Buscar empresa por RNC del comprador
    const company = await prisma.company.findFirst({
      where: { rnc: rncComprador.replace(/-/g, '') },
    });

    if (!company) {
      return { status: ReceivedStatus['e-CF No Recibido'], code: NoReceivedCode['RNC Comprador no corresponde'], detail: 'RNC comprador no registrado en el sistema' };
    }

    // Guardar el XML recibido
    const received = await prisma.receivedEcf.create({
      data: {
        company_id: company.id,
        encf: '',
        rnc_emisor: '',
        rnc_comprador: rncComprador.replace(/-/g, ''),
        monto_total: 0,
        xml_signed: xml,
        status: 'received',
      },
    });

    // Intentar parsear datos del XML
    try {
      const extractMatch = (tag: string) => {
        const m = xml.match(new RegExp(`<${tag}>([^<]+)</${tag}>`));
        return m ? m[1].trim() : '';
      };

      const encf = extractMatch('eNCF') || extractMatch('ENCF');
      const rncEmisor = extractMatch('RNCEmisor');
      const montoStr = extractMatch('MontoTotal');
      const monto = parseFloat(montoStr) || 0;

      await prisma.receivedEcf.update({
        where: { id: received.id },
        data: {
          encf,
          rnc_emisor: rncEmisor,
          monto_total: monto,
        },
      });
    } catch (_) {
      // Si falla el parseo, al menos guardamos el XML
    }

    return { status: ReceivedStatus['e-CF Recibido'], receivedId: received.id };
  } catch (error: any) {
    return { status: ReceivedStatus['e-CF No Recibido'], code: NoReceivedCode['Error de especificación'], detail: error.message };
  }
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
