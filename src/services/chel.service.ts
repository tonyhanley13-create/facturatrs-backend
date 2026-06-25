import sql from 'mssql';
import prisma from '../models/db';

const CHELO_CONFIG: sql.config = {
  server: 'localhost',
  database: 'CHELO',
  options: {
    trustedConnection: true,
    trustServerCertificate: true,
  },
  authentication: { type: 'ntlm', options: { domain: '', userName: '', password: '' } },
};

let pool: sql.ConnectionPool | null = null;

async function getPool(): Promise<sql.ConnectionPool> {
  if (!pool) {
    pool = await sql.connect(CHELO_CONFIG);
  }
  return pool;
}

export interface ChelClient {
  codigo: string;
  nombre: string;
  rnc: string | null;
  direccion: string | null;
  telefono1: string | null;
  email: string | null;
  contacto: string | null;
  inactivo: boolean | null;
}

export interface ChelProduct {
  codigo: string;
  nombre: string;
  precio1: number | null;
  servicio: boolean | null;
  inactivo: boolean | null;
  grupo: string | null;
}

export async function fetchClients(): Promise<ChelClient[]> {
  const p = await getPool();
  const result = await p.request().query(`SELECT codigo, nombre, rnc, direccion, telefono1, email, contacto, inactivo FROM clientes`);
  return result.recordset;
}

export async function fetchProducts(): Promise<ChelProduct[]> {
  const p = await getPool();
  const result = await p.request().query(`SELECT codigo, nombre, precio1, servicio, inactivo, grupo FROM mercs`);
  return result.recordset;
}

export async function importClientsToCompany(companyId: number, userId: number): Promise<number> {
  const chelClients = await fetchClients();
  let imported = 0;

  for (const c of chelClients) {
    if (c.inactivo) continue;
    const name = c.nombre?.trim();
    if (!name) continue;

    const exists = await prisma.client.findFirst({
      where: { company_id: companyId, rnc: c.rnc?.trim() || '' },
    });
    if (exists) continue;

    await prisma.client.create({
      data: {
        user_id: userId,
        company_id: companyId,
        name,
        rnc: c.rnc?.trim() || '000000000',
        address: c.direccion?.trim() || null,
        phone: c.telefono1?.trim() || null,
        email: c.email?.trim() || null,
        contact_person: c.contacto?.trim() || null,
      },
    });
    imported++;
  }
  return imported;
}

export async function importProductsToCompany(companyId: number, userId: number): Promise<number> {
  const chelProducts = await fetchProducts();
  let imported = 0;

  for (const p of chelProducts) {
    if (p.inactivo) continue;
    const name = p.nombre?.trim();
    if (!name) continue;

    const exists = await prisma.productService.findFirst({
      where: { company_id: companyId, name },
    });
    if (exists) continue;

    await prisma.productService.create({
      data: {
        user_id: userId,
        company_id: companyId,
        code: p.codigo?.trim() || null,
        name,
        unit_price: p.precio1 || 0,
        type: p.servicio ? 'service' : 'product',
        is_active: true,
      },
    });
    imported++;
  }
  return imported;
}

export async function closeCheloConnection(): Promise<void> {
  if (pool) {
    await pool.close();
    pool = null;
  }
}
