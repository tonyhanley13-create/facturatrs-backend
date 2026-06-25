import prisma from '../models/db';

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
  1: 'Registrado (Postulación)',
  2: 'Pruebas de Datos e-CF',
  3: 'Pruebas de Datos Aprobaciones',
  4: 'Pruebas de Simulación e-CF',
  5: 'Pruebas de Simulación PDF',
  6: 'Validación Representación Impresa',
  7: 'URL Servicio de Prueba',
  8: 'Pruebas de Comunicación',
  9: 'Recepción de e-CF',
  10: 'Inicio Pruebas Aprobaciones Comerciales',
  11: 'Recepción de Aprobaciones Comerciales',
  12: 'URL Servicios Producción',
  13: 'Declaración Jurada',
  14: 'Verificación Estatus Contribuyente',
  15: 'Certificación Completada',
};

export function getStepLabel(paso: number): string {
  return STEP_LABELS[paso] || `Paso ${paso}`;
}

export function getStepDescription(paso: number): string {
  const descriptions: Record<number, string> = {
    0: 'Inicie el proceso de certificación completando el formulario de postulación.',
    1: 'Complete el formulario con los datos del software, URLs de servicio y datos del proveedor si aplica. Genere y firme el XML de postulación.',
    2: 'Descargue el set de datos de prueba de DGII, genere los XML de e-CF y remítalos al servicio de recepción de Impuestos Internos.',
    3: 'Descargue el set de Aprobaciones o Rechazos Comerciales, genere los XML y remítalos a DGII para validación.',
    4: 'Genere facturas a partir de datos representativos de su operatividad real y remítalas al servicio de recepción de DGII.',
    5: 'Envíe la representación impresa (PDF) de los e-CF remitidos en la actividad anterior para verificar formato.',
    6: 'Espere la validación de la representación impresa por parte de DGII.',
    7: 'Actualice las URLs de los servicios de recepción, aprobación comercial y autenticación si hubo cambios durante el proceso.',
    8: 'Valide los certificados digitales descargando el certificado raíz. Indique que está listo para la recepción de e-CF.',
    9: 'Reciba comprobantes generados y enviados por Impuestos Internos, retornando los acuses de recibo.',
    10: 'Indique que está listo para la recepción de Aprobaciones Comerciales.',
    11: 'Reciba las Aprobaciones o Rechazos Comerciales generados por Impuestos Internos.',
    12: 'Complete las URLs de los servicios de Autenticación, Recepción y Aprobación Comercial para ambiente productivo.',
    13: 'Complete y firme la Declaración Jurada electrónica con carácter legal.',
    14: 'Revise el estado del RNC: obligaciones al día, OFV, NCF autorizados, representante registrado.',
    15: '¡Felicidades! La certificación ha sido completada exitosamente.',
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

export async function startCertification(company_id: number, data: PostulationData) {
  const company = await prisma.company.findUnique({ where: { id: company_id } });
  if (!company) throw new Error('Empresa no encontrada');
  if (!company.certificate_content) throw new Error('Debe configurar el certificado digital DGII antes de iniciar la certificación');

  const postulationXml = generatePostulationXml(company, data);

  const progress = await prisma.certificationProgress.upsert({
    where: { company_id },
    create: {
      company_id,
      status: 'in_progress',
      current_step: 1,
      software_name: data.software_name,
      software_version: data.software_version,
      software_type: data.software_type,
      provider_name: data.provider_name,
      provider_contact: data.provider_contact,
      url_recepcion: data.url_recepcion,
      url_aprobacion: data.url_aprobacion,
      url_autenticacion: data.url_autenticacion,
      postulation_xml: postulationXml,
      started_at: new Date(),
    },
    update: {
      status: 'in_progress',
      current_step: 1,
      software_name: data.software_name,
      software_version: data.software_version,
      software_type: data.software_type,
      provider_name: data.provider_name,
      provider_contact: data.provider_contact,
      url_recepcion: data.url_recepcion,
      url_aprobacion: data.url_aprobacion,
      url_autenticacion: data.url_autenticacion,
      postulation_xml: postulationXml,
      started_at: new Date(),
    },
  });

  return progress;
}

export async function updateStep(company_id: number, step: number, stepData: Record<string, any>) {
  const progress = await prisma.certificationProgress.findUnique({ where: { company_id } });
  if (!progress) throw new Error('Certificación no iniciada');

  const updateData: Record<string, any> = { current_step: step };

  switch (step) {
    case 1:
      updateData.postulation_signed_xml = stepData.signed_xml;
      break;
    case 2:
      updateData.test_data_sent = true;
      updateData.test_data_approved = stepData.approved ?? false;
      break;
    case 3:
      updateData.test_data_approved = stepData.approved ?? false;
      break;
    case 4:
      updateData.simulation_sent = true;
      updateData.simulation_approved = stepData.approved ?? false;
      break;
    case 5:
      updateData.pdf_sent = true;
      break;
    case 6:
      updateData.pdf_approved = stepData.approved ?? false;
      break;
    case 7:
      if (stepData.url_recepcion) updateData.url_recepcion = stepData.url_recepcion;
      if (stepData.url_aprobacion) updateData.url_aprobacion = stepData.url_aprobacion;
      if (stepData.url_autenticacion) updateData.url_autenticacion = stepData.url_autenticacion;
      break;
    case 8:
      updateData.communication_ready = stepData.ready ?? false;
      updateData.communication_passed = stepData.passed ?? false;
      break;
    case 9:
      // Reception tests - mark as completed when user confirms they received
      break;
    case 10:
      // Ready for commercial approvals
      break;
    case 11:
      // Commercial approvals received
      break;
    case 12:
      if (stepData.url_recepcion_prod) updateData.url_recepcion_prod = stepData.url_recepcion_prod;
      if (stepData.url_aprobacion_prod) updateData.url_aprobacion_prod = stepData.url_aprobacion_prod;
      if (stepData.url_autenticacion_prod) updateData.url_autenticacion_prod = stepData.url_autenticacion_prod;
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

  await prisma.certificationProgress.update({
    where: { company_id },
    data: { declaration_xml: declarationXml },
  });

  return declarationXml;
}

function generatePostulationXml(company: any, data: PostulationData): string {
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
      software_name: progress.software_name,
      software_version: progress.software_version,
      software_type: progress.software_type,
      postulation_xml_ready: !!progress.postulation_xml,
      postulation_signed: !!progress.postulation_signed_xml,
      test_data_approved: progress.test_data_approved,
      simulation_approved: progress.simulation_approved,
      pdf_approved: progress.pdf_approved,
      communication_passed: progress.communication_passed,
      declaration_submitted: progress.declaration_submitted,
      rnc_verified: progress.rnc_verified,
      started_at: progress.started_at,
      completed_at: progress.completed_at,
      cancel_reason: progress.cancel_reason,
    },
  };
}
