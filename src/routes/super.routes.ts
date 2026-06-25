import { Router } from 'express';
import { authenticateToken } from '../middlewares/auth';
import {
  getSuperUsers,
  getSuperStats,
  updateUserRole,
  deleteSuperUser,
  clearAllData,
  seedSuperAdmin,
  resetSequences,
  clearIssuedInvoices,
} from '../controllers/super.controller';

const router = Router();

router.get('/stats', authenticateToken, getSuperStats);
router.get('/users', authenticateToken, getSuperUsers);
router.put('/users/:id/role', authenticateToken, updateUserRole);
router.delete('/users/:id', authenticateToken, deleteSuperUser);
router.post('/clear-all', authenticateToken, clearAllData);
router.post('/seed', seedSuperAdmin);
router.post('/reset-sequences', authenticateToken, resetSequences);
router.post('/clear-issued-invoices', authenticateToken, clearIssuedInvoices);

export default router;
