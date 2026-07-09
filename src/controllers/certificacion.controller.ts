import { Response } from 'express';
import { AuthRequest } from '../middlewares/auth';
import prisma from '../models/db';
import * as certService from '../services/certificacion.service';
import * as dgiiService from '../services/dgii.service';
import { getNextNcfNumber } from '../services/ncf.service';
import { generateInvoiceNumber } from './commercial.controller';

export async function getStatus(req: AuthRequest, res: Response) {
  if (!req.user) return res.status(401).json({ detail: 'No autorizado' });
  try {
    const data = await certService.getCompanyStatus(req.user.company_id);
    return res.status(200).json(data);
  } catch (error: any) {
    return res.status(500).json({ detail: error.message });
  }
}

export async function startCertification(req: AuthRequest, res: Response) {
  if (!req.user) return res.status(401).json({ detail: 'No autorizado' });
  try {
    const progress = await certService.startCertification(req.user.company_id);
    return res.status(200).json({
      success: true,
      message: 'Certificación iniciada. Complete la verificación de pre-requisitos.',
      data: progress,
    });
  } catch (error: any) {
    return res.status(400).json({ detail: error.message });
  }
}

export async function updateStep(req: AuthRequest, res: Response) {
  if (!req.user) return res.status(401).json({ detail: 'No autorizado' });
  const step = parseInt(req.params.step, 10);
  if (isNaN(step) || step < 1 || step > 15) {
    return res.status(400).json({ detail: 'Paso inválido. Debe ser entre 1 y 15' });
  }
  try {
    const progress = await certService.updateStep(req.user.company_id, step, req.body);
    return res.status(200).json({
      success: true,
      message: `Paso ${step} actualizado`,
      data: progress,
    });
  } catch (error: any) {
    return res.status(400).json({ detail: error.message });
  }
}

export async function cancelCertification(req: AuthRequest, res: Response) {
  if (!req.user) return res.status(401).json({ detail: 'No autorizado' });
  const { reason } = req.body;
  if (!reason) return res.status(400).json({ detail: 'Motivo de cancelación es requerido' });
  try {
    await certService.cancelCertification(req.user.company_id, reason);
    return res.status(200).json({ success: true, message: 'Certificación cancelada' });
  } catch (error: any) {
    return res.status(400).json({ detail: error.message });
  }
}

export async function generateDeclaration(req: AuthRequest, res: Response) {
  if (!req.user) return res.status(401).json({ detail: 'No autorizado' });
  try {
    const xml = await certService.generateDeclarationXml(req.user.company_id);
    return res.status(200).json({ success: true, data: { declaration_xml: xml } });
  } catch (error: any) {
    return res.status(400).json({ detail: error.message });
  }
}

export async function submitDeclaration(req: AuthRequest, res: Response) {
  if (!req.user) return res.status(401).json({ detail: 'No autorizado' });
  const { signed_xml } = req.body;
  if (!signed_xml) return res.status(400).json({ detail: 'XML firmado de Declaración Jurada es requerido' });
  try {
    const progress = await certService.updateStep(req.user.company_id, 13, {
      signed_xml,
      submitted: true,
    });
    return res.status(200).json({ success: true, message: 'Declaración Jurada enviada', data: progress });
  } catch (error: any) {
    return res.status(400).json({ detail: error.message });
  }
}

export async function getPostulationXml(req: AuthRequest, res: Response) {
  if (!req.user) return res.status(401).json({ detail: 'No autorizado' });
  try {
    const progress = await certService.getOrCreateProgress(req.user.company_id);
    if (!progress.postulation_xml) {
      return res.status(400).json({ detail: 'XML de postulación no generado. Complete el paso 12 primero.' });
    }
    return res.status(200).json({
      success: true,
      data: {
        postulation_xml: progress.postulation_xml,
        signed: !!progress.postulation_signed_xml,
      },
    });
  } catch (error: any) {
    return res.status(400).json({ detail: error.message });
  }
}

export async function submitPostulationSigned(req: AuthRequest, res: Response) {
  if (!req.user) return res.status(401).json({ detail: 'No autorizado' });
  const { signed_xml, software_name, software_version, software_type, provider_name, provider_contact } = req.body;
  if (!signed_xml) return res.status(400).json({ detail: 'XML firmado de postulación es requerido' });
  try {
    await certService.updateStep(req.user.company_id, 12, {
      signed_xml,
      software_name,
      software_version,
      software_type,
      provider_name,
      provider_contact,
    });
    return res.status(200).json({ success: true, message: 'Postulación firmada enviada' });
  } catch (error: any) {
    return res.status(400).json({ detail: error.message });
  }
}

export async function generatePostulationXml(req: AuthRequest, res: Response) {
  if (!req.user) return res.status(401).json({ detail: 'No autorizado' });
  const {
    software_name, software_version, software_type,
    provider_name, provider_contact,
    url_recepcion, url_aprobacion, url_autenticacion,
  } = req.body;

  if (!software_name || !software_version || !software_type || !url_recepcion || !url_aprobacion) {
    return res.status(400).json({
      detail: 'Campos requeridos: software_name, software_version, software_type, url_recepcion, url_aprobacion',
    });
  }

  try {
    const result = await certService.createAndSignPostulationXml(req.user.company_id, {
      software_name,
      software_version,
      software_type,
      provider_name,
      provider_contact,
      url_recepcion,
      url_aprobacion,
      url_autenticacion,
    });

    return res.status(200).json({ success: true, data: result });
  } catch (error: any) {
    return res.status(400).json({ detail: error.message });
  }
}

export async function verifyRnc(req: AuthRequest, res: Response) {
  if (!req.user) return res.status(401).json({ detail: 'No autorizado' });
  try {
    const company = await prisma.company.findUnique({ where: { id: req.user.company_id } });
    if (!company) return res.status(404).json({ detail: 'Empresa no encontrada' });

    const checks: Record<string, boolean> = {
      rnc_registered: !!company.rnc,
      has_certificate: !!company.certificate_content,
      certificate_valid: company.certificate_expiry ? company.certificate_expiry > new Date() : false,
      environment_configured: !!company.dgii_environment,
      fiscal_provider_configured: company.fiscal_provider === 'dgii',
      ncf_ranges_configured: !!company.ncf_ranges,
    };

    const allPassed = Object.values(checks).every(Boolean);
    const warnings: string[] = [];
    if (!checks.has_certificate) warnings.push('Certificado digital no configurado');
    if (!checks.certificate_valid) warnings.push('Certificado digital vencido');
    if (!checks.environment_configured) warnings.push('Ambiente DGII no configurado');
    if (!checks.ncf_ranges_configured) warnings.push('Rangos NCF/e-NCF no configurados');
    if (!checks.fiscal_provider_configured) warnings.push('Proveedor fiscal debe estar configurado como "dgii" para integración directa');

    if (allPassed) {
      await certService.updateStep(req.user.company_id, 14, { verified: true });
    }

    return res.status(200).json({
      success: allPassed,
      checks,
      warnings,
      message: allPassed
        ? 'Estado del contribuyente verificado exitosamente'
        : 'Hay problemas que deben corregirse',
    });
  } catch (error: any) {
    return res.status(400).json({ detail: error.message });
  }
}

export async function completeCertification(req: AuthRequest, res: Response) {
  if (!req.user) return res.status(401).json({ detail: 'No autorizado' });
  const { url_recepcion_prod, url_aprobacion_prod, url_autenticacion_prod } = req.body;
  try {
    const progress = await certService.updateStep(req.user.company_id, 15, {
      url_recepcion_prod,
      url_aprobacion_prod,
      url_autenticacion_prod,
    });
    return res.status(200).json({ success: true, message: 'Certificación completada exitosamente', data: progress });
  } catch (error: any) {
    return res.status(400).json({ detail: error.message });
  }
}

export async function verifyPrerequisites(req: AuthRequest, res: Response) {
  if (!req.user) return res.status(401).json({ detail: 'No autorizado' });
  try {
    const company = await prisma.company.findUnique({ where: { id: req.user.company_id } });
    if (!company) return res.status(404).json({ detail: 'Empresa no encontrada' });

    const checks: Record<string, boolean> = {
      rnc_activo: !!company.rnc,
      certificado_digital: !!company.certificate_content,
      certificado_vigente: company.certificate_expiry ? company.certificate_expiry > new Date() : false,
      ambiente_dgii_configurado: !!company.dgii_environment,
      rangos_ncf_configurados: !!company.ncf_ranges,
      proveedor_fiscal_configurado: company.fiscal_provider === 'dgii',
    };

    const allPassed = Object.values(checks).every(Boolean);
    const warnings: string[] = [];
    if (!checks.certificado_digital) warnings.push('Certificado digital no configurado');
    if (!checks.certificado_vigente) warnings.push('Certificado digital vencido');
    if (!checks.ambiente_dgii_configurado) warnings.push('Ambiente DGII no configurado');
    if (!checks.rangos_ncf_configurados) warnings.push('Rangos NCF/e-NCF no configurados');
    if (!checks.proveedor_fiscal_configurado) warnings.push('Proveedor fiscal debe estar configurado como "dgii" para integración directa');

    if (allPassed) {
      await certService.updateStep(req.user.company_id, 1, { verified: true });
    }

    return res.status(200).json({
      success: allPassed,
      checks,
      warnings,
      message: allPassed
        ? 'Todos los pre-requisitos cumplidos'
        : 'Hay pre-requisitos pendientes que deben corregirse',
    });
  } catch (error: any) {
    return res.status(400).json({ detail: error.message });
  }
}

export async function transmitTestEcfs(req: AuthRequest, res: Response) {
  if (!req.user) return res.status(401).json({ detail: 'No autorizado' });
  const { count, force_mock } = req.body;
  const targetCount = parseInt(count, 10) || 25;
  const companyId = req.user.company_id;

  try {
    const company = await prisma.company.findUnique({ where: { id: companyId } });
    if (!company) return res.status(404).json({ detail: 'Empresa no encontrada' });

    let client = await prisma.client.findFirst({
      where: { company_id: companyId },
    });
    if (!client) {
      client = await prisma.client.create({
        data: {
          user_id: req.user.id,
          company_id: companyId,
          name: 'Cliente de Prueba DGII',
          rnc: '101010101',
          email: 'prueba@dgii.com',
          created_at: new Date(),
        },
      });
    }

    const canAttemptReal = !force_mock && !!company.certificate_content && !!company.certificate_password;
    const results: any[] = [];
    let successCount = 0;

    for (let i = 0; i < targetCount; i++) {
      const invoiceNumber = await generateInvoiceNumber(req.user.id, companyId);
      const invoice = await prisma.invoice.create({
        data: {
          company_id: companyId,
          client_id: client.id,
          user_id: req.user.id,
          invoice_number: invoiceNumber,
          description: `Factura de Prueba Certificación DGII #${i + 1}`,
          amount: 100.00,
          subtotal: 100.00,
          tax_amount: 18.00,
          discount_amount: 0.00,
          total_amount: 118.00,
          status: 'draft',
          payment_status: 'pending',
          payment_method: '01',
          document_type: 'E31',
          created_at: new Date(),
        },
      });

      if (canAttemptReal) {
        try {
          const encfNumber = await getNextNcfNumber(companyId, 'E31');
          const txResult = await dgiiService.sendInvoice(
            companyId,
            invoice.id,
            encfNumber,
            company.rnc,
            client.rnc,
            118.00,
            company.dgii_environment || 'Test',
            'E31',
          );
          
          await prisma.invoice.update({
            where: { id: invoice.id },
            data: {
              ncf: encfNumber,
              status: 'sent',
              dgii_track_id: txResult.trackId,
              dgii_signed_xml: txResult.signedXml,
              dgii_security_code: txResult.securityCode,
              created_at: new Date(),
            },
          });
          results.push({ index: i + 1, id: invoice.id, status: 'sent', trackId: txResult.trackId });
          successCount++;
        } catch (e: any) {
          console.warn(`Error transmitiendo factura de prueba #${i + 1}:`, e.message);
          await prisma.invoice.update({
            where: { id: invoice.id },
            data: {
              status: 'error',
              ncf: `E31${String(i + 1).padStart(8, '0')}`,
              dgii_error: e.message,
            },
          });
          results.push({ index: i + 1, id: invoice.id, status: 'error', error: e.message });
        }
      } else {
        const mockNcf = `E31${String(i + 1).padStart(8, '0')}`;
        await prisma.invoice.update({
          where: { id: invoice.id },
          data: {
            ncf: mockNcf,
            status: 'sent',
            dgii_track_id: `mock-track-${mockNcf}`,
            created_at: new Date(),
          },
        });
        results.push({ index: i + 1, id: invoice.id, status: 'mock_sent', ncf: mockNcf });
        successCount++;
      }
    }

    const isApproved = successCount === targetCount;
    await certService.updateStep(companyId, 5, {
      approved: isApproved,
      ecf_count: targetCount,
    });

    return res.status(200).json({
      success: true,
      message: `Simulación finalizada. ${successCount} de ${targetCount} facturas procesadas con éxito.`,
      mode: canAttemptReal ? 'real' : 'mock',
      results,
    });
  } catch (error: any) {
    return res.status(500).json({ detail: error.message });
  }
}
