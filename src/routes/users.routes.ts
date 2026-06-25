import { Router } from 'express';
import { getMe, updatePassword, getUsers, createUser, updateUser, deleteUser } from '../controllers/users.controller';
import { authenticateToken, requireSuperAdmin } from '../middlewares/auth';

const router = Router();

router.get('/', authenticateToken, getUsers);
router.post('/', authenticateToken, requireSuperAdmin, createUser);
router.get('/me', authenticateToken, getMe);
router.put('/me/password', authenticateToken, updatePassword);
router.put('/:id', authenticateToken, updateUser);
router.delete('/:id', authenticateToken, requireSuperAdmin, deleteUser);

export default router;
