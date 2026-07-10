import { Router, Request, Response } from 'express';
import { authenticateToken, AuthRequest } from '../middlewares/auth';
import { getInvoiceFile, saveInvoiceFile, getStorageInfo } from '../services/storage.service';
import multer from 'multer';
import path from 'path';
import fs from 'fs';

const router = Router();

// Configurar multer para guardar logos en la carpeta /uploads/logos/
const logoStorage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    const uploadDir = path.join(__dirname, '..', '..', 'uploads', 'logos');
    fs.mkdirSync(uploadDir, { recursive: true });
    cb(null, uploadDir);
  },
  filename: (req: any, file, cb) => {
    const companyId = req.user?.company_id || 'unknown';
    const ext = path.extname(file.originalname).toLowerCase() || '.png';
    cb(null, `logo-company-${companyId}${ext}`);
  },
});

const uploadLogo = multer({
  storage: logoStorage,
  limits: { fileSize: 5 * 1024 * 1024 }, // Máx 5MB
  fileFilter: (_req, file, cb) => {
    const allowed = ['image/jpeg', 'image/png', 'image/webp', 'image/svg+xml'];
    if (allowed.includes(file.mimetype)) cb(null, true);
    else cb(new Error('Solo se permiten imágenes (JPG, PNG, WEBP, SVG)'));
  },
});

// Subir logotipo de empresa
router.post('/logo', authenticateToken, uploadLogo.single('logo'), async (req: AuthRequest, res: Response) => {
  if (!req.user) return res.status(401).json({ detail: 'No autorizado' });
  if (!req.file) return res.status(400).json({ detail: 'No se recibió ningún archivo' });

  try {
    const prisma = (await import('../models/db')).default;

    // Construir URL pública del logo
    const protocol = req.protocol;
    const host = req.get('host');
    const logoUrl = `${protocol}://${host}/uploads/logos/${req.file.filename}`;

    // Actualizar logo_url en la empresa
    await prisma.company.update({
      where: { id: req.user.company_id },
      data: { logo_url: logoUrl },
    });

    return res.status(200).json({ success: true, logo_url: logoUrl });
  } catch (error: any) {
    return res.status(500).json({ detail: error.message });
  }
});

function extractSignedXml(invoice: any): string | null {
  if (invoice.dgii_signed_xml) return invoice.dgii_signed_xml;
  // Alanube guarda el XML firmado dentro de custom_fields
  if (invoice.custom_fields) {
    try {
      const cf = JSON.parse(invoice.custom_fields);
      if (cf.signed_xml) return cf.signed_xml;
      if (cf.dgii_response?.signedXml) return cf.dgii_response.signedXml;
    } catch {}
  }
  return null;
}

// Servir archivo de factura (XML o PDF)
router.get('/invoice/:invoiceId/:type', authenticateToken, async (req: AuthRequest, res: Response) => {
  if (!req.user) return res.status(401).json({ detail: 'No autorizado' });
  const invoiceId = parseInt(req.params.invoiceId, 10);
  const type = req.params.type as 'xml' | 'pdf' | 'signed_xml';
  if (isNaN(invoiceId) || !['xml', 'pdf', 'signed_xml'].includes(type)) {
    return res.status(400).json({ detail: 'Parámetros inválidos' });
  }
  try {
    const file = await getInvoiceFile(req.user.company_id, invoiceId, type);
    if (!file) return res.status(404).json({ detail: 'Archivo no encontrado' });
    res.setHeader('Content-Type', file.contentType);
    res.setHeader('Content-Disposition', `inline; filename="${invoiceId}_${type}.${type === 'pdf' ? 'pdf' : 'xml'}"`);
    file.stream.pipe(res);
  } catch (error: any) {
    return res.status(500).json({ detail: error.message });
  }
});

// Información del storage
router.get('/info', authenticateToken, async (_req: Request, res: Response) => {
  const info = getStorageInfo();
  return res.status(200).json(info);
});

// Backup de una factura específica
router.post('/backup/:invoiceId', authenticateToken, async (req: AuthRequest, res: Response) => {
  if (!req.user) return res.status(401).json({ detail: 'No autorizado' });
  const invoiceId = parseInt(req.params.invoiceId, 10);
  if (isNaN(invoiceId)) return res.status(400).json({ detail: 'ID inválido' });
  try {
    const prisma = (await import('../models/db')).default;
    const invoice = await prisma.invoice.findFirst({
      where: { id: invoiceId, company_id: req.user.company_id || undefined },
    });
    if (!invoice) return res.status(404).json({ detail: 'Factura no encontrada' });

    const results: string[] = [];
    const signedXml = extractSignedXml(invoice);
    if (signedXml) {
      await saveInvoiceFile(req.user.company_id, invoiceId, 'signed_xml', signedXml);
      results.push('signed_xml');
    }
    return res.status(200).json({ success: true, message: `Archivos guardados: ${results.join(', ') || 'ninguno (sin XML firmado)'}` });
  } catch (error: any) {
    return res.status(500).json({ detail: error.message });
  }
});

// Backup masivo de todas las facturas de la empresa
router.post('/backup-all', authenticateToken, async (req: AuthRequest, res: Response) => {
  if (!req.user) return res.status(401).json({ detail: 'No autorizado' });
  try {
    const prisma = (await import('../models/db')).default;
    const invoices = await prisma.invoice.findMany({
      where: { company_id: req.user.company_id },
      orderBy: { created_at: 'asc' },
    });

    let saved = 0;
    let skipped = 0;
    for (const inv of invoices) {
      const signedXml = extractSignedXml(inv);
      if (signedXml) {
        await saveInvoiceFile(req.user.company_id, inv.id, 'signed_xml', signedXml);
        saved++;
      } else {
        skipped++;
      }
    }

    return res.status(200).json({
      success: true,
      message: `Backup completado: ${saved} XML guardados, ${skipped} sin XML firmado`,
      total: invoices.length,
      saved,
      skipped,
    });
  } catch (error: any) {
    return res.status(500).json({ detail: error.message });
  }
});

export default router;
