import { Router } from 'express';
import { authenticateToken } from '../middlewares/auth';
import * as certController from '../controllers/certificacion.controller';

const router = Router();

router.get('/status', authenticateToken, certController.getStatus);
router.post('/start', authenticateToken, certController.startCertification);
router.post('/step/:step', authenticateToken, certController.updateStep);
router.post('/cancel', authenticateToken, certController.cancelCertification);
router.get('/postulation-xml', authenticateToken, certController.getPostulationXml);
router.post('/postulation-sign', authenticateToken, certController.submitPostulationSigned);
router.post('/generate-declaration', authenticateToken, certController.generateDeclaration);
router.post('/submit-declaration', authenticateToken, certController.submitDeclaration);
router.post('/verify-rnc', authenticateToken, certController.verifyRnc);
router.post('/complete', authenticateToken, certController.completeCertification);

export default router;
