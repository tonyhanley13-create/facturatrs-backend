import { Response } from 'express';
import prisma from '../models/db';
import { AuthRequest } from '../middlewares/auth';

const NCF_TYPE_MAP: Record<string, string> = {
  'Factura de Crédito Fiscal': '01',
  'Factura de Consumo': '02',
  'Nota de Débito': '03',
  'Nota de Crédito': '04',
  'Comprobante de Compras': '05',
  'Gastos Menores': '06',
  'Regímenes Especiales': '07',
  'Comprobante Gubernamental': '08',
  'Pagos al Exterior': '09',
  'Exportación': '10',
};

export async function listPurchases(req: AuthRequest, res: Response) {
  if (!req.user) return res.status(401).json({ detail: 'No autorizado' });
  try {
    const purchases = await prisma.purchaseRecord.findMany({
      where: { company_id: req.user.company_id },
      orderBy: { fecha: 'desc' },
    });
    return res.status(200).json(purchases);
  } catch (error: any) {
    console.error('Error al listar compras:', error);
    return res.status(500).json({ detail: error.message });
  }
}

export async function createPurchase(req: AuthRequest, res: Response) {
  if (!req.user) return res.status(401).json({ detail: 'No autorizado' });
  const { ncf, rnc_proveedor, nombre_proveedor, fecha, monto_total, itbis, tipo_comprobante } = req.body;
  if (!ncf || !rnc_proveedor || !nombre_proveedor || !fecha || monto_total == null) {
    return res.status(400).json({ detail: 'ncf, rnc_proveedor, nombre_proveedor, fecha y monto_total son requeridos' });
  }
  const tipo = tipo_comprobante || NCF_TYPE_MAP[req.body.tipo_comprobante_label || ''] || '01';
  try {
    const purchase = await prisma.purchaseRecord.create({
      data: {
        company_id: req.user.company_id,
        ncf,
        rnc_proveedor,
        nombre_proveedor,
        fecha: new Date(fecha),
        monto_total,
        itbis: itbis != null ? itbis : 0,
        tipo_comprobante: tipo,
      },
    });
    return res.status(200).json(purchase);
  } catch (error: any) {
    console.error('Error al crear compra:', error);
    return res.status(500).json({ detail: error.message });
  }
}

export async function updatePurchase(req: AuthRequest, res: Response) {
  if (!req.user) return res.status(401).json({ detail: 'No autorizado' });
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) return res.status(400).json({ detail: 'ID inválido' });
  try {
    const existing = await prisma.purchaseRecord.findFirst({
      where: { id, company_id: req.user.company_id },
    });
    if (!existing) return res.status(404).json({ detail: 'Compra no encontrada' });
    const { ncf, rnc_proveedor, nombre_proveedor, fecha, monto_total, itbis, tipo_comprobante } = req.body;
    const updated = await prisma.purchaseRecord.update({
      where: { id },
      data: {
        ncf: ncf !== undefined ? ncf : existing.ncf,
        rnc_proveedor: rnc_proveedor !== undefined ? rnc_proveedor : existing.rnc_proveedor,
        nombre_proveedor: nombre_proveedor !== undefined ? nombre_proveedor : existing.nombre_proveedor,
        fecha: fecha !== undefined ? new Date(fecha) : existing.fecha,
        monto_total: monto_total !== undefined ? monto_total : existing.monto_total,
        itbis: itbis !== undefined ? itbis : existing.itbis,
        tipo_comprobante: tipo_comprobante !== undefined ? tipo_comprobante : existing.tipo_comprobante,
      },
    });
    return res.status(200).json(updated);
  } catch (error: any) {
    console.error('Error al actualizar compra:', error);
    return res.status(500).json({ detail: error.message });
  }
}

export async function deletePurchase(req: AuthRequest, res: Response) {
  if (!req.user) return res.status(401).json({ detail: 'No autorizado' });
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) return res.status(400).json({ detail: 'ID inválido' });
  try {
    const existing = await prisma.purchaseRecord.findFirst({
      where: { id, company_id: req.user.company_id },
    });
    if (!existing) return res.status(404).json({ detail: 'Compra no encontrada' });
    await prisma.purchaseRecord.delete({ where: { id } });
    return res.status(200).json({ detail: 'Compra eliminada correctamente' });
  } catch (error: any) {
    console.error('Error al eliminar compra:', error);
    return res.status(500).json({ detail: error.message });
  }
}
