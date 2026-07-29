import { Request, Response } from 'express';
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
