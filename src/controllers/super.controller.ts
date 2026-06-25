import { Response } from 'express';
import bcrypt from 'bcryptjs';
import prisma from '../models/db';
import { AuthRequest } from '../middlewares/auth';
import { CLEAR_ALL_SECRET } from '../config';

function requireSuperAdmin(req: AuthRequest, res: Response): boolean {
  if (!req.user?.is_super_admin) {
    res.status(403).json({ detail: 'Solo el super administrador puede realizar esta acción' });
    return false;
  }
  return true;
}

export async function getSuperStats(req: AuthRequest, res: Response) {
  if (!req.user) return res.status(401).json({ detail: 'No autorizado' });
  if (!requireSuperAdmin(req, res)) return;

  try {
    const [users, companies, clients, products, invoices] = await Promise.all([
      prisma.user.count(),
      prisma.company.count(),
      prisma.client.count(),
      prisma.productService.count(),
      prisma.invoice.count(),
    ]);

    return res.status(200).json({ users, companies, clients, products, invoices });
  } catch (error: any) {
    console.error('❌ Error al obtener estadísticas:', error);
    return res.status(500).json({ detail: 'Error al obtener estadísticas' });
  }
}

export async function getSuperUsers(req: AuthRequest, res: Response) {
  if (!req.user) return res.status(401).json({ detail: 'No autorizado' });
  if (!requireSuperAdmin(req, res)) return;

  try {
    const users = await prisma.user.findMany({
      select: {
        id: true,
        username: true,
        email: true,
        first_name: true,
        last_name: true,
        is_super_admin: true,
        created_at: true,
        userCompanies: {
          include: { company: { select: { id: true, name: true, rnc: true } } },
        },
      },
      orderBy: { created_at: 'desc' },
    });

    return res.status(200).json(users);
  } catch (error: any) {
    console.error('❌ Error al listar usuarios:', error);
    return res.status(500).json({ detail: 'Error al listar usuarios' });
  }
}

export async function updateUserRole(req: AuthRequest, res: Response) {
  if (!req.user) return res.status(401).json({ detail: 'No autorizado' });
  if (!requireSuperAdmin(req, res)) return;

  const targetId = parseInt(req.params.id, 10);
  const { company_id, role } = req.body;

  if (isNaN(targetId)) {
    return res.status(400).json({ detail: 'ID de usuario inválido' });
  }

  if (!company_id || !role) {
    return res.status(400).json({ detail: 'company_id y role son requeridos' });
  }

  const validRoles = ['admin', 'user'];
  if (!validRoles.includes(role)) {
    return res.status(400).json({ detail: 'Rol inválido. Use: admin o user' });
  }

  try {
    const userCompany = await prisma.userCompany.findUnique({
      where: { user_id_company_id: { user_id: targetId, company_id: Number(company_id) } },
    });

    if (!userCompany) {
      return res.status(404).json({ detail: 'El usuario no pertenece a esa empresa' });
    }

    const updated = await prisma.userCompany.update({
      where: { user_id_company_id: { user_id: targetId, company_id: Number(company_id) } },
      data: { role },
    });

    return res.status(200).json({
      message: `Rol del usuario actualizado a: ${role}`,
      user_id: targetId,
      company_id: Number(company_id),
      role: updated.role,
    });
  } catch (error: any) {
    console.error('❌ Error al actualizar rol:', error);
    return res.status(500).json({ detail: 'Error al actualizar rol' });
  }
}

export async function deleteSuperUser(req: AuthRequest, res: Response) {
  if (!req.user) return res.status(401).json({ detail: 'No autorizado' });
  if (!requireSuperAdmin(req, res)) return;

  const targetId = parseInt(req.params.id, 10);
  if (isNaN(targetId)) {
    return res.status(400).json({ detail: 'ID de usuario inválido' });
  }

  if (req.user.id === targetId) {
    return res.status(400).json({ detail: 'No puedes eliminarte a ti mismo' });
  }

  try {
    const user = await prisma.user.findUnique({ where: { id: targetId } });
    if (!user) {
      return res.status(404).json({ detail: 'Usuario no encontrado' });
    }

    await prisma.user.delete({ where: { id: targetId } });
    return res.status(200).json({ detail: 'Usuario eliminado exitosamente' });
  } catch (error: any) {
    console.error('❌ Error al eliminar usuario:', error);
    return res.status(500).json({ detail: 'Error al eliminar usuario' });
  }
}

export async function clearAllData(req: AuthRequest, res: Response) {
  if (!req.user) return res.status(401).json({ detail: 'No autorizado' });
  if (!requireSuperAdmin(req, res)) return;

  const { secret_key } = req.body;
  if (!secret_key || secret_key !== CLEAR_ALL_SECRET) {
    return res.status(403).json({ detail: 'Clave secreta incorrecta' });
  }

  try {
    await prisma.$transaction(async (tx) => {
      await tx.usageAnalytics.deleteMany();
      await tx.invoiceItem.deleteMany();
      await tx.invoice.deleteMany();
      await tx.productService.deleteMany();
      await tx.client.deleteMany();
      await tx.chartOfAccount.deleteMany();
      await tx.companySettings.deleteMany();
      await tx.userCompany.deleteMany();
      await tx.company.deleteMany();
      await tx.user.deleteMany();
    });

    return res.status(200).json({
      success: true,
      message: 'Todos los datos han sido eliminados exitosamente',
    });
  } catch (error: any) {
    console.error('❌ Error al limpiar datos:', error);
    return res.status(500).json({ detail: `Error al limpiar datos: ${error.message}` });
  }
}

export async function resetSequences(req: AuthRequest, res: Response) {
  if (!req.user) return res.status(401).json({ detail: 'No autorizado' });
  if (!requireSuperAdmin(req, res)) return;

  try {
    await prisma.$transaction(async (tx) => {
      await tx.invoiceItem.deleteMany();
      await tx.invoice.deleteMany();

      const companies = await tx.company.findMany({
        where: { NOT: { ncf_ranges: null } },
        select: { id: true, ncf_ranges: true },
      });

      for (const c of companies) {
        if (!c.ncf_ranges) continue;
        const ranges = JSON.parse(c.ncf_ranges as string);
        for (const r of ranges) {
          r.next = 1;
        }
        await tx.company.update({
          where: { id: c.id },
          data: { ncf_ranges: JSON.stringify(ranges) },
        });
      }
    });

    return res.status(200).json({
      success: true,
      message: 'Facturas eliminadas y contadores NCF reiniciados exitosamente',
    });
  } catch (error: any) {
    console.error('❌ Error al resetear secuencias:', error);
    return res.status(500).json({ detail: `Error al resetear secuencias: ${error.message}` });
  }
}

export async function clearIssuedInvoices(req: AuthRequest, res: Response) {
  if (!req.user) return res.status(401).json({ detail: 'No autorizado' });
  if (!requireSuperAdmin(req, res)) return;

  try {
    const result = await prisma.$transaction(async (tx) => {
      const issuedInvoices = await tx.invoice.findMany({
        where: { status: { in: ['issued', 'sent_to_alanube'] } },
        select: { id: true },
      });

      const ids = issuedInvoices.map(i => i.id);

      if (ids.length === 0) {
        return { deleted: 0 };
      }

      await tx.invoiceItem.deleteMany({ where: { invoice_id: { in: ids } } });
      await tx.invoice.deleteMany({ where: { id: { in: ids } } });

      return { deleted: ids.length };
    });

    return res.status(200).json({
      success: true,
      message: `${result.deleted} facturas emitidas eliminadas`,
      deleted: result.deleted,
    });
  } catch (error: any) {
    console.error('❌ Error al limpiar facturas emitidas:', error);
    return res.status(500).json({ detail: `Error al limpiar facturas emitidas: ${error.message}` });
  }
}

export async function seedSuperAdmin(req: AuthRequest, res: Response) {
  // Cualquier usuario (incluso anónimo) puede crear el super admin (solo la primera vez)

  try {
    const existing = await prisma.user.findFirst({
      where: { username: 'hanley' },
    });

    if (existing) {
      if (!existing.is_super_admin) {
        await prisma.user.update({
          where: { id: existing.id },
          data: { is_super_admin: true },
        });
        return res.status(200).json({
          message: 'Super administrador actualizado exitosamente',
          user_id: existing.id,
        });
      }
      return res.status(200).json({
        message: 'El super administrador ya existe',
        user_id: existing.id,
      });
    }

    const hashedPassword = await bcrypt.hash('Kibalion2', 10);
    const user = await prisma.user.create({
      data: {
        username: 'hanley',
        email: 'hanley@superadmin.com',
        password: hashedPassword,
        first_name: 'Hanley',
        last_name: 'Super Admin',
        is_super_admin: true,
      },
    });

    return res.status(201).json({
      message: 'Super administrador creado exitosamente',
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
      },
    });
  } catch (error: any) {
    console.error('❌ Error al crear super admin:', error);
    return res.status(500).json({ detail: `Error al crear super admin: ${error.message}` });
  }
}
