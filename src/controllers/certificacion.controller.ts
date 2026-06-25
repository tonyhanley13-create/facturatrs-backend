import { Response } from 'express';
import { AuthRequest } from '../middlewares/auth';
import prisma from '../models/db';
import * as certService from '../services/certificacion.service';

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
    const progress = await certService.startCertification(req.user.company_id, {
      software_name, software_version, software_type,
      provider_name, provider_contact,
      url_recepcion, url_aprobacion, url_autenticacion,
    });
    return res.status(200).json({
      success: true,
      message: 'Certificación iniciada exitosamente',
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
      return res.status(400).json({ detail: 'XML de postulación no generado. Inicie la certificación primero.' });
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
  const { signed_xml } = req.body;
  if (!signed_xml) return res.status(400).json({ detail: 'XML firmado de postulación es requerido' });
  try {
    await certService.updateStep(req.user.company_id, 1, { signed_xml });
    return res.status(200).json({ success: true, message: 'Postulación firmada enviada' });
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
      rnc_registered: true,
      has_certificate: !!company.certificate_content,
      certificate_valid: company.certificate_expiry ? company.certificate_expiry > new Date() : false,
      has_rnc: !!company.rnc,
      environment_configured: !!company.dgii_environment,
    };

    const allPassed = Object.values(checks).every(Boolean);
    const warnings: string[] = [];
    if (!checks.has_certificate) warnings.push('Certificado digital no configurado');
    if (!checks.certificate_valid) warnings.push('Certificado digital vencido');
    if (!checks.environment_configured) warnings.push('Ambiente DGII no configurado');

    if (allPassed) {
      await certService.updateStep(req.user.company_id, 14, { verified: true });
    }

    return res.status(200).json({
      success: allPassed,
      checks,
      warnings,
      message: allPassed ? 'Estado del contribuyente verificado exitosamente' : 'Hay problemas que deben corregirse',
    });
  } catch (error: any) {
    return res.status(400).json({ detail: error.message });
  }
}

export async function completeCertification(req: AuthRequest, res: Response) {
  if (!req.user) return res.status(401).json({ detail: 'No autorizado' });
  try {
    const progress = await certService.updateStep(req.user.company_id, 15, {});
    return res.status(200).json({ success: true, message: 'Certificación completada exitosamente', data: progress });
  } catch (error: any) {
    return res.status(400).json({ detail: error.message });
  }
}
