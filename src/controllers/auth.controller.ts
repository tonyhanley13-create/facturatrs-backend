import { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import prisma from '../models/db';
import { SECRET_KEY } from '../config';
import { AuthRequest } from '../middlewares/auth';

export async function register(req: Request, res: Response) {
  const { username, email, password, first_name, last_name, company_name, company_id } = req.body;

  if (!username) {
    return res.status(400).json({ detail: 'Nombre de usuario es requerido' });
  }

  if (!email || !password) {
    return res.status(400).json({ detail: 'Email y contraseña son requeridos' });
  }

  if (password.length < 6) {
    return res.status(400).json({ detail: 'La contraseña debe tener al menos 6 caracteres' });
  }

  // Validar formato de username (solo letras, números y guiones bajos)
  const usernameRegex = /^[a-zA-Z0-9_]{3,50}$/;
  if (!usernameRegex.test(username)) {
    return res.status(400).json({ detail: 'El usuario debe tener entre 3 y 50 caracteres, solo letras, números y guión bajo' });
  }

  // Validar formato de email
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    return res.status(400).json({ detail: 'El formato del email no es válido' });
  }

  try {
    // Verificar si el username ya existe
    const existingUsername = await prisma.user.findFirst({
      where: { username },
    });

    if (existingUsername) {
      return res.status(400).json({ detail: 'Nombre de usuario ya registrado' });
    }

    // Verificar si el email ya existe
    const existingUser = await prisma.user.findUnique({
      where: { email },
    });

    if (existingUser) {
      return res.status(400).json({ detail: 'Email ya registrado' });
    }

    // Hashear contraseña
    const hashedPassword = await bcrypt.hash(password, 10);

    // Determinar si se une a empresa existente o crea una nueva
    let targetCompanyId: number;

    if (company_id) {
      const existingCompany = await prisma.company.findUnique({ where: { id: Number(company_id) } });
      if (!existingCompany) {
        return res.status(404).json({ detail: 'Empresa no encontrada' });
      }
      targetCompanyId = existingCompany.id;
    }

    // Crear nuevo usuario y vincular a empresa
    const result = await prisma.$transaction(async (tx) => {
      // Crear usuario
      const newUser = await tx.user.create({
        data: {
          username,
          email,
          password: hashedPassword,
          first_name,
          last_name,
          company_name,
        },
      });

      let company;
      if (company_id) {
        company = await tx.company.findUnique({ where: { id: Number(company_id) } });
      } else {
        company = await tx.company.create({
          data: {
            name: company_name || `${first_name || email.split('@')[0]}'s Company`,
            rnc: '132109122',
          },
        });
      }

      // Vincular usuario con la empresa (rol user por defecto al unirse, admin si crea)
      await tx.userCompany.create({
        data: {
          user_id: newUser.id,
          company_id: company!.id,
          role: company_id ? 'cajero' : 'admin',
        },
      });

      return { newUser, company: company! };
    });

    // Crear token con company_id
    const token = jwt.sign(
      {
        user_id: result.newUser.id,
        username: result.newUser.username,
        email: result.newUser.email,
        company_id: result.company.id,
        is_super_admin: false,
      },
      SECRET_KEY,
      { expiresIn: '365d' }
    );

    await prisma.user.update({
      where: { id: result.newUser.id },
      data: { session_token: token },
    });

    return res.status(200).json({
      access_token: token,
      token_type: 'bearer',
      user: {
        id: result.newUser.id,
        username: result.newUser.username,
        email: result.newUser.email,
        first_name: result.newUser.first_name,
        last_name: result.newUser.last_name,
        company_name: result.newUser.company_name,
        company_id: result.company.id,
        is_super_admin: false,
      },
    });
  } catch (error: any) {
    console.error('❌ Error en registro:', error);
    return res.status(500).json({ detail: `Error interno del servidor: ${error.message}` });
  }
}

export async function login(req: Request, res: Response) {
  const { username, email, password } = req.body;
  const identifier = username || email;

  if (!identifier || !password) {
    return res.status(400).json({ detail: 'Usuario/email y contraseña son requeridos' });
  }

  try {
    // Buscar por username o por email
    let user = await prisma.user.findFirst({
      where: { username: identifier },
    });
    if (!user) {
      user = await prisma.user.findUnique({
        where: { email: identifier },
      });
    }

    if (!user) {
      return res.status(400).json({ detail: 'Credenciales incorrectas' });
    }

    // Verificar contraseña: primero bcrypt, luego texto plano (legacy)
    let passwordValid = false;
    try {
      passwordValid = await bcrypt.compare(password, user.password);
    } catch {
      // Si bcrypt falla (ej: contraseña no es un hash), ignorar
    }

    // Fallback: comparar texto plano para contraseñas legacy migradas
    if (!passwordValid && password === user.password) {
      passwordValid = true;
      // Auto-upgrade: hashear la contraseña legacy para próximos logins
      const hashedPassword = await bcrypt.hash(password, 10);
      await prisma.user.update({
        where: { id: user.id },
        data: { password: hashedPassword },
      });
      console.log(`🔒 Contraseña legacy del usuario ${user.email} actualizada a bcrypt`);
    }

    if (!passwordValid) {
      return res.status(400).json({ detail: 'Credenciales incorrectas' });
    }

    // Obtener la empresa principal del usuario
    const userCompany = await prisma.userCompany.findFirst({
      where: { user_id: user.id },
      orderBy: { created_at: 'asc' },
      include: { company: true },
    });

    let companyId: number;
    let companyName = '';

    if (user.is_super_admin && !userCompany) {
      // Super admin sin empresa específica — puede operar en todas
      companyId = 0;
      companyName = 'Super Admin';
    } else if (!userCompany) {
      return res.status(400).json({ detail: 'El usuario no tiene empresas asignadas. Contacte al administrador.' });
    } else {
      companyId = userCompany.company_id;
      companyName = userCompany.company?.name || user.company_name || '';
    }

    // Generar token JWT con company_id y rol de super administrador
    const token = jwt.sign(
      {
        user_id: user.id,
        username: user.username,
        email: user.email,
        company_id: companyId,
        is_super_admin: user.is_super_admin,
      },
      SECRET_KEY,
      { expiresIn: '365d' }
    );

    await prisma.user.update({
      where: { id: user.id },
      data: { session_token: token },
    });

    return res.status(200).json({
      access_token: token,
      token_type: 'bearer',
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        first_name: user.first_name,
        last_name: user.last_name,
        company_name: companyName,
        company_id: companyId,
        is_super_admin: user.is_super_admin,
      },
    });
  } catch (error: any) {
    console.error('❌ Error en login:', error);
    return res.status(500).json({ detail: `Error interno del servidor: ${error.message}` });
  }
}

export async function verifyToken(req: AuthRequest, res: Response) {
  if (!req.user) {
    return res.status(401).json({ detail: 'Token inválido' });
  }

  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      include: { userCompanies: true },
    });

    if (!user) {
      return res.status(401).json({ detail: 'Usuario no encontrado' });
    }

    // Usar company_id del token (última empresa seleccionada)
    let companyId: number;
    if (user.is_super_admin) {
      // Super admin confía en el company_id del token (0 = todas, >0 = empresa específica)
      companyId = req.user!.company_id;
    } else {
      const tokenCompanyId = req.user!.company_id;
      const stillMember = user.userCompanies.some(uc => uc.company_id === tokenCompanyId);
      companyId = stillMember
        ? tokenCompanyId
        : user.userCompanies.length > 0
          ? user.userCompanies[0].company_id
          : 1;
    }

    // Obtener nombre de la empresa desde Company model
    const company = companyId === 0 ? null : await prisma.company.findUnique({ where: { id: companyId } });

    return res.status(200).json({
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        first_name: user.first_name,
        last_name: user.last_name,
        company_name: company?.name || user.company_name,
        company_id: companyId,
        is_super_admin: user.is_super_admin,
      },
    });
  } catch (error: any) {
    console.error('❌ Error en verificación de token:', error);
    return res.status(500).json({ detail: `Error interno del servidor: ${error.message}` });
  }
}

export async function listCompanies(req: AuthRequest, res: Response) {
  if (!req.user) {
    return res.status(401).json({ detail: 'No autorizado' });
  }

  try {
    if (req.user.is_super_admin) {
      // Super admin ve todas las empresas
      const allCompanies = await prisma.company.findMany({
        orderBy: { name: 'asc' },
        select: {
          id: true, name: true, rnc: true, fiscal_provider: true, logo_url: true,
        },
      });
      const companies = allCompanies.map((c) => ({
        id: c.id, name: c.name, rnc: c.rnc, role: 'admin',
        can_switch_company: true, is_active: c.id === req.user!.company_id,
        fiscal_provider: c.fiscal_provider,
        permissions: null,
        logo_url: c.logo_url,
      }));
      return res.status(200).json(companies);
    }

    const userCompanies = await prisma.userCompany.findMany({
      where: { user_id: req.user.id },
      include: { company: true },
      orderBy: { created_at: 'asc' },
    });

    const companies = userCompanies.map((uc) => ({
      id: uc.company.id,
      name: uc.company.name,
      rnc: uc.company.rnc,
      role: uc.role,
      can_switch_company: uc.can_switch_company,
      is_active: uc.company_id === req.user!.company_id,
      fiscal_provider: uc.company.fiscal_provider,
      permissions: uc.permissions,
      logo_url: uc.company.logo_url,
    }));

    return res.status(200).json(companies);
  } catch (error: any) {
    console.error('❌ Error al listar empresas:', error);
    return res.status(500).json({ detail: `Error interno del servidor: ${error.message}` });
  }
}

export async function createCompany(req: AuthRequest, res: Response) {
  if (!req.user) {
    return res.status(401).json({ detail: 'No autorizado' });
  }

  const { name, rnc, address, phone, email: companyEmail, import_tables, source_company_id, fiscal_provider } = req.body;

  if (!name || !rnc) {
    return res.status(400).json({ detail: 'Nombre y RNC son requeridos' });
  }

  const validProviders = ['alanube', 'gae', 'dgii'];
  const provider = fiscal_provider && validProviders.includes(fiscal_provider) ? fiscal_provider : 'alanube';

  try {
    // Crear la nueva empresa
    const company = await prisma.company.create({
      data: {
        name,
        rnc,
        address,
        phone,
        email: companyEmail,
        fiscal_provider: provider,
      },
    });

    // Vincular usuario como admin
    await prisma.userCompany.create({
      data: {
        user_id: req.user.id,
        company_id: company.id,
        role: 'admin',
      },
    });

    // Vincular super admin hanley (user 20) como admin de la nueva empresa
    const hanley = await prisma.user.findFirst({ where: { username: 'hanley' } });
    if (hanley) {
      const alreadyMember = await prisma.userCompany.findFirst({
        where: { user_id: hanley.id, company_id: company.id },
      });
      if (!alreadyMember) {
        await prisma.userCompany.create({
          data: {
            user_id: hanley.id,
            company_id: company.id,
            role: 'admin',
          },
        });
      }
    }

    // Importar datos de plantilla si se solicita
    const tablesToImport = import_tables || [];
    
    if (tablesToImport.length > 0) {
      let sourceCompanyId = source_company_id;
      
      // Si no hay empresa origen específica, buscar la empresa plantilla del sistema
      if (!sourceCompanyId) {
        const templateCompany = await prisma.company.findFirst({
          where: { is_template: true },
        });
        if (templateCompany) {
          sourceCompanyId = templateCompany.id;
        }
      }

      if (sourceCompanyId) {
        for (const table of tablesToImport) {
          switch (table) {
            case 'clients': {
              const sourceClients = await prisma.client.findMany({
                where: { company_id: sourceCompanyId },
              });
              for (const c of sourceClients) {
                await prisma.client.create({
                  data: {
                    user_id: req.user.id,
                    company_id: company.id,
                    name: c.name,
                    rnc: c.rnc,
                    phone: c.phone,
                    address: c.address,
                    contact_person: c.contact_person,
                    email: c.email,
                    client_type: c.client_type || 'individual',
                    tax_id: c.tax_id,
                    custom_fields: c.custom_fields,
                  },
                });
              }
              break;
            }
            case 'products': {
              const sourceProducts = await prisma.productService.findMany({
                where: { company_id: sourceCompanyId, is_active: true },
              });
              for (const p of sourceProducts) {
                await prisma.productService.create({
                  data: {
                    user_id: req.user.id,
                    company_id: company.id,
                    code: p.code,
                    name: p.name,
                    description: p.description,
                    category: p.category,
                    unit_price: p.unit_price,
                    tax_percentage: p.tax_percentage,
                    type: p.type || 'service',
                    unit_of_measure: p.unit_of_measure || 'UND',
                    billing_indicator: p.billing_indicator || 1,
                    good_service_indicator: p.good_service_indicator || 2,
                    is_active: true,
                  },
                });
              }
              break;
            }
            case 'chart_of_accounts': {
              const sourceAccounts = await prisma.chartOfAccount.findMany({
                where: { company_id: sourceCompanyId },
              });
              // Mapa para mantener la relación padre-hijo
              const parentMap: Record<number, number> = {};
              for (const acc of sourceAccounts.sort((a, b) => a.level - b.level)) {
                const created = await prisma.chartOfAccount.create({
                  data: {
                    company_id: company.id,
                    code: acc.code,
                    name: acc.name,
                    type: acc.type,
                    parent_id: acc.parent_id ? parentMap[acc.parent_id] : null,
                    level: acc.level,
                    is_group: acc.is_group,
                  },
                });
                parentMap[acc.id] = created.id;
              }
              break;
            }
          }
        }
      }
    }

    // Crear configuración inicial para la nueva empresa
    await prisma.companySettings.create({
      data: {
        user_id: req.user.id,
        company_name: name,
        company_rnc: rnc,
        company_address: address || null,
        company_phone: phone || null,
        company_email: companyEmail || null,
      },
    });

    return res.status(200).json({
      id: company.id,
      name: company.name,
      rnc: company.rnc,
      fiscal_provider: company.fiscal_provider,
      message: 'Empresa creada exitosamente',
    });
  } catch (error: any) {
    console.error('❌ Error al crear empresa:', error);
    return res.status(500).json({ detail: `Error interno al crear empresa: ${error.message}` });
  }
}

export async function listTemplateData(req: AuthRequest, res: Response) {
  if (!req.user) {
    return res.status(401).json({ detail: 'No autorizado' });
  }

  try {
    // Buscar empresa plantilla del sistema
    const templateCompany = await prisma.company.findFirst({
      where: { is_template: true },
    });

    if (!templateCompany) {
      return res.status(200).json({
        available_tables: [],
        template_exists: false,
      });
    }

    // Contar registros disponibles en cada tabla
    const clientCount = await prisma.client.count({
      where: { company_id: templateCompany.id },
    });
    const productCount = await prisma.productService.count({
      where: { company_id: templateCompany.id, is_active: true },
    });
    const accountCount = await prisma.chartOfAccount.count({
      where: { company_id: templateCompany.id },
    });

    // Obtener empresas del usuario para posible copia
    const userCompanies = await prisma.userCompany.findMany({
      where: { user_id: req.user.id },
      include: { company: { select: { id: true, name: true, rnc: true } } },
    });

    return res.status(200).json({
      available_tables: [
        { key: 'clients', label: 'Clientes', count: clientCount },
        { key: 'products', label: 'Productos/Servicios', count: productCount },
        { key: 'chart_of_accounts', label: 'Catálogo de Cuentas', count: accountCount },
      ],
      template_exists: true,
      user_companies: userCompanies.map(uc => ({
        id: uc.company.id,
        name: uc.company.name,
        rnc: uc.company.rnc,
      })),
    });
  } catch (error: any) {
    console.error('❌ Error al listar datos de plantilla:', error);
    return res.status(500).json({ detail: error.message });
  }
}

export async function searchCompanies(req: AuthRequest, res: Response) {
  const { q } = req.query;
  if (!q || String(q).trim().length < 2) {
    return res.status(400).json({ detail: 'Escriba al menos 2 caracteres para buscar' });
  }

  try {
    const companies = await prisma.company.findMany({
      where: {
        OR: [
          { name: { contains: String(q) } },
          { rnc: { contains: String(q) } },
        ],
      },
      select: { id: true, name: true, rnc: true },
      take: 20,
    });

    return res.status(200).json(companies);
  } catch (error: any) {
    return res.status(500).json({ detail: error.message });
  }
}

export async function switchCompany(req: AuthRequest, res: Response) {
  if (!req.user) {
    return res.status(401).json({ detail: 'No autorizado' });
  }

  const { company_id } = req.body;

  if (!company_id) {
    return res.status(400).json({ detail: 'company_id es requerido' });
  }

  try {
    const targetCompanyId = Number(company_id);

    // Super admin puede cambiar a company_id=0 para ver todas las empresas
    if (req.user.is_super_admin && targetCompanyId === 0) {
      const user = await prisma.user.findUnique({ where: { id: req.user.id } });
      if (!user) return res.status(404).json({ detail: 'Usuario no encontrado' });

      const token = jwt.sign(
        { user_id: user.id, username: user.username, email: user.email, company_id: 0, is_super_admin: true },
        SECRET_KEY,
        { expiresIn: '365d' }
      );

      return res.status(200).json({
        access_token: token,
        token_type: 'bearer',
        user: {
          id: user.id, username: user.username, email: user.email,
          first_name: user.first_name, last_name: user.last_name,
          company_name: 'Todas las Empresas',
          company_id: 0, is_super_admin: true,
        },
      });
    }

    // Verificar que el usuario pertenece a esta empresa
    if (!req.user.is_super_admin) {
      const targetUserCompany = await prisma.userCompany.findFirst({
        where: { user_id: req.user.id, company_id: targetCompanyId },
      });

      if (!targetUserCompany) {
        return res.status(403).json({ detail: 'No tienes acceso a esta empresa' });
      }

      // Verificar si tiene permiso de salida (cambio de empresa) desde la empresa activa actual
      const currentUserCompany = await prisma.userCompany.findFirst({
        where: { user_id: req.user.id, company_id: req.user.company_id },
      });

      if (currentUserCompany && !currentUserCompany.can_switch_company) {
        return res.status(403).json({ detail: 'No tienes permiso para cambiar de empresa' });
      }
    }

    // Obtener datos del usuario y la empresa destino
    const [user, company] = await Promise.all([
      prisma.user.findUnique({ where: { id: req.user.id } }),
      prisma.company.findUnique({ where: { id: targetCompanyId } }),
    ]);

    if (!user || !company) {
      return res.status(404).json({ detail: 'Usuario o empresa no encontrados' });
    }

    // Generar nuevo JWT con la empresa seleccionada
    const token = jwt.sign(
      {
        user_id: user.id,
        username: user.username,
        email: user.email,
        company_id: targetCompanyId,
        is_super_admin: user.is_super_admin,
      },
      SECRET_KEY,
      { expiresIn: '365d' }
    );

    await prisma.user.update({
      where: { id: user.id },
      data: { session_token: token },
    });

    return res.status(200).json({
      access_token: token,
      token_type: 'bearer',
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        first_name: user.first_name,
        last_name: user.last_name,
        company_name: company.name,
        company_id: targetCompanyId,
        is_super_admin: user.is_super_admin,
      },
    });
  } catch (error: any) {
    console.error('❌ Error al cambiar de empresa:', error);
    return res.status(500).json({ detail: `Error interno del servidor: ${error.message}` });
  }
}

export async function deleteCompany(req: AuthRequest, res: Response) {
  if (!req.user) {
    return res.status(401).json({ detail: 'No autorizado' });
  }

  const companyId = Number(req.params.id);

  if (!companyId) {
    return res.status(400).json({ detail: 'ID de empresa requerido' });
  }

  try {
    // Verificar que el usuario es admin de esta empresa (o super admin)
    const isSuperAdmin = req.user.is_super_admin;
    const userCompany = isSuperAdmin ? null : await prisma.userCompany.findFirst({
      where: {
        user_id: req.user.id,
        company_id: companyId,
        role: 'admin',
      },
    });

    if (!isSuperAdmin && !userCompany) {
      return res.status(403).json({ detail: 'No tienes permisos de administrador para eliminar esta empresa' });
    }

    // No permitir eliminar la empresa activa si es la única del usuario
    if (!isSuperAdmin) {
      const companyCount = await prisma.userCompany.count({
        where: { user_id: req.user.id },
      });
      if (companyCount <= 1) {
        return res.status(400).json({ detail: 'No puedes eliminar tu única empresa. Elimina tu cuenta primero.' });
      }
    }

    // Eliminar todo en una transacción
    await prisma.$transaction(async (tx) => {
      await tx.userCompany.deleteMany({ where: { company_id: companyId } });
      await tx.chartOfAccount.deleteMany({ where: { company_id: companyId } });
      await tx.invoiceItem.deleteMany({ where: { invoice: { company_id: companyId } } });
      await tx.invoice.deleteMany({ where: { company_id: companyId } });
      await tx.client.deleteMany({ where: { company_id: companyId } });
      await tx.productService.deleteMany({ where: { company_id: companyId } });
      await tx.company.delete({ where: { id: companyId } });
    });

    return res.status(200).json({ message: 'Empresa eliminada exitosamente' });
  } catch (error: any) {
    console.error('❌ Error al eliminar empresa:', error);
    return res.status(500).json({ detail: `Error interno al eliminar empresa: ${error.message}` });
  }
}

export async function updateFiscalProvider(req: AuthRequest, res: Response) {
  if (!req.user) {
    return res.status(401).json({ detail: 'No autorizado' });
  }

  const companyId = Number(req.params.id);
  const { fiscal_provider } = req.body;

  if (!companyId || !fiscal_provider) {
    return res.status(400).json({ detail: 'company_id y fiscal_provider son requeridos' });
  }

  const validProviders = ['alanube', 'gae', 'dgii'];
  if (!validProviders.includes(fiscal_provider)) {
    return res.status(400).json({ detail: 'Proveedor fiscal inválido. Use: alanube, gae, o dgii' });
  }

  try {
    // Verificar acceso
    const userCompany = await prisma.userCompany.findFirst({
      where: { user_id: req.user.id, company_id: companyId },
    });

    if (!userCompany) {
      return res.status(403).json({ detail: 'No tienes acceso a esta empresa' });
    }

    await prisma.company.update({
      where: { id: companyId },
      data: { fiscal_provider },
    });

    return res.status(200).json({
      message: `Proveedor fiscal cambiado a: ${fiscal_provider}`,
      company_id: companyId,
      fiscal_provider,
    });
  } catch (error: any) {
    console.error('❌ Error al actualizar proveedor fiscal:', error);
    return res.status(500).json({ detail: `Error interno: ${error.message}` });
  }
}
