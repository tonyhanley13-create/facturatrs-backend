import { Router } from 'express';
import { listPurchases, createPurchase, updatePurchase, deletePurchase } from '../controllers/purchases.controller';
import { authenticateToken } from '../middlewares/auth';

const router = Router();

router.get('/', authenticateToken, listPurchases);
router.post('/', authenticateToken, createPurchase);
router.put('/:id', authenticateToken, updatePurchase);
router.delete('/:id', authenticateToken, deletePurchase);

export default router;
