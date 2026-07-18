import { Request, Response } from 'express';
import { AuthRequest } from '../middlewares/auth';
import * as receptionService from '../services/dgii-reception.service';

// DGII llama a este endpoint cuando otro emisor nos envía un e-CF
export async function receiveEcf(req: Request, res: Response) {
  const rncComprador = req.params.rnc || req.query.rnc as string || '';
  try {
    const xml = typeof req.body === 'string' ? req.body : req.body?.xml || JSON.stringify(req.body);

    const result = await receptionService.receiveEcf(xml, rncComprador);

    res.set('Content-Type', 'application/xml');
    const httpStatus = result.status === '0' ? 200 : 400;
    return res.status(httpStatus).send(result.xmlResponse);
  } catch (error: any) {
    console.error('Error en receptor de e-CF:', error);
    res.set('Content-Type', 'application/xml');
    const xmlError = `<?xml version="1.0" encoding="utf-8"?>
<ARECF>
  <DetalleAcusedeRecibo>
    <Version>1.0</Version>
    <RNCEmisor></RNCEmisor>
    <RNCComprador>${rncComprador.replace(/-/g, '')}</RNCComprador>
    <eNCF></eNCF>
    <Estado>1</Estado>
    <CodigoMotivoNoRecibido>1</CodigoMotivoNoRecibido>
    <FechaHoraAcuseRecibo>${new Date().toISOString()}</FechaHoraAcuseRecibo>
  </DetalleAcusedeRecibo>
</ARECF>`;
    return res.status(500).send(xmlError);
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
