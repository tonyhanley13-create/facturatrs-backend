import { Router } from 'express';
import { createInvoiceStandard, listInvoicesStandard } from '../controllers/invoices.controller';
import { authenticateToken } from '../middlewares/auth';

const router = Router();

router.post('/', authenticateToken, createInvoiceStandard);
router.get('/', authenticateToken, listInvoicesStandard);

export default router;
