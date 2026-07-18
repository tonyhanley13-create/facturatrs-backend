import { Response } from 'express';
import bcrypt from 'bcryptjs';
import prisma from '../models/db';
import { AuthRequest } from '../middlewares/auth';

/** Verifica que el usuario tenga rol admin en la empresa especificada (o sea super admin) */
async function requireAdminRole(userId: number, companyId: number): Promise<boolean> {
  // Super admin tiene acceso total
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { is_super_admin: true } });
  if (user?.is_super_admin) return true;
  const record = await prisma.userCompany.findFirst({
    where: { user_id: userId, company_id: companyId, role: 'admin' },
  });
  return record !== null;
}

/** Verifica que un usuario esté vinculado a la empresa especificada (super admin siempre pasa) */
async function verifyUserInCompany(targetUserId: number, companyId: number, requestingUserId?: number): Promise<boolean> {
  // Si quien hace la solicitud es super admin, permitir
  if (requestingUserId) {
    const user = await prisma.user.findUnique({ where: { id: requestingUserId }, select: { is_super_admin: true } });
    if (user?.is_super_admin) return true;
  }
  const record = await prisma.userCompany.findFirst({
    where: { user_id: targetUserId, company_id: companyId },
  });
  return record !== null;
}

export async function getMe(req: AuthRequest, res: Response) {
  if (!req.user) {
    return res.status(401).json({ detail: 'No autorizado' });
  }

  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
    });

    if (!user) {
      return res.status(404).json({ detail: 'Usuario no encontrado' });
    }

    return res.status(200).json({
      id: user.id,
      email: user.email,
      first_name: user.first_name,
      last_name: user.last_name,
      company_name: user.company_name,
    });
  } catch (error: any) {
    console.error('❌ Error al obtener perfil:', error);
    return res.status(500).json({ detail: `Error interno del servidor: ${error.message}` });
  }
}

export async function updatePassword(req: AuthRequest, res: Response) {
  if (!req.user) {
    return res.status(401).json({ detail: 'No autorizado' });
  }

  const { current_password, new_password } = req.body;

  if (!current_password || !new_password) {
    return res.status(400).json({ detail: 'Contraseña actual y nueva son requeridas' });
  }

  if (new_password.length < 6) {
    return res.status(400).json({ detail: 'La nueva contraseña debe tener al menos 6 caracteres' });
  }

  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
    });

    if (!user) {
      return res.status(404).json({ detail: 'Usuario no encontrado' });
    }

    // Verificar contraseña actual
    const isMatch = await bcrypt.compare(current_password, user.password);
    if (!isMatch) {
      return res.status(400).json({ detail: 'Contraseña actual incorrecta' });
    }

    // Hashear y guardar nueva contraseña
    const hashedPassword = await bcrypt.hash(new_password, 10);
    await prisma.user.update({
      where: { id: user.id },
      data: { password: hashedPassword },
    });

    return res.status(200).json({ detail: 'Contraseña actualizada' });
  } catch (error: any) {
    console.error('❌ Error al cambiar contraseña:', error);
    return res.status(500).json({ detail: `Error interno del servidor: ${error.message}` });
  }
}

export async function getUsers(req: AuthRequest, res: Response) {
  if (!req.user) {
    return res.status(401).json({ detail: 'No autorizado' });
  }

  try {
    // Obtener usuarios que pertenecen a la misma empresa, incluyendo todas sus empresas
    const userCompanies = await prisma.userCompany.findMany({
      where: { company_id: req.user.company_id || undefined },
      include: {
        user: {
          select: {
            id: true,
            username: true,
            email: true,
            first_name: true,
            last_name: true,
            company_name: true,
            created_at: true,
            userCompanies: {
              include: {
                company: { select: { id: true, name: true, rnc: true } },
              },
            },
          },
        },
      },
      orderBy: { user: { created_at: 'desc' } },
    });

    // Obtener empresas del usuario solicitante para filtrar
    const requesterCompanies = req.user.is_super_admin
      ? null
      : new Set(
          (await prisma.userCompany.findMany({
            where: { user_id: req.user.id },
            select: { company_id: true },
          })).map(uc => uc.company_id)
        );

    // Mapear para incluir la lista de empresas de cada usuario
    const seen = new Map<number, any>();
    for (const uc of userCompanies) {
      if (!seen.has(uc.user.id)) {
        seen.set(uc.user.id, {
          id: uc.user.id,
          username: uc.user.username,
          email: uc.user.email,
          first_name: uc.user.first_name,
          last_name: uc.user.last_name,
          company_name: uc.user.company_name,
          created_at: uc.user.created_at,
          companies: uc.user.userCompanies
            .filter((uc2) => !requesterCompanies || requesterCompanies.has(uc2.company.id))
            .map((uc2) => ({
              id: uc2.company.id,
              name: uc2.company.name,
              rnc: uc2.company.rnc,
              role: uc2.role,
              can_switch_company: uc2.can_switch_company,
              permissions: uc2.permissions,
            })),
        });
      }
    }

    return res.status(200).json(Array.from(seen.values()));
  } catch (error: any) {
    console.error('❌ Error al obtener usuarios:', error);
    return res.status(500).json({ detail: 'Error al cargar usuarios' });
  }
}

export async function createUser(req: AuthRequest, res: Response) {
  if (!req.user) {
    return res.status(401).json({ detail: 'No autorizado' });
  }

  const { username, email, password, first_name, last_name, company_name, company_id, role, permissions } = req.body;

  if (!username || !email || !password || !first_name) {
    return res.status(400).json({ detail: 'Usuario, email, contraseña y nombre son requeridos' });
  }

  // Validar formato de username
  const usernameRegex = /^[a-zA-Z0-9_]{3,50}$/;
  if (!usernameRegex.test(username)) {
    return res.status(400).json({ detail: 'El usuario debe tener entre 3 y 50 caracteres, solo letras, números y guión bajo' });
  }

  // Validar formato de email
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    return res.status(400).json({ detail: 'El formato del email no es válido' });
  }

  // Validar rol
  const validRoles = ['admin', 'supervisor', 'cajero', 'user'];
  const userRole = role && validRoles.includes(role) ? role : 'user';

  try {
    if (!(await requireAdminRole(req.user.id, req.user.company_id))) {
      return res.status(403).json({ detail: 'Solo los administradores pueden crear usuarios' });
    }

    const existingUsername = await prisma.user.findFirst({ where: { username } });
    if (existingUsername) {
      return res.status(400).json({ detail: 'El nombre de usuario ya está registrado' });
    }

    const existingUser = await prisma.user.findUnique({ where: { email } });
    if (existingUser) {
      return res.status(400).json({ detail: 'El correo electrónico ya está registrado' });
    }

    // Determinar y validar las empresas destino
    const hasCompanyIds = req.body.company_ids && Array.isArray(req.body.company_ids) && req.body.company_ids.length > 0;
    const bodyCompanyId = company_id ?? req.user.company_id;

    if ((bodyCompanyId === undefined || bodyCompanyId === null) && !hasCompanyIds) {
      return res.status(400).json({ detail: 'Debe especificar una empresa (company_id o company_ids)' });
    }

    let companyIds: number[];
    if (hasCompanyIds) {
      for (const cid of req.body.company_ids) {
        if (typeof cid !== 'number' || cid <= 0) {
          return res.status(400).json({ detail: `ID de empresa inválido: ${cid}` });
        }
        const companyExists = await prisma.company.findUnique({ where: { id: cid } });
        if (!companyExists) {
          return res.status(400).json({ detail: `La empresa con id ${cid} no existe` });
        }
      }
      companyIds = req.body.company_ids;
    } else if (bodyCompanyId === 0 && req.user.is_super_admin) {
      // Super admin sin empresa específica → asignar a todas las empresas
      const allCompanies = await prisma.company.findMany({ select: { id: true } });
      if (allCompanies.length === 0) {
        return res.status(400).json({ detail: 'No hay empresas disponibles' });
      }
      companyIds = allCompanies.map(c => c.id);
    } else if (bodyCompanyId > 0) {
      const companyExists = await prisma.company.findUnique({ where: { id: bodyCompanyId } });
      if (!companyExists) {
        return res.status(400).json({ detail: 'La empresa especificada no existe' });
      }
      companyIds = [bodyCompanyId];
    } else {
      return res.status(400).json({ detail: 'ID de empresa inválido' });
    }

    // Validar que el creador tiene permisos de administrador en todas las empresas destino (a menos que sea super admin)
    if (!req.user.is_super_admin) {
      for (const cid of companyIds) {
        const isAdminInCompany = await prisma.userCompany.findFirst({
          where: { user_id: req.user.id, company_id: cid, role: 'admin' },
        });
        if (!isAdminInCompany) {
          return res.status(403).json({ detail: `No tienes permisos de administrador en la empresa con id ${cid}` });
        }
      }
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    // Crear usuario y vincularlo a la(s) empresa(s) en una transacción
    const result = await prisma.$transaction(async (tx) => {
      const newUser = await tx.user.create({
        data: {
          username,
          email,
          password: hashedPassword,
          first_name,
          last_name: last_name || '',
          company_name: company_name || 'TRS Client',
        },
      });

      const canSwitchMap: Record<number, boolean> = {};
      if (req.body.company_can_switch && typeof req.body.company_can_switch === 'object') {
        for (const [k, v] of Object.entries(req.body.company_can_switch)) {
          canSwitchMap[parseInt(k, 10)] = !!v;
        }
      }
      const permissionsJson = Array.isArray(permissions) && permissions.length > 0 ? JSON.stringify(permissions) : null;
      for (const cid of companyIds) {
        await tx.userCompany.create({
          data: {
            user_id: newUser.id,
            company_id: cid,
            role: userRole,
            permissions: permissionsJson,
            can_switch_company: canSwitchMap[cid] !== undefined ? canSwitchMap[cid] : true,
          },
        });
      }

      return newUser;
    });

    return res.status(201).json({
      id: result.id,
      username: result.username,
      email: result.email,
      first_name: result.first_name,
      message: `Usuario creado y vinculado a ${companyIds.length} empresa(s)`,
    });
  } catch (error: any) {
    console.error('❌ Error al crear usuario:', error);
    const detail = error?.message || 'Error al crear usuario';
    return res.status(500).json({ detail });
  }
}

export async function updateUser(req: AuthRequest, res: Response) {
  if (!req.user) {
    return res.status(401).json({ detail: 'No autorizado' });
  }

  const targetId = parseInt(req.params.id, 10);
  if (isNaN(targetId)) {
    return res.status(400).json({ detail: 'ID de usuario inválido' });
  }

  try {
    if (!(await requireAdminRole(req.user.id, req.user.company_id))) {
      return res.status(403).json({ detail: 'Solo los administradores pueden actualizar usuarios' });
    }

    if (!(await verifyUserInCompany(targetId, req.user.company_id, req.user.id))) {
      return res.status(404).json({ detail: 'Usuario no encontrado en esta empresa' });
    }

    const { username, email, first_name, last_name, company_name, company_ids, role, password, permissions } = req.body;

    if (!username || !email || !first_name) {
      return res.status(400).json({ detail: 'Usuario, email y nombre son requeridos' });
    }

    // Validar formato de email
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({ detail: 'El formato del email no es válido' });
    }

    const currentUserId = req.user.id;

    const updatedUser = await prisma.$transaction(async (tx) => {
      const data: any = {
        username,
        email,
        first_name,
        last_name,
      };

      if (company_name !== undefined) data.company_name = company_name;
      if (password && password.length >= 6) {
        data.password = await bcrypt.hash(password, 10);
      }

      // Si se enviaron company_ids, actualizar la vinculación multi-empresa
      if (company_ids && Array.isArray(company_ids) && company_ids.length > 0) {
        // Validar que el admin puede administrar todas las empresas enviadas
        for (const cid of company_ids) {
          const isAdminInCompany = await tx.userCompany.findFirst({
            where: { user_id: currentUserId, company_id: cid, role: 'admin' },
          });
          // Super admin no necesita UserCompany record
          const currentUser = await tx.user.findUnique({ where: { id: currentUserId }, select: { is_super_admin: true } });
          if (!isAdminInCompany && !currentUser?.is_super_admin) {
            throw new Error(`No tienes permisos de administrador en la empresa ${cid}`);
          }
        }

        // Eliminar vínculos existentes
        await tx.userCompany.deleteMany({ where: { user_id: targetId } });

        // Crear nuevos vínculos
        const userRole = role || 'user';
        const permissionsJson = Array.isArray(permissions) && permissions.length > 0 ? JSON.stringify(permissions) : null;
        const canSwitchMap: Record<number, boolean> = {};
        if (req.body.company_can_switch && typeof req.body.company_can_switch === 'object') {
          for (const [k, v] of Object.entries(req.body.company_can_switch)) {
            canSwitchMap[parseInt(k, 10)] = !!v;
          }
        }
        for (const cid of company_ids) {
          await tx.userCompany.create({
            data: {
              user_id: targetId,
              company_id: cid,
              role: userRole,
              permissions: permissionsJson,
              can_switch_company: canSwitchMap[cid] !== undefined ? canSwitchMap[cid] : true,
            },
          });
        }

        // Actualizar el company_name con la primera empresa
        const firstCompany = await tx.company.findUnique({ where: { id: company_ids[0] } });
        data.company_name = firstCompany?.name || company_name || 'TRS Client';
      } else if (permissions !== undefined || role !== undefined || req.body.company_can_switch !== undefined) {
        // Actualizar permisos/rol/switch sin cambiar la vinculación de empresas
        const updateData: any = {};
        if (role !== undefined) updateData.role = role;
        if (permissions !== undefined) {
          updateData.permissions = Array.isArray(permissions) && permissions.length > 0
            ? JSON.stringify(permissions)
            : null;
        }
        // Si es super admin, actualizar en todas las empresas del usuario
        // Si no, solo en la empresa actual del admin
        const currentUser = await tx.user.findUnique({ where: { id: req.user!.id }, select: { is_super_admin: true } });
        const whereClause: any = { user_id: targetId };
        if (!currentUser?.is_super_admin) {
          whereClause.company_id = req.user!.company_id;
        }
        
        if (Object.keys(updateData).length > 0) {
          await tx.userCompany.updateMany({
            where: whereClause,
            data: updateData,
          });
        }

        // Si se envió el mapa de cambio de empresa, actualizarlo
        if (req.body.company_can_switch && typeof req.body.company_can_switch === 'object') {
          for (const [cidStr, canSwitch] of Object.entries(req.body.company_can_switch)) {
            const cid = parseInt(cidStr, 10);
            if (!isNaN(cid)) {
              // Asegurar que el admin tiene derecho a editar esta empresa (o es super admin)
              if (currentUser?.is_super_admin || cid === req.user!.company_id) {
                await tx.userCompany.updateMany({
                  where: { user_id: targetId, company_id: cid },
                  data: { can_switch_company: !!canSwitch },
                });
              }
            }
          }
        }
      }

      return tx.user.update({
        where: { id: targetId },
        data,
      });
    });

    return res.status(200).json(updatedUser);
  } catch (error: any) {
    console.error('❌ Error al actualizar usuario:', error);
    return res.status(500).json({ detail: error.message || 'Error al actualizar usuario' });
  }
}

export async function deleteUser(req: AuthRequest, res: Response) {
  if (!req.user) {
    return res.status(401).json({ detail: 'No autorizado' });
  }

  const targetId = parseInt(req.params.id, 10);
  if (isNaN(targetId)) {
    return res.status(400).json({ detail: 'ID de usuario inválido' });
  }

  if (req.user.id === targetId) {
    return res.status(400).json({ detail: 'No puedes eliminarte a ti mismo' });
  }

  try {
    if (!(await requireAdminRole(req.user.id, req.user.company_id))) {
      return res.status(403).json({ detail: 'Solo los administradores pueden eliminar usuarios' });
    }

    if (!(await verifyUserInCompany(targetId, req.user.company_id, req.user.id))) {
      return res.status(404).json({ detail: 'Usuario no encontrado en esta empresa' });
    }

    await prisma.user.delete({
      where: { id: targetId },
    });
    return res.status(200).json({ detail: 'Usuario eliminado' });
  } catch (error: any) {
    console.error('❌ Error al eliminar usuario:', error);
    return res.status(500).json({ detail: 'Error al eliminar usuario' });
  }
}
