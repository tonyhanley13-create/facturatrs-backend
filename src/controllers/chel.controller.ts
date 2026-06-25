import { Response } from 'express';
import { AuthRequest } from '../middlewares/auth';
import prisma from '../models/db';
import * as chelService from '../services/chel.service';

export async function importFromChel(req: AuthRequest, res: Response) {
  if (!req.user) return res.status(401).json({ detail: 'No autorizado' });

  const { company_id, tables } = req.body;
  if (!company_id) return res.status(400).json({ detail: 'company_id es requerido' });
  if (!tables || !Array.isArray(tables) || tables.length === 0) {
    return res.status(400).json({ detail: 'tables debe ser un array con [\"clients\",\"products\"]' });
  }

  // Verify user belongs to the target company
  const membership = await prisma.userCompany.findFirst({
    where: { user_id: req.user.id, company_id: company_id },
  });
  if (!membership) return res.status(403).json({ detail: 'No pertenece a la empresa destino' });

  const company = await prisma.company.findUnique({ where: { id: company_id } });
  if (!company) return res.status(404).json({ detail: 'Empresa no encontrada' });

  const result: Record<string, number> = {};

  try {
    if (tables.includes('clients')) {
      result.clients = await chelService.importClientsToCompany(company_id, req.user.id);
    }
    if (tables.includes('products')) {
      result.products = await chelService.importProductsToCompany(company_id, req.user.id);
    }

    return res.status(200).json({
      success: true,
      message: `Importación completada: ${result.clients || 0} clientes, ${result.products || 0} productos`,
      data: result,
    });
  } catch (error: any) {
    console.error('Error al importar desde CHELO:', error);
    return res.status(500).json({ detail: `Error al importar: ${error.message}` });
  }
}
