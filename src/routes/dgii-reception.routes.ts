import { Router } from 'express';
import * as receptionController from '../controllers/dgii-reception.controller';
import { authenticateToken } from '../middlewares/auth';

const router = Router();

// Rutas públicas (llamadas por DGII)
router.post('/ecf/receive/:rnc', receptionController.receiveEcf);
router.post('/ecf/receive', receptionController.receiveEcf);
router.get('/ecf/approval', receptionController.commercialApproval);

// Rutas protegidas
router.get('/ecf/received', authenticateToken, receptionController.listReceived);
router.put('/ecf/received/:id/approve', authenticateToken, receptionController.approveDocument);

export default router;
