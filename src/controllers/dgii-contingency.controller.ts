import { Response } from 'express';
import { AuthRequest } from '../middlewares/auth';
import prisma from '../models/db';
import * as contingencyService from '../services/dgii-contingency.service';
import * as dgiiService from '../services/dgii.service';

export async function sendInvoiceWithContingency(req: AuthRequest, res: Response) {
  if (!req.user) return res.status(401).json({ detail: 'No autorizado' });
  const { invoiceId, encfNumber, rncComprador, montoTotal, referenceNcf, modificationCode } = req.body;
  const companyId = req.user.is_super_admin ? (req.body.company_id || req.user.company_id) : req.user.company_id;
  const company = await prisma.company.findUnique({ where: { id: companyId } });
  if (!company) return res.status(404).json({ detail: 'Empresa no encontrada' });

  try {
    const result = await contingencyService.sendWithContingency(
      companyId, invoiceId, encfNumber, company.rnc.replace(/-/g, ''),
      rncComprador, montoTotal, company.dgii_environment || 'Test',
      undefined, referenceNcf, modificationCode,
    );
    return res.status(result.success ? 200 : 202).json(result);
  } catch (error: any) {
    return res.status(500).json({ detail: error.message });
  }
}

export async function resendContingency(req: AuthRequest, res: Response) {
  if (!req.user) return res.status(401).json({ detail: 'No autorizado' });
  const companyId = req.user.is_super_admin ? (req.body.company_id || req.user.company_id) : req.user.company_id;

  try {
    const result = await contingencyService.resendContingency(companyId);
    return res.status(200).json(result);
  } catch (error: any) {
    return res.status(500).json({ detail: error.message });
  }
}

export async function listContingency(req: AuthRequest, res: Response) {
  if (!req.user) return res.status(401).json({ detail: 'No autorizado' });
  const companyId = req.user.is_super_admin ? (req.query.company_id || req.user.company_id) : req.user.company_id;

  try {
    const list = await contingencyService.listContingency(Number(companyId));
    return res.status(200).json(list);
  } catch (error: any) {
    return res.status(500).json({ detail: error.message });
  }
}
