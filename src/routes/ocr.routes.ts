import { Router } from 'express';
import multer from 'multer';
import { authenticateToken } from '../middlewares/auth';
import * as ocrController from '../controllers/ocr.controller';

const upload = multer({ storage: multer.memoryStorage() });
const router = Router();

router.post('/scan-list', authenticateToken, upload.single('file'), ocrController.scanListImage);
router.post('/export-excel', authenticateToken, ocrController.exportToExcel);
router.post('/export-txt', authenticateToken, ocrController.exportToTxt);

// Rutas de persistencia multi-dispositivo para documentos guardados
router.get('/saved-documents', authenticateToken, ocrController.getSavedDocuments);
router.post('/saved-documents', authenticateToken, ocrController.saveDocument);
router.put('/saved-documents/:id', authenticateToken, ocrController.renameDocument);
router.delete('/saved-documents/:id', authenticateToken, ocrController.deleteDocument);

export default router;
