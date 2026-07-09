import prisma from '../models/db';
import { loadCertificate } from './dgii.service';
import { Signature } from 'dgii-ecf';

export interface PostulationData {
  software_name: string;
  software_version: string;
  software_type: string;
  provider_name?: string;
  provider_contact?: string;
  url_recepcion: string;
  url_aprobacion: string;
  url_autenticacion?: string;
}

export interface StepUpdate {
  paso: number;
  data: Record<string, any>;
}

const STEP_LABELS: Record<number, string> = {
  0: 'Sin iniciar',
  1: 'Verificación de Pre-requisitos',
  2: 'Solicitud FI-GDF-016',
  3: 'Set de Pruebas - Datos e-CF',
  4: 'Set de Pruebas - Aprobaciones Comerciales',
  5: 'Set de Pruebas - Simulación e-CF (mín. 25)',
  6: 'Representación Impresa (PDF)',
  7: 'Validación de Representación Impresa',
  8: 'URLs Servicio de Prueba',
  9: 'Pruebas de Comunicación',
  10: 'Recepción de e-CF',
  11: 'Aprobaciones Comerciales',
  12: 'Postulación (Crear Postulación)',
  13: 'Declaración Jurada',
  14: 'Verificación Final del Contribuyente',
  15: 'Certificación y Producción',
};

export function getStepLabel(paso: number): string {
  return STEP_LABELS[paso] || `Paso ${paso}`;
}

export function getStepDescription(paso: number): string {
  const descriptions: Record<number, string> = {
    0: 'Inicie el proceso de certificación verificando los pre-requisitos exigidos por la DGII.',
    1: 'Confirme que la empresa cumple: RNC activo, sin deudas tributarias, clave OFV, certificado digital vigente, autorización NCF, sistema tecnológico listo.',
    2: 'Complete y envíe el Formulario de Solicitud de Autorización FI-GDF-016 a través de la Oficina Virtual (OFV) de la DGII. Recibirá usuario y clave del portal de FE.',
    3: 'Descargue el set de datos de prueba del portal de certificación DGII, genere los XML de e-CF y remítalos al servicio de recepción de Impuestos Internos.',
    4: 'Descargue el set de Aprobaciones o Rechazos Comerciales, genere los XML y remítalos a DGII para validación.',
    5: 'Genere al menos 25 facturas electrónicas de prueba (crédito fiscal, consumidor final, notas crédito) a partir de datos representativos de su operatividad real y remítalas al servicio de recepción de DGII.',
    6: 'Envíe la representación impresa (PDF) de los e-CF remitidos en las pruebas. El PDF debe cumplir con las especificaciones de la Norma General 06-2018.',
    7: 'Espere la validación de la representación impresa por parte de DGII. Si es rechazada, corrija las observaciones y reenvíe.',
    8: 'Configure las URLs de los servicios de recepción, aprobación comercial y autenticación para el ambiente de pruebas.',
    9: 'Descargue el certificado raíz de DGII, valide los certificados digitales y confirme que está listo para la recepción de e-CF.',
    10: 'Reciba los comprobantes generados y enviados por Impuestos Internos al servicio de recepción, retornando los acuses de recibo correspondientes.',
    11: 'Reciba las Aprobaciones o Rechazos Comerciales generados por Impuestos Internos.',
    12: 'Complete el formulario de postulación con los datos del software (nombre, versión, tipo, proveedor) y URLs de servicios. Genere y firme el XML de postulación.',
    13: 'Complete y firme la Declaración Jurada electrónica con carácter legal, haciendo constar que las pruebas fueron realizadas de manera íntegra, sin acciones fraudulentas.',
    14: 'Revise el estado del RNC: obligaciones al día, clave OFV activa, NCF autorizados, certificado vigente, representante registrado.',
    15: 'Complete las URLs de servicios productivos (recepción, aprobación, autenticación). Confirme la habilitación del menú de facturación electrónica en OFV y solicite los e-NCF para iniciar la emisión en producción.',
  };
  return descriptions[paso] || '';
}

export async function getOrCreateProgress(company_id: number) {
  let progress = await prisma.certificationProgress.findUnique({
    where: { company_id },
  });
  if (!progress) {
    progress = await prisma.certificationProgress.create({
      data: { company_id, status: 'not_started', current_step: 0 },
    });
  }
  return progress;
}

export async function startCertification(company_id: number) {
  const company = await prisma.company.findUnique({ where: { id: company_id } });
  if (!company) throw new Error('Empresa no encontrada');

  const progress = await prisma.certificationProgress.upsert({
    where: { company_id },
    create: {
      company_id,
      status: 'in_progress',
      current_step: 1,
      started_at: new Date(),
    },
    update: {
      status: 'in_progress',
      current_step: 1,
      started_at: new Date(),
      cancel_reason: null,
    },
  });

  return progress;
}

export async function updateStep(company_id: number, step: number, stepData: Record<string, any>) {
  const progress = await prisma.certificationProgress.findUnique({ where: { company_id } });
  if (!progress) throw new Error('Certificación no iniciada');

  const nextStep = step < 15 ? step + 1 : 15;
  const updateData: Record<string, any> = { current_step: nextStep };

  switch (step) {
    case 1:
      updateData.prerequisites_verified = stepData.verified ?? false;
      break;
    case 2:
      updateData.solicitud_completed = stepData.completed ?? false;
      if (stepData.completed) updateData.solicitud_date = new Date();
      break;
    case 3:
      updateData.test_data_sent = true;
      updateData.test_data_approved = stepData.approved ?? false;
      break;
    case 4:
      updateData.test_data_approved = stepData.approved ?? false;
      break;
    case 5:
      updateData.simulation_sent = true;
      updateData.simulation_approved = stepData.approved ?? false;
      if (stepData.ecf_count) updateData.test_ecf_count = stepData.ecf_count;
      break;
    case 6:
      updateData.pdf_sent = true;
      break;
    case 7:
      updateData.pdf_approved = stepData.approved ?? false;
      break;
    case 8:
      if (stepData.url_recepcion) updateData.url_recepcion = stepData.url_recepcion;
      if (stepData.url_aprobacion) updateData.url_aprobacion = stepData.url_aprobacion;
      if (stepData.url_autenticacion) updateData.url_autenticacion = stepData.url_autenticacion;
      break;
    case 9:
      updateData.communication_ready = stepData.ready ?? false;
      updateData.communication_passed = stepData.passed ?? false;
      break;
    case 10:
      break;
    case 11:
      break;
    case 12:
      if (stepData.signed_xml) updateData.postulation_signed_xml = stepData.signed_xml;
      if (stepData.software_name) updateData.software_name = stepData.software_name;
      if (stepData.software_version) updateData.software_version = stepData.software_version;
      if (stepData.software_type) updateData.software_type = stepData.software_type;
      if (stepData.provider_name) updateData.provider_name = stepData.provider_name;
      if (stepData.provider_contact) updateData.provider_contact = stepData.provider_contact;
      break;
    case 13:
      if (stepData.declaration_xml) updateData.declaration_xml = stepData.declaration_xml;
      if (stepData.signed_xml) updateData.declaration_signed_xml = stepData.signed_xml;
      updateData.declaration_submitted = stepData.submitted ?? false;
      break;
    case 14:
      updateData.rnc_verified = stepData.verified ?? false;
      break;
    case 15:
      if (stepData.url_recepcion_prod) updateData.url_recepcion_prod = stepData.url_recepcion_prod;
      if (stepData.url_aprobacion_prod) updateData.url_aprobacion_prod = stepData.url_aprobacion_prod;
      if (stepData.url_autenticacion_prod) updateData.url_autenticacion_prod = stepData.url_autenticacion_prod;
      updateData.status = 'completed';
      updateData.completed_at = new Date();
      break;
  }

  return prisma.certificationProgress.update({
    where: { company_id },
    data: updateData,
  });
}

export async function cancelCertification(company_id: number, reason: string) {
  return prisma.certificationProgress.update({
    where: { company_id },
    data: {
      status: 'cancelled',
      current_step: 0,
      cancel_reason: reason,
    },
  });
}

export async function generateDeclarationXml(company_id: number) {
  const progress = await prisma.certificationProgress.findUnique({ where: { company_id } });
  if (!progress) throw new Error('Certificación no iniciada');

  const company = await prisma.company.findUnique({ where: { id: company_id } });
  if (!company) throw new Error('Empresa no encontrada');

  const declarationXml = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<DeclaracionJurada xmlns="http://dgii.gov.do/ecf/v1">',
    `  <RNC>${company.rnc}</RNC>`,
    `  <RazonSocial>${company.name}</RazonSocial>`,
    `  <Fecha>${new Date().toISOString().split('T')[0]}</Fecha>`,
    `  <Software>${progress.software_name || ''}</Software>`,
    `  <Version>${progress.software_version || ''}</Version>`,
    '  <CertificacionRealizada>true</CertificacionRealizada>',
    '  <SinAccionesFraudulentas>true</SinAccionesFraudulentas>',
    '  <Declaracion>',
    '    Declaro bajo juramento que la certificación fue realizada de manera íntegra,',
    '    sin acciones fraudulentas o irregularidades, cumpliendo con todos los requisitos',
    '    establecidos por Impuestos Internos para la emisión de Comprobantes Fiscales Electrónicos (e-CF).',
    '  </Declaracion>',
    '</DeclaracionJurada>',
  ].join('\n');

  let signedXml: string | null = null;
  let submitted = false;
  try {
    const certs = await loadCertificate(company_id);
    const signature = new Signature(certs.key, certs.cert);
    signedXml = signature.signXml(declarationXml);
    submitted = true;
  } catch (e: any) {
    console.warn('No se pudo firmar automáticamente la Declaración Jurada:', e.message);
  }

  await prisma.certificationProgress.update({
    where: { company_id },
    data: {
      declaration_xml: declarationXml,
      declaration_signed_xml: signedXml,
      declaration_submitted: submitted,
      current_step: submitted ? 14 : progress.current_step,
    },
  });

  return {
    declaration_xml: declarationXml,
    declaration_signed_xml: signedXml,
    submitted,
  };
}

export function generatePostulationXml(company: any, data: PostulationData): string {
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<PostulacionEmisorElectronico xmlns="http://dgii.gov.do/ecf/v1">',
    `  <RNC>${company.rnc}</RNC>`,
    `  <RazonSocial>${company.name}</RazonSocial>`,
    `  <TipoRegistro>Emisor Electronico</TipoRegistro>`,
    `  <TipoSoftware>${data.software_type === 'internal' ? 'Desarrollado internamente' : 'Adquirido a proveedor'}</TipoSoftware>`,
    `  <NombreSoftware>${data.software_name}</NombreSoftware>`,
    `  <VersionSoftware>${data.software_version}</VersionSoftware>`,
    data.provider_name ? `  <Proveedor>${data.provider_name}</Proveedor>` : '',
    data.provider_contact ? `  <ContactoProveedor>${data.provider_contact}</ContactoProveedor>` : '',
    `  <URLRecepcion>${data.url_recepcion}</URLRecepcion>`,
    `  <URAprobacionComercial>${data.url_aprobacion}</URAprobacionComercial>`,
    data.url_autenticacion ? `  <URLAutenticacion>${data.url_autenticacion}</URLAutenticacion>` : '',
    '</PostulacionEmisorElectronico>',
  ].filter(Boolean).join('\n');
}

export async function createAndSignPostulationXml(company_id: number, data: PostulationData) {
  const company = await prisma.company.findUnique({ where: { id: company_id } });
  if (!company) throw new Error('Empresa no encontrada');

  const xml = generatePostulationXml(company, data);

  let signedXml: string | null = null;
  try {
    const certs = await loadCertificate(company_id);
    const signature = new Signature(certs.key, certs.cert);
    signedXml = signature.signXml(xml);
  } catch (e: any) {
    console.warn('No se pudo firmar automáticamente la postulación:', e.message);
  }

  await prisma.certificationProgress.update({
    where: { company_id },
    data: {
      postulation_xml: xml,
      postulation_signed_xml: signedXml,
      software_name: data.software_name,
      software_version: data.software_version,
      software_type: data.software_type,
      provider_name: data.provider_name,
      provider_contact: data.provider_contact,
      url_recepcion: data.url_recepcion,
      url_aprobacion: data.url_aprobacion,
      url_autenticacion: data.url_autenticacion,
    },
  });

  return {
    postulation_xml: xml,
    postulation_signed_xml: signedXml,
    signed: !!signedXml,
  };
}

export async function getCompanyStatus(company_id: number) {
  const company = await prisma.company.findUnique({ where: { id: company_id } });
  if (!company) throw new Error('Empresa no encontrada');

  const progress = await getOrCreateProgress(company_id);

  return {
    company: {
      rnc: company.rnc,
      name: company.name,
      certificate_configured: !!company.certificate_content,
      certificate_expiry: company.certificate_expiry,
      dgii_environment: company.dgii_environment,
      fiscal_provider: company.fiscal_provider,
    },
    certification: {
      id: progress.id,
      current_step: progress.current_step,
      step_label: getStepLabel(progress.current_step),
      step_description: getStepDescription(progress.current_step),
      status: progress.status,
      prerequisites_verified: progress.prerequisites_verified,
      solicitud_completed: progress.solicitud_completed,
      solicitud_date: progress.solicitud_date,
      test_data_sent: progress.test_data_sent,
      test_data_approved: progress.test_data_approved,
      simulation_sent: progress.simulation_sent,
      simulation_approved: progress.simulation_approved,
      test_ecf_count: progress.test_ecf_count,
      pdf_sent: progress.pdf_sent,
      pdf_approved: progress.pdf_approved,
      url_recepcion: progress.url_recepcion,
      url_aprobacion: progress.url_aprobacion,
      url_autenticacion: progress.url_autenticacion,
      communication_ready: progress.communication_ready,
      communication_passed: progress.communication_passed,
      postulation_xml_ready: !!progress.postulation_xml,
      postulation_signed: !!progress.postulation_signed_xml,
      software_name: progress.software_name,
      software_version: progress.software_version,
      software_type: progress.software_type,
      provider_name: progress.provider_name,
      provider_contact: progress.provider_contact,
      declaration_submitted: progress.declaration_submitted,
      rnc_verified: progress.rnc_verified,
      url_recepcion_prod: progress.url_recepcion_prod,
      url_aprobacion_prod: progress.url_aprobacion_prod,
      url_autenticacion_prod: progress.url_autenticacion_prod,
      started_at: progress.started_at,
      completed_at: progress.completed_at,
      cancel_reason: progress.cancel_reason,
    },
  };
}
