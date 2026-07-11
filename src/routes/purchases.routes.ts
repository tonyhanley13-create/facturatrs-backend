import { Router } from 'express';
import multer from 'multer';
import { listPurchases, createPurchase, updatePurchase, deletePurchase, scanPurchaseImage } from '../controllers/purchases.controller';
import { authenticateToken } from '../middlewares/auth';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
});

const router = Router();

router.get('/', authenticateToken, listPurchases);
router.post('/', authenticateToken, createPurchase);
router.put('/:id', authenticateToken, updatePurchase);
router.delete('/:id', authenticateToken, deletePurchase);
router.post('/scan', authenticateToken, upload.single('image'), scanPurchaseImage);

export default router;
