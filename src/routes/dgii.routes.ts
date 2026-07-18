import { Router } from 'express';
import { authenticateToken, requireSuperAdmin } from '../middlewares/auth';
import * as dgiiController from '../controllers/dgii.controller';

const router = Router();

router.get('/test', authenticateToken, requireSuperAdmin, dgiiController.testConnection);
router.get('/company', authenticateToken, dgiiController.getCompanyInfo);
router.post('/company/configure', authenticateToken, dgiiController.configureCompany);
router.get('/certificate/info', authenticateToken, dgiiController.getCertificateInfo);
router.post('/invoice', authenticateToken, dgiiController.createInvoice);
router.post('/invoice/:invoice_id/transmit', authenticateToken, dgiiController.transmitInvoice);
router.get('/invoice/:track_id/status', authenticateToken, dgiiController.getStatus);
router.get('/customer-directory', authenticateToken, dgiiController.getCustomerDirectory);
router.post('/void', authenticateToken, requireSuperAdmin, dgiiController.voidEncf);
router.get('/invoices/status', authenticateToken, dgiiController.getBatchStatus);
router.post('/invoice/:invoice_id/reset', authenticateToken, dgiiController.resetInvoice);
router.get('/rnc/validate', authenticateToken, dgiiController.validateRncController);
router.get('/buyer-type', authenticateToken, dgiiController.getBuyerType);

export default router;
