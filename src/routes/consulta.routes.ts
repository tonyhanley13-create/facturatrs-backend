import { Router, Request, Response } from 'express';
import prisma from '../models/db';
import path from 'path';
import fs from 'fs';
import { Readable } from 'stream';
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';

const router = Router();

const STORAGE_PATH = process.env.STORAGE_PATH || path.join(process.cwd(), 'storage');
const CLOUD_ENABLED = process.env.CLOUD_STORAGE_ENABLED === 'true';

let s3Client: S3Client | null = null;
if (CLOUD_ENABLED && process.env.B2_ENDPOINT && process.env.B2_ACCESS_KEY && process.env.B2_SECRET_KEY) {
  s3Client = new S3Client({
    endpoint: process.env.B2_ENDPOINT,
    region: process.env.B2_REGION || 'us-west-004',
    credentials: {
      accessKeyId: process.env.B2_ACCESS_KEY,
      secretAccessKey: process.env.B2_SECRET_KEY,
    },
    forcePathStyle: true,
  });
}

function getRelativePathWithDate(companyId: number, invoiceId: number, type: 'xml' | 'pdf' | 'signed_xml', date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const ext = type === 'pdf' ? 'pdf' : 'xml';
  return `invoices/${companyId}/${year}/${month}/${invoiceId}_${type}.${ext}`;
}

async function getInvoiceFileWithDate(companyId: number, invoiceId: number, type: 'xml' | 'pdf' | 'signed_xml', date: Date) {
  const relativePath = getRelativePathWithDate(companyId, invoiceId, type, date);
  const absolutePath = path.join(STORAGE_PATH, relativePath);
  const contentType = type === 'pdf' ? 'application/pdf' : 'application/xml';

  if (fs.existsSync(absolutePath)) {
    return { stream: fs.createReadStream(absolutePath), contentType };
  }

  if (s3Client && process.env.B2_BUCKET) {
    try {
      const cmd = new GetObjectCommand({ Bucket: process.env.B2_BUCKET, Key: relativePath });
      const response = await s3Client.send(cmd);
      if (response.Body) {
        return { stream: response.Body as Readable, contentType };
      }
    } catch {
      return null;
    }
  }
  return null;
}

// Interfaz HTML común (Layout)
function getHtmlTemplate(bodyContent: string) {
  return `
    <!DOCTYPE html>
    <html lang="es">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Consulta Pública de e-CF - FacturaTRS</title>
      <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;600;800&display=swap" rel="stylesheet">
      <style>
        :root {
          --bg-color: #0b0f19;
          --panel-bg: rgba(17, 24, 39, 0.7);
          --border-color: rgba(255, 255, 255, 0.08);
          --accent-color: #0ddecb;
          --accent-hover: #0bbcb0;
          --text-primary: #ffffff;
          --text-secondary: #9ca3af;
        }
        
        * {
          box-sizing: border-box;
          margin: 0;
          padding: 0;
        }

        body {
          font-family: 'Outfit', sans-serif;
          background-color: var(--bg-color);
          background-image: 
            radial-gradient(at 10% 10%, rgba(13, 222, 203, 0.05) 0px, transparent 50%),
            radial-gradient(at 90% 90%, rgba(99, 102, 241, 0.05) 0px, transparent 50%);
          color: var(--text-primary);
          min-height: 100vh;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          padding: 20px;
        }

        .container {
          width: 100%;
          max-width: 600px;
          background: var(--panel-bg);
          backdrop-filter: blur(16px);
          -webkit-backdrop-filter: blur(16px);
          border: 1px solid var(--border-color);
          border-radius: 24px;
          padding: 40px;
          box-shadow: 0 20px 40px rgba(0, 0, 0, 0.5);
        }

        header {
          text-align: center;
          margin-bottom: 30px;
        }

        .logo {
          font-size: 28px;
          font-weight: 800;
          letter-spacing: -1px;
          background: linear-gradient(90deg, #0ddecb, #6366f1);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          margin-bottom: 8px;
        }

        h1 {
          font-size: 20px;
          font-weight: 600;
          color: var(--text-primary);
          margin-bottom: 6px;
        }

        .description {
          font-size: 14px;
          color: var(--text-secondary);
        }

        .form-group {
          margin-bottom: 20px;
        }

        label {
          display: block;
          font-size: 13px;
          font-weight: 600;
          color: var(--text-secondary);
          margin-bottom: 8px;
          text-transform: uppercase;
          letter-spacing: 0.5px;
        }

        input {
          width: 100%;
          padding: 14px 18px;
          background: rgba(255, 255, 255, 0.03);
          border: 1px solid var(--border-color);
          border-radius: 12px;
          color: var(--text-primary);
          font-family: inherit;
          font-size: 15px;
          transition: all 0.3s ease;
        }

        input:focus {
          outline: none;
          border-color: var(--accent-color);
          background: rgba(255, 255, 255, 0.05);
          box-shadow: 0 0 12px rgba(13, 222, 203, 0.15);
        }

        button {
          width: 100%;
          padding: 16px;
          background: linear-gradient(90deg, var(--accent-color), #4f46e5);
          border: none;
          border-radius: 12px;
          color: white;
          font-family: inherit;
          font-size: 16px;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.3s ease;
          box-shadow: 0 4px 15px rgba(13, 222, 203, 0.25);
        }

        button:hover {
          opacity: 0.95;
          transform: translateY(-1px);
          box-shadow: 0 6px 20px rgba(13, 222, 203, 0.35);
        }

        .alert {
          background: rgba(239, 68, 68, 0.1);
          border: 1px solid rgba(239, 68, 68, 0.2);
          color: #f87171;
          padding: 14px;
          border-radius: 12px;
          margin-bottom: 24px;
          font-size: 14px;
          text-align: center;
        }

        .result-card {
          margin-top: 20px;
          border-top: 1px solid var(--border-color);
          padding-top: 25px;
        }

        .result-item {
          display: flex;
          justify-content: space-between;
          margin-bottom: 12px;
          font-size: 14px;
        }

        .result-label {
          color: var(--text-secondary);
        }

        .result-value {
          font-weight: 600;
        }

        .btn-group {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 12px;
          margin-top: 25px;
        }

        .btn-download {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          padding: 14px;
          background: rgba(255, 255, 255, 0.05);
          border: 1px solid var(--border-color);
          border-radius: 12px;
          color: var(--text-primary);
          text-decoration: none;
          font-size: 14px;
          font-weight: 600;
          transition: all 0.3s ease;
          cursor: pointer;
        }

        .btn-download:hover {
          background: rgba(255, 255, 255, 0.08);
          border-color: var(--accent-color);
        }

        .btn-download.primary {
          background: rgba(13, 222, 203, 0.1);
          border-color: rgba(13, 222, 203, 0.2);
          color: var(--accent-color);
        }

        .btn-download.primary:hover {
          background: rgba(13, 222, 203, 0.15);
          border-color: var(--accent-color);
        }

        footer {
          margin-top: 30px;
          text-align: center;
          font-size: 12px;
          color: var(--text-secondary);
        }
      </style>
    </head>
    <body>
      <div class="container">
        ${bodyContent}
      </div>
      <footer>
        &copy; ${new Date().getFullYear()} FacturaTRS. Todos los derechos reservados.
      </footer>
    </body>
    </html>
  `;
}

// GET / - Formulario de búsqueda
router.get('/', (req: Request, res: Response) => {
  const formHtml = `
    <header>
      <div class="logo">FacturaTRS</div>
      <h1>Consulta Pública de e-CF</h1>
      <p class="description">Valide y descargue sus comprobantes fiscales electrónicos</p>
    </header>
    
    <form action="/consulta" method="POST">
      <div class="form-group">
        <label for="rnc">RNC Emisor *</label>
        <input type="text" id="rnc" name="rnc" placeholder="Ej. 132109122" required pattern="[0-9]{9,11}">
      </div>
      
      <div class="form-group">
        <label for="ncf">NCF Electrónico (e-CF) *</label>
        <input type="text" id="ncf" name="ncf" placeholder="Ej. E310000000001" required>
      </div>

      <div class="form-group">
        <label for="monto">Monto Total (RD$) *</label>
        <input type="number" step="0.01" id="monto" name="monto" placeholder="Ej. 1500.00" required>
      </div>

      <button type="submit">Buscar Comprobante</button>
    </form>
  `;
  return res.send(getHtmlTemplate(formHtml));
});

// POST / - Procesar consulta de e-CF
router.post('/', async (req: Request, res: Response) => {
  const { rnc, ncf, monto } = req.body;

  if (!rnc || !ncf || !monto) {
    const errorHtml = `
      <div class="alert">Por favor complete todos los campos obligatorios.</div>
      <a href="/consulta" class="btn-download" style="width: 100%;">Volver a buscar</a>
    `;
    return res.send(getHtmlTemplate(errorHtml));
  }

  try {
    // Buscar la factura en la base de datos coincidiendo con NCF y RNC del Emisor (Company)
    const invoice = await prisma.invoice.findFirst({
      where: {
        ncf: ncf.trim(),
        total_amount: parseFloat(monto),
        company: {
          rnc: rnc.trim()
        }
      },
      include: {
        company: true,
        client: true
      }
    });

    if (!invoice) {
      const notFoundHtml = `
        <header>
          <div class="logo">FacturaTRS</div>
          <h1>Comprobante No Encontrado</h1>
        </header>
        <div class="alert">No se encontró ningún comprobante electrónico que coincida con el RNC, NCF y monto especificados. Por favor revise sus datos.</div>
        <a href="/consulta" class="btn-download" style="width: 100%;">Volver a intentar</a>
      `;
      return res.send(getHtmlTemplate(notFoundHtml));
    }

    // Comprobante Encontrado - Mostrar detalles y descargas
    const successHtml = `
      <header>
        <div class="logo">FacturaTRS</div>
        <h1 style="color: var(--accent-color);">✓ e-CF Encontrado y Válido</h1>
        <p class="description">Los datos fiscales del comprobante se muestran a continuación</p>
      </header>

      <div class="result-card">
        <div class="result-item">
          <span class="result-label">Emisor</span>
          <span class="result-value">${invoice.company?.name || 'No disponible'}</span>
        </div>
        <div class="result-item">
          <span class="result-label">RNC Emisor</span>
          <span class="result-value">${invoice.company?.rnc || 'No disponible'}</span>
        </div>
        <div class="result-item">
          <span class="result-label">Receptor (Cliente)</span>
          <span class="result-value">${invoice.client.name}</span>
        </div>
        <div class="result-item">
          <span class="result-label">RNC/Cédula Receptor</span>
          <span class="result-value">${invoice.client.rnc}</span>
        </div>
        <div class="result-item">
          <span class="result-label">NCF Electrónico</span>
          <span class="result-value" style="color: var(--accent-color);">${invoice.ncf}</span>
        </div>
        <div class="result-item">
          <span class="result-label">Fecha Emisión</span>
          <span class="result-value">${new Date(invoice.created_at).toLocaleDateString('es-DO')}</span>
        </div>
        <div class="result-item" style="border-top: 1px dashed var(--border-color); padding-top: 12px; margin-top: 12px;">
          <span class="result-label" style="font-size: 16px; font-weight: 600; color: var(--text-primary);">Monto Total</span>
          <span class="result-value" style="font-size: 18px; color: var(--accent-color);">RD$ ${Number(invoice.total_amount).toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
        </div>

        <div class="btn-group">
          <a href="/consulta/descargar/${invoice.id}/signed_xml" class="btn-download primary" target="_blank">
            💾 Descargar XML
          </a>
          <a href="/consulta/descargar/${invoice.id}/pdf" class="btn-download" target="_blank">
            📄 Descargar PDF
          </a>
        </div>
        
        <a href="/consulta" class="btn-download" style="width: 100%; margin-top: 15px;">Nueva Consulta</a>
      </div>
    `;
    return res.send(getHtmlTemplate(successHtml));

  } catch (error: any) {
    const errorHtml = `
      <div class="alert">Ocurrió un error en el servidor al consultar: ${error.message}</div>
      <a href="/consulta" class="btn-download" style="width: 100%;">Volver a buscar</a>
    `;
    return res.send(getHtmlTemplate(errorHtml));
  }
});

// Descargar XML o PDF de forma pública
router.get('/descargar/:invoiceId/:type', async (req: Request, res: Response) => {
  const invoiceId = parseInt(req.params.invoiceId, 10);
  const type = req.params.type as 'xml' | 'pdf' | 'signed_xml';

  if (isNaN(invoiceId) || !['xml', 'pdf', 'signed_xml'].includes(type)) {
    return res.status(400).send('Parámetros inválidos');
  }

  try {
    const invoice = await prisma.invoice.findUnique({
      where: { id: invoiceId },
      include: { company: true }
    });

    if (!invoice) {
      return res.status(404).send('Comprobante no encontrado');
    }

    if (type === 'signed_xml') {
      const xmlContent = invoice.dgii_signed_xml;
      if (!xmlContent) {
        return res.status(404).send('XML firmado no disponible para este comprobante');
      }
      res.setHeader('Content-Type', 'application/xml');
      res.setHeader('Content-Disposition', `attachment; filename="${invoice.ncf || 'comprobante'}.xml"`);
      return res.send(xmlContent);
    }

    // Para PDF o XML genérico, buscar en el storage usando la fecha exacta de creación
    if (!invoice.company_id) {
      return res.status(400).send('ID de empresa ausente');
    }

    const file = await getInvoiceFileWithDate(invoice.company_id, invoice.id, type, invoice.created_at);
    if (!file) {
      return res.status(404).send('El archivo solicitado no se encuentra en el servidor');
    }

    res.setHeader('Content-Type', file.contentType);
    res.setHeader('Content-Disposition', `attachment; filename="${invoice.ncf || invoice.id}_${type}.${type === 'pdf' ? 'pdf' : 'xml'}"`);
    file.stream.pipe(res);

  } catch (error: any) {
    return res.status(500).send(`Error de servidor al descargar archivo: ${error.message}`);
  }
});

export default router;
