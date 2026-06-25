import { Router } from 'express';
import * as contingencyController from '../controllers/dgii-contingency.controller';
import { authenticateToken } from '../middlewares/auth';

const router = Router();

router.post('/send', authenticateToken, contingencyController.sendInvoiceWithContingency);
router.post('/resend', authenticateToken, contingencyController.resendContingency);
router.get('/list', authenticateToken, contingencyController.listContingency);

export default router;
