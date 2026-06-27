import { Response } from 'express';
import prisma from '../models/db';
import { AuthRequest } from '../middlewares/auth';
import * as reportService from '../services/dgii-report.service';

function resolveCompanyId(req: AuthRequest): number {
  if (!req.user) return 0;
  const company_id = req.body?.company_id || req.query?.company_id;
  if (req.user.is_super_admin && company_id) return Number(company_id);
  return req.user.company_id;
}

export async function generateReport(req: AuthRequest, res: Response) {
  if (!req.user) return res.status(401).json({ detail: 'No autorizado' });

  const { type, year, month } = req.body;
  if (!type || !year || !month) {
    return res.status(400).json({ detail: 'type (606|607), year y month son requeridos' });
  }
  if (type !== '606' && type !== '607') {
    return res.status(400).json({ detail: 'type debe ser 606 o 607' });
  }

  const companyId = resolveCompanyId(req);
  if (!companyId) return res.status(400).json({ detail: 'company_id es requerido para super admin' });

  try {
    const report = await reportService.regenerateReport(companyId, type, Number(year), Number(month));
    return res.status(200).json(report);
  } catch (error: any) {
    console.error(`❌ Error al generar reporte ${type}:`, error);
    return res.status(500).json({ detail: error.message });
  }
}

export async function getReport(req: AuthRequest, res: Response) {
  if (!req.user) return res.status(401).json({ detail: 'No autorizado' });

  const { type, year, month } = req.params;
  if (!type || !year || !month) {
    return res.status(400).json({ detail: 'type, year y month son requeridos' });
  }

  const companyId = resolveCompanyId(req);
  if (!companyId) return res.status(400).json({ detail: 'company_id es requerido para super admin' });

  try {
    const report = await reportService.getOrCreateReport(companyId, type, Number(year), Number(month));
    return res.status(200).json(report);
  } catch (error: any) {
    console.error(`❌ Error al obtener reporte ${type}:`, error);
    return res.status(500).json({ detail: error.message });
  }
}

export async function downloadReportXml(req: AuthRequest, res: Response) {
  if (!req.user) return res.status(401).json({ detail: 'No autorizado' });

  const { type, year, month } = req.params;

  const companyId = resolveCompanyId(req);
  if (!companyId) return res.status(400).json({ detail: 'company_id es requerido para super admin' });

  try {
    const report = await prisma.dgiiReport.findUnique({
      where: {
        company_id_type_period_year_period_month: {
          company_id: companyId,
          type: type!,
          period_year: Number(year),
          period_month: Number(month),
        },
      },
    });

    if (!report || !report.xml_content) {
      return res.status(404).json({ detail: 'Reporte no encontrado. Genérelo primero.' });
    }

    res.setHeader('Content-Type', 'application/xml');
    res.setHeader('Content-Disposition', `attachment; filename="DGII_${type}_${year}_${month.toString().padStart(2, '0')}.xml"`);
    return res.send(report.xml_content);
  } catch (error: any) {
    return res.status(500).json({ detail: error.message });
  }
}

export async function listReports(req: AuthRequest, res: Response) {
  if (!req.user) return res.status(401).json({ detail: 'No autorizado' });

  const companyId = resolveCompanyId(req);
  if (!companyId) return res.status(400).json({ detail: 'company_id es requerido para super admin' });

  try {
    const reports = await reportService.listReports(companyId);
    return res.status(200).json(reports);
  } catch (error: any) {
    return res.status(500).json({ detail: error.message });
  }
}
