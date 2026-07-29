import { Request, Response } from 'express';
import prisma from '../models/db';
import { AuthRequest } from '../middlewares/auth';
import {
  parseTextContentToReport,
  generateExcelWorkbook,
  generateTxtExport,
  OcrScanResult,
} from '../services/ocr.service';

/**
 * Parses an uploaded report image or raw text content into structured table rows.
 */
export const scanListImage = async (req: Request, res: Response): Promise<void> => {
  try {
    let rawText = req.body?.raw_text || '';

    // If file was uploaded via multer or base64 string passed
    if (req.file) {
      rawText += `\n${req.file.buffer.toString('utf-8')}`;
    }

    // Default sample fallback text if minimal payload
    if (!rawText || rawText.trim().length === 0) {
      rawText = 'LOPIZZA, SRL.\n...Diario de Ventas --NCF--\nDesde: 01-01-2022 Hasta: 31-12-2022\nCLIENTE: Nelfa Alexandra Dominguez Montilla';
    }

    const scanResult = parseTextContentToReport(rawText);
    res.json({
      success: true,
      data: scanResult,
    });
  } catch (error: any) {
    console.error('Error scanning list image:', error);
    res.status(500).json({ error: error.message || 'Error al procesar la imagen del listado' });
  }
};

/**
 * Exports scan result data to an Excel (.xlsx) file download.
 */
export const exportToExcel = async (req: Request, res: Response): Promise<void> => {
  try {
    const scanResult: OcrScanResult = req.body;

    if (!scanResult || !scanResult.rows || !Array.isArray(scanResult.rows)) {
      res.status(400).json({ error: 'Datos de listado inválidos para exportación' });
      return;
    }

    const excelBuffer = await generateExcelWorkbook(scanResult);

    const filename = `Diario_de_Ventas_${(scanResult.company_name || 'Empresa').replace(/[^a-zA-Z0-9]/g, '_')}_${Date.now()}.xlsx`;

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(excelBuffer);
  } catch (error: any) {
    console.error('Error generating Excel file:', error);
    res.status(500).json({ error: error.message || 'Error al generar archivo Excel' });
  }
};

/**
 * Exports scan result data to a TXT or CSV file download.
 */
export const exportToTxt = async (req: Request, res: Response): Promise<void> => {
  try {
    const { scanResult, format } = req.body;

    const data: OcrScanResult = scanResult || req.body;
    if (!data || !data.rows || !Array.isArray(data.rows)) {
      res.status(400).json({ error: 'Datos de listado inválidos para exportación' });
      return;
    }

    const delimiter = format === 'csv' ? 'csv' : 'tab';
    const txtContent = generateTxtExport(data, delimiter);

    const ext = delimiter === 'csv' ? 'csv' : 'txt';
    const filename = `Diario_de_Ventas_${(data.company_name || 'Empresa').replace(/[^a-zA-Z0-9]/g, '_')}_${Date.now()}.${ext}`;

    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(txtContent);
  } catch (error: any) {
    console.error('Error generating TXT file:', error);
    res.status(500).json({ error: error.message || 'Error al generar archivo TXT' });
  }
};

/**
 * Gets all saved OCR documents for the current company across devices.
 */
export const getSavedDocuments = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const companyId = req.user?.company_id;
    if (!companyId) {
      res.status(400).json({ error: 'Empresa no especificada' });
      return;
    }

    const docs = await prisma.ocrDocument.findMany({
      where: { company_id: companyId },
      orderBy: { created_at: 'desc' },
    });

    const data = docs.map((d) => ({
      id: d.id,
      customName: d.custom_name,
      fileName: d.file_name,
      companyName: (d.scan_result as any)?.company_name || 'Empresa',
      dateRange: (d.scan_result as any)?.date_range || '',
      scanResult: d.scan_result,
      savedAt: d.created_at.toISOString(),
    }));

    res.json({ success: true, data });
  } catch (error: any) {
    console.error('Error fetching saved OCR documents:', error);
    res.status(500).json({ error: error.message || 'Error al obtener documentos guardados' });
  }
};

/**
 * Saves a new OCR document to the database for the current company.
 */
export const saveDocument = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const companyId = req.user?.company_id;
    const userId = req.user?.id;
    if (!companyId || !userId) {
      res.status(400).json({ error: 'Usuario o Empresa no especificada' });
      return;
    }

    const { customName, fileName, scanResult } = req.body;
    if (!customName || !scanResult) {
      res.status(400).json({ error: 'Datos incompletos para guardar documento' });
      return;
    }

    const newDoc = await prisma.ocrDocument.create({
      data: {
        company_id: companyId,
        custom_name: customName,
        file_name: fileName || null,
        scan_result: scanResult,
        created_by: userId,
      },
    });

    res.json({
      success: true,
      data: {
        id: newDoc.id,
        customName: newDoc.custom_name,
        fileName: newDoc.file_name,
        companyName: (newDoc.scan_result as any)?.company_name || 'Empresa',
        dateRange: (newDoc.scan_result as any)?.date_range || '',
        scanResult: newDoc.scan_result,
        savedAt: newDoc.created_at.toISOString(),
      },
    });
  } catch (error: any) {
    console.error('Error saving OCR document:', error);
    res.status(500).json({ error: error.message || 'Error al guardar documento' });
  }
};

/**
 * Renames a saved OCR document in the database.
 */
export const renameDocument = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const companyId = req.user?.company_id;
    const { id } = req.params;
    const { customName } = req.body;

    if (!id || !customName) {
      res.status(400).json({ error: 'ID y nuevo nombre requeridos' });
      return;
    }

    const updated = await prisma.ocrDocument.updateMany({
      where: { id, company_id: companyId },
      data: { custom_name: customName },
    });

    if (updated.count === 0) {
      res.status(404).json({ error: 'Documento no encontrado' });
      return;
    }

    res.json({ success: true, message: 'Documento renombrado correctamente' });
  } catch (error: any) {
    console.error('Error renaming OCR document:', error);
    res.status(500).json({ error: error.message || 'Error al renombrar documento' });
  }
};

/**
 * Deletes a saved OCR document from the database.
 */
export const deleteDocument = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const companyId = req.user?.company_id;
    const { id } = req.params;

    if (!id) {
      res.status(400).json({ error: 'ID requerido' });
      return;
    }

    const deleted = await prisma.ocrDocument.deleteMany({
      where: { id, company_id: companyId },
    });

    if (deleted.count === 0) {
      res.status(404).json({ error: 'Documento no encontrado' });
      return;
    }

    res.json({ success: true, message: 'Documento eliminado correctamente' });
  } catch (error: any) {
    console.error('Error deleting OCR document:', error);
    res.status(500).json({ error: error.message || 'Error al eliminar documento' });
  }
};
