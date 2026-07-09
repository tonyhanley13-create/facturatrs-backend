import { Router } from 'express';
import { authenticateToken } from '../middlewares/auth';
import * as certController from '../controllers/certificacion.controller';

const router = Router();

router.get('/status', authenticateToken, certController.getStatus);
router.post('/start', authenticateToken, certController.startCertification);
router.post('/step/:step', authenticateToken, certController.updateStep);
router.post('/cancel', authenticateToken, certController.cancelCertification);

// Paso 1: Pre-requisitos
router.post('/verify-prerequisites', authenticateToken, certController.verifyPrerequisites);

// Paso 12: Postulación
router.get('/postulation-xml', authenticateToken, certController.getPostulationXml);
router.post('/postulation-sign', authenticateToken, certController.submitPostulationSigned);
router.post('/generate-postulation-xml', authenticateToken, certController.generatePostulationXml);

// Paso 13: Declaración Jurada
router.post('/generate-declaration', authenticateToken, certController.generateDeclaration);
router.post('/submit-declaration', authenticateToken, certController.submitDeclaration);

// Paso 14: Verificación RNC
router.post('/verify-rnc', authenticateToken, certController.verifyRnc);

// Paso 5: Transmitir lote de prueba
router.post('/transmit-test-ecfs', authenticateToken, certController.transmitTestEcfs);

// Paso 15: Completar certificación
router.post('/complete', authenticateToken, certController.completeCertification);

export default router;
