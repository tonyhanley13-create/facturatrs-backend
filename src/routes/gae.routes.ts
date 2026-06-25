import { Router } from 'express';
import multer from 'multer';
import { authenticateToken, requireSuperAdmin } from '../middlewares/auth';
import * as gaeController from '../controllers/gae.controller';

const router = Router();
const upload = multer();

router.get('/eco', authenticateToken, gaeController.ecoCheck);
router.get('/company', authenticateToken, requireSuperAdmin, gaeController.getCompanyInfo);
router.post('/company/configure', authenticateToken, requireSuperAdmin, gaeController.configureCompany);
router.put('/company', authenticateToken, requireSuperAdmin, gaeController.updateCompany);
router.delete('/company', authenticateToken, requireSuperAdmin, gaeController.deleteCompany);
router.post('/invoice', authenticateToken, gaeController.createInvoice);
router.post('/invoice/:invoice_id/transmit', authenticateToken, gaeController.transmitInvoice);
router.get('/invoice/info', authenticateToken, gaeController.getInvoiceInfo);
router.get('/invoice/status', authenticateToken, gaeController.getInvoiceStatus);
router.post('/sign', authenticateToken, requireSuperAdmin, upload.single('file'), gaeController.signFile);
router.post('/commercial-approval', authenticateToken, requireSuperAdmin, gaeController.createCommercialApproval);
router.get('/commercial-approval/info', authenticateToken, requireSuperAdmin, gaeController.getApprovalCommercialInfo);

export default router;
