import { Router } from 'express';
import { authenticateToken } from '../middlewares/auth';
import { generateReport, getReport, downloadReportXml, downloadReportExcel, downloadReportTxt, listReports, deleteReport } from '../controllers/dgii-report.controller';

const router = Router();

router.post('/generate', authenticateToken, generateReport);
router.get('/list', authenticateToken, listReports);
// Rutas específicas PRIMERO para evitar que /:type/:year/:month las intercepte
router.get('/:type/:year/:month/download', authenticateToken, downloadReportXml);
router.get('/:type/:year/:month/excel', authenticateToken, downloadReportExcel);
router.get('/:type/:year/:month/txt', authenticateToken, downloadReportTxt);
// Ruta genérica AL FINAL
router.get('/:type/:year/:month', authenticateToken, getReport);
router.delete('/:id', authenticateToken, deleteReport);

export default router;
