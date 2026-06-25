import { Router } from 'express';
import { createClient, listClients, getClient, updateClient, deleteClient } from '../controllers/clients.controller';
import { authenticateToken } from '../middlewares/auth';

const router = Router();

router.post('/', authenticateToken, createClient);
router.get('/', authenticateToken, listClients);
router.get('/:client_id', authenticateToken, getClient);
router.put('/:client_id', authenticateToken, updateClient);
router.delete('/:client_id', authenticateToken, deleteClient);

export default router;
