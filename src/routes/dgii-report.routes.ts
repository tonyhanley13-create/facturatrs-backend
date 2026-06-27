import { Router } from 'express';
import { authenticateToken } from '../middlewares/auth';
import { generateReport, getReport, downloadReportXml, listReports } from '../controllers/dgii-report.controller';

const router = Router();

router.post('/generate', authenticateToken, generateReport);
router.get('/list', authenticateToken, listReports);
router.get('/:type/:year/:month', authenticateToken, getReport);
router.get('/:type/:year/:month/download', authenticateToken, downloadReportXml);

export default router;
