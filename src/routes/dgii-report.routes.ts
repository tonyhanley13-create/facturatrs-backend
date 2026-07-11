import { Router } from 'express';
import { authenticateToken } from '../middlewares/auth';
import { generateReport, getReport, downloadReportXml, downloadReportExcel, downloadReportTxt, listReports, deleteReport } from '../controllers/dgii-report.controller';

const router = Router();

router.post('/generate', authenticateToken, generateReport);
router.get('/list', authenticateToken, listReports);
router.get('/:type/:year/:month', authenticateToken, getReport);
router.get('/:type/:year/:month/download', authenticateToken, downloadReportXml);
router.get('/:type/:year/:month/excel', authenticateToken, downloadReportExcel);
router.get('/:type/:year/:month/txt', authenticateToken, downloadReportTxt);
router.delete('/:id', authenticateToken, deleteReport);

export default router;
