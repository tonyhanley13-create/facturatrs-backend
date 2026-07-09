import { Response } from 'express';
import prisma from '../models/db';
import { AuthRequest } from '../middlewares/auth';

export async function createClient(req: AuthRequest, res: Response) {
  if (!req.user) {
    return res.status(401).json({ detail: 'No autorizado' });
  }

  const { name, rnc, phone, address, contact_person, email, client_type, tax_id, custom_fields } = req.body;

  if (!name || !rnc) {
    return res.status(400).json({ detail: 'Nombre y RNC son campos obligatorios' });
  }

  try {
    const newClient = await prisma.client.create({
      data: {
        user_id: req.user.id,
        company_id: req.user.company_id,
        name,
        rnc,
        phone,
        address,
        contact_person,
        email,
        client_type: client_type || 'individual',
        tax_id,
        custom_fields: custom_fields ? JSON.stringify(custom_fields) : null,
      },
    });

    return res.status(200).json({
      ...newClient,
      custom_fields: newClient.custom_fields ? JSON.parse(newClient.custom_fields) : null,
    });
  } catch (error: any) {
    console.error('❌ Error al crear cliente:', error);
    return res.status(500).json({ detail: `Error interno al crear cliente: ${error.message}` });
  }
}

export async function listClients(req: AuthRequest, res: Response) {
  if (!req.user) {
    return res.status(401).json({ detail: 'No autorizado' });
  }

  try {
    const clients = await prisma.client.findMany({
      where: {
        company_id: req.user.company_id || undefined,
      },
    });

    const formattedClients = clients.map((c) => ({
      ...c,
      custom_fields: c.custom_fields ? JSON.parse(c.custom_fields) : null,
    }));

    return res.status(200).json(formattedClients);
  } catch (error: any) {
    console.error('❌ Error al listar clientes:', error);
    return res.status(500).json({ detail: `Error interno al listar clientes: ${error.message}` });
  }
}

export async function getClient(req: AuthRequest, res: Response) {
  if (!req.user) {
    return res.status(401).json({ detail: 'No autorizado' });
  }

  const clientId = parseInt(req.params.client_id, 10);

  if (isNaN(clientId)) {
    return res.status(400).json({ detail: 'ID de cliente inválido' });
  }

  try {
    const client = await prisma.client.findFirst({
      where: {
        id: clientId,
        company_id: req.user.company_id || undefined,
      },
    });

    if (!client) {
      return res.status(404).json({ detail: 'Cliente no encontrado' });
    }

    return res.status(200).json({
      ...client,
      custom_fields: client.custom_fields ? JSON.parse(client.custom_fields) : null,
    });
  } catch (error: any) {
    console.error('❌ Error al obtener cliente:', error);
    return res.status(500).json({ detail: `Error interno al obtener cliente: ${error.message}` });
  }
}

export async function updateClient(req: AuthRequest, res: Response) {
  if (!req.user) {
    return res.status(401).json({ detail: 'No autorizado' });
  }

  const clientId = parseInt(req.params.client_id, 10);
  if (isNaN(clientId)) {
    return res.status(400).json({ detail: 'ID de cliente inválido' });
  }

  const { name, rnc, phone, address, contact_person, email, client_type, tax_id, custom_fields } = req.body;

  try {
    // Verificar si el cliente existe y pertenece a la empresa
    const client = await prisma.client.findFirst({
      where: {
        id: clientId,
        company_id: req.user.company_id || undefined,
      },
    });

    if (!client) {
      return res.status(404).json({ detail: 'Cliente no encontrado' });
    }

    const updatedClient = await prisma.client.update({
      where: { id: clientId },
      data: {
        name: name !== undefined ? name : client.name,
        rnc: rnc !== undefined ? rnc : client.rnc,
        phone: phone !== undefined ? phone : client.phone,
        address: address !== undefined ? address : client.address,
        contact_person: contact_person !== undefined ? contact_person : client.contact_person,
        email: email !== undefined ? email : client.email,
        client_type: client_type !== undefined ? client_type : client.client_type,
        tax_id: tax_id !== undefined ? tax_id : client.tax_id,
        custom_fields: custom_fields !== undefined ? (custom_fields ? JSON.stringify(custom_fields) : null) : client.custom_fields,
      },
    });

    return res.status(200).json({
      ...updatedClient,
      custom_fields: updatedClient.custom_fields ? JSON.parse(updatedClient.custom_fields) : null,
    });
  } catch (error: any) {
    console.error('❌ Error al actualizar cliente:', error);
    return res.status(500).json({ detail: `Error interno al actualizar cliente: ${error.message}` });
  }
}

export async function deleteClient(req: AuthRequest, res: Response) {
  if (!req.user) {
    return res.status(401).json({ detail: 'No autorizado' });
  }

  const clientId = parseInt(req.params.client_id, 10);
  if (isNaN(clientId)) {
    return res.status(400).json({ detail: 'ID de cliente inválido' });
  }

  try {
    const client = await prisma.client.findFirst({
      where: {
        id: clientId,
        company_id: req.user.company_id || undefined,
      },
    });

    if (!client) {
      return res.status(404).json({ detail: 'Cliente no encontrado' });
    }

    await prisma.client.delete({
      where: { id: clientId },
    });

    return res.status(200).json({ detail: 'Cliente eliminado correctamente' });
  } catch (error: any) {
    console.error('❌ Error al eliminar cliente:', error);
    return res.status(500).json({ detail: `Error interno al eliminar cliente: ${error.message}` });
  }
}
