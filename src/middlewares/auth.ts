import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { SECRET_KEY } from '../config';

export interface AuthRequest extends Request {
  user?: {
    id: number;
    email: string;
    company_id: number;
    is_super_admin: boolean;
  };
  file?: Express.Multer.File;
}

export function requireSuperAdmin(req: AuthRequest, res: Response, next: NextFunction): void {
  if (!req.user?.is_super_admin) {
    res.status(403).json({ detail: 'Solo el super administrador puede realizar esta acción' });
    return;
  }
  next();
}

export function authenticateToken(req: AuthRequest, res: Response, next: NextFunction): void {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    res.status(401).json({ detail: 'Token de autenticación no proporcionado o inválido' });
    return;
  }

  try {
    const decoded = jwt.verify(token, SECRET_KEY) as {
      user_id: number;
      email: string;
      company_id?: number;
      is_super_admin?: boolean;
    };
    
    req.user = {
      id: decoded.user_id,
      email: decoded.email,
      company_id: decoded.company_id ?? 1,
      is_super_admin: decoded.is_super_admin ?? false,
    };
    
    next();
  } catch (error) {
    console.error('❌ Error de verificación JWT:', error);
    res.status(401).json({ detail: 'Token inválido o expirado' });
    return;
  }
}
