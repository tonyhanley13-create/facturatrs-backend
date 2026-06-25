import { Router } from 'express';
import { authenticateToken, requireSuperAdmin } from '../middlewares/auth';
import * as dgiiController from '../controllers/dgii.controller';

const router = Router();

router.get('/test', authenticateToken, requireSuperAdmin, dgiiController.testConnection);
router.get('/company', authenticateToken, requireSuperAdmin, dgiiController.getCompanyInfo);
router.post('/company/configure', authenticateToken, requireSuperAdmin, dgiiController.configureCompany);
router.get('/certificate/info', authenticateToken, requireSuperAdmin, dgiiController.getCertificateInfo);
router.post('/invoice', authenticateToken, dgiiController.createInvoice);
router.post('/invoice/:invoice_id/transmit', authenticateToken, dgiiController.transmitInvoice);
router.get('/invoice/:track_id/status', authenticateToken, dgiiController.getStatus);
router.get('/customer-directory', authenticateToken, dgiiController.getCustomerDirectory);
router.post('/void', authenticateToken, requireSuperAdmin, dgiiController.voidEncf);
router.get('/invoices/status', authenticateToken, dgiiController.getBatchStatus);
router.post('/invoice/:invoice_id/reset', authenticateToken, dgiiController.resetInvoice);

export default router;
