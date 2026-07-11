import { Response } from 'express';
import prisma from '../models/db';
import { AuthRequest } from '../middlewares/auth';
import axios from 'axios';

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

export async function scanPurchaseImage(req: AuthRequest, res: Response) {
  if (!req.user) return res.status(401).json({ detail: 'No autorizado' });
  if (!req.file) return res.status(400).json({ detail: 'No se subió ninguna imagen' });

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return res.status(400).json({ detail: 'GEMINI_API_KEY no está configurado en el archivo .env del servidor' });
  }

  try {
    const base64Image = req.file.buffer.toString('base64');
    const mimeType = req.file.mimetype;

    const prompt = `Analiza esta factura de República Dominicana y extrae la información en formato JSON.
Devuelve obligatoriamente un objeto JSON con esta estructura exacta y completa (asegúrate de cerrar el objeto con } al final):
{
  "rnc_proveedor": "RNC del emisor/proveedor de 9 o 11 dígitos sin guiones ni espacios",
  "nombre_proveedor": "Nombre comercial o razón social del emisor",
  "ncf": "NCF de la factura (comprobante fiscal que empieza con B o E y tiene 8 o 10 dígitos numéricos)",
  "fecha": "Fecha de emisión en formato YYYY-MM-DD",
  "monto_total": 0.0,
  "itbis": 0.0,
  "tipo_comprobante": "Código de 2 dígitos de clasificación del gasto del reporte 606 (ej: '02' para trabajos/servicios, '01' para personal, '09' para costo de venta, etc.)"
}`;

    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent?key=${apiKey}`;

    const payload = {
      contents: [
        {
          parts: [
            { text: prompt },
            {
              inlineData: {
                mimeType: mimeType,
                data: base64Image,
              },
            },
          ],
        },
      ],
      generationConfig: {
        responseMimeType: 'application/json',
      },
    };

    let response: any = null;
    let attempts = 0;
    const maxAttempts = 3;

    while (attempts < maxAttempts) {
      try {
        console.log(`🤖 Enviando imagen de factura a Gemini API (Intento ${attempts + 1}/${maxAttempts})...`);
        response = await axios.post(url, payload, {
          headers: {
            'Content-Type': 'application/json',
          },
          timeout: 45000,
        });
        break;
      } catch (error: any) {
        attempts++;
        const is503 = error?.response?.status === 503 || error?.response?.data?.error?.code === 503;
        if (is503 && attempts < maxAttempts) {
          console.log('⚠️ Gemini API 503 (Servicio no disponible temporalmente). Reintentando en 2 segundos...');
          await new Promise((resolve) => setTimeout(resolve, 2000));
        } else {
          throw error;
        }
      }
    }

    let text = response?.data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) {
      throw new Error('Gemini no devolvió texto de respuesta');
    }

    console.log('🤖 Respuesta de Gemini:', text);
    text = text.trim();

    // Extraer contenido si está envuelto en bloque de código markdown ```json ... ```
    const markdownRegex = /```(?:json)?\s*([\s\S]*?)\s*```/i;
    const match = text.match(markdownRegex);
    if (match) {
      text = match[1].trim();
    }

    // Intentar reparar si falta la llave de cierre al final por truncado
    if (!text.endsWith('}')) {
      console.log('⚠️ Detectado JSON truncado. Intentando reparar...');
      if (text.endsWith('"') || text.match(/\d$/) || text.endsWith('true') || text.endsWith('false') || text.endsWith('null')) {
        text += '\n}';
      } else if (text.endsWith(',')) {
        text = text.slice(0, -1) + '\n}';
      } else {
        text += '\n}';
      }
      console.log('🤖 JSON Reparado:', text);
    }

    const parsedData = JSON.parse(text);

    return res.status(200).json(parsedData);
  } catch (error: any) {
    console.error('❌ Error en el escaneo con Gemini:', error?.response?.data || error.message);
    const details = error?.response?.data?.error?.message || error.message;
    return res.status(500).json({ detail: `Error al procesar la imagen con Gemini: ${details}` });
  }
}
// reload env
