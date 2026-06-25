import { Response } from 'express';
import prisma from '../models/db';
import { AuthRequest } from '../middlewares/auth';
import { Decimal } from '@prisma/client/runtime/library';

export async function createInvoiceStandard(req: AuthRequest, res: Response) {
  if (!req.user) {
    return res.status(401).json({ detail: 'No autorizado' });
  }

  const { client_id, description, amount } = req.body;

  if (!client_id || !description || amount === undefined) {
    return res.status(400).json({ detail: 'client_id, description y amount son requeridos' });
  }

  try {
    const client = await prisma.client.findFirst({
      where: { id: Number(client_id), company_id: req.user.is_super_admin ? undefined : req.user.company_id },
    });

    if (!client) {
      return res.status(404).json({ detail: 'Cliente no encontrado' });
    }

    // Generar número de factura
    const lastInvoice = await prisma.invoice.findFirst({
      where: { company_id: req.user.is_super_admin ? undefined : req.user.company_id },
      orderBy: { id: 'desc' },
    });
    let nextNum = 1;
    if (lastInvoice) {
      const parts = lastInvoice.invoice_number.split('-');
      if (parts.length > 1) {
        const num = parseInt(parts[1], 10);
        if (!isNaN(num)) nextNum = num + 1;
      }
    }
    const invoiceNumber = `FACT-${nextNum.toString().padStart(6, '0')}`;

    // Simular envío a Alanube sandbox (como en invoices.py original)
    const ncf = 'B010000001';
    const status = 'issued';

    const invoice = await prisma.invoice.create({
      data: {
        user_id: req.user.id,
        company_id: req.user.company_id,
        client_id: client.id,
        invoice_number: invoiceNumber,
        description,
        amount: new Decimal(amount),
        subtotal: new Decimal(amount),
        tax_amount: new Decimal(0),
        discount_amount: new Decimal(0),
        total_amount: new Decimal(amount),
        currency: 'DOP',
        status,
        ncf,
      },
    });

    return res.status(200).json({
      id: invoice.id,
      client_id: invoice.client_id,
      description: invoice.description,
      amount: Number(invoice.amount),
      status: invoice.status,
    });
  } catch (error: any) {
    console.error('❌ Error al crear factura estándar:', error);
    return res.status(500).json({ detail: error.message });
  }
}

export async function listInvoicesStandard(req: AuthRequest, res: Response) {
  if (!req.user) {
    return res.status(401).json({ detail: 'No autorizado' });
  }

  try {
    const invoices = await prisma.invoice.findMany({
      where: { company_id: req.user.is_super_admin ? undefined : req.user.company_id },
    });

    return res.status(200).json(
      invoices.map((inv) => ({
        id: inv.id,
        client_id: inv.client_id,
        description: inv.description,
        amount: Number(inv.amount),
        status: inv.status,
        ncf: inv.ncf,
        custom_fields: inv.custom_fields,
      }))
    );
  } catch (error: any) {
    console.error('❌ Error al listar facturas estándar:', error);
    return res.status(500).json({ detail: error.message });
  }
}
