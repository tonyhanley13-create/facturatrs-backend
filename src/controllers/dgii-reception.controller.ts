import { Request, Response } from 'express';
import { AuthRequest } from '../middlewares/auth';
import * as receptionService from '../services/dgii-reception.service';

// DGII llama a este endpoint cuando otro emisor nos envía un e-CF
export async function receiveEcf(req: Request, res: Response) {
  try {
    const rncComprador = req.params.rnc || req.query.rnc as string || '';
    const xml = typeof req.body === 'string' ? req.body : req.body?.xml || JSON.stringify(req.body);

    const result = await receptionService.receiveEcf(xml, rncComprador);

    if (result.status === '0') {
      return res.status(200).json({ status: result.status, detalle: 'Recibido' });
    }
    return res.status(400).json({ status: result.status, codigo: result.code, detalle: result.detail });
  } catch (error: any) {
    return res.status(500).json({ status: '1', codigo: '1', detalle: `Error interno: ${error.message}` });
  }
}

// DGII consulta este endpoint para aprobación comercial
export async function commercialApproval(req: Request, res: Response) {
  const { rnc, encf, monto } = req.query;

  // Por ahora, auto-aprobamos todos los documentos recibidos
  // En el futuro se puede integrar con un workflow de aprobación
  return res.status(200).json({
    aprobado: true,
    rnc: rnc || '',
    encf: encf || '',
    monto: monto || '0',
    mensaje: 'Aprobado automáticamente',
  });
}

// Listar e-CF recibidos (autenticado)
export async function listReceived(req: AuthRequest, res: Response) {
  if (!req.user) return res.status(401).json({ detail: 'No autorizado' });
  try {
    const list = await receptionService.listReceived(req.user.company_id);
    return res.status(200).json(list);
  } catch (error: any) {
    return res.status(500).json({ detail: error.message });
  }
}

// Aprobar o rechazar un e-CF recibido
export async function approveDocument(req: AuthRequest, res: Response) {
  if (!req.user) return res.status(401).json({ detail: 'No autorizado' });
  const receivedId = parseInt(req.params.id, 10);
  const { approved } = req.body;
  if (isNaN(receivedId)) return res.status(400).json({ detail: 'ID inválido' });
  try {
    const result = await receptionService.approveReception(receivedId, req.user.company_id, approved);
    return res.status(result.success ? 200 : 404).json(result);
  } catch (error: any) {
    return res.status(500).json({ detail: error.message });
  }
}
