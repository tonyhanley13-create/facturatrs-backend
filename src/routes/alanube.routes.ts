import { Router } from 'express';
import {
  validateConnection, testConnectionNoAuth, getCompany, updateCompany, createCompany,
  createInvoice, transmitInvoice,
  checkInvoiceStatus, notifyInvoice,
  createCancellation, checkCancellations,
  getReceivedDocuments, createCommercialResponse,
  getReceivedCommercialApprovals, getGeneratedCommercialApprovals,
  getExternalAcknowledgments, getInternalAcknowledgments,
  checkDgiiStatus, checkDirectory, getProviderInfo,
  getTotalEmittedDocuments, getTotalAcceptedDocuments, getTotalDocumentsByCompany,
  signDocument, createTestSet, checkTestSet,
  receiveDocumentFromDgii,
} from '../controllers/alanube.controller';
import { authenticateToken, requireSuperAdmin } from '../middlewares/auth';

const router = Router();

// Conexión / Compañía
router.get('/validate', authenticateToken, requireSuperAdmin, validateConnection);
router.get('/test-connection', testConnectionNoAuth);
router.get('/company', authenticateToken, requireSuperAdmin, getCompany);
router.put('/company', authenticateToken, requireSuperAdmin, updateCompany);
router.post('/company', authenticateToken, requireSuperAdmin, createCompany);

// Facturación (crear y transmitir)
router.post('/invoice', authenticateToken, createInvoice);
router.post('/invoice/:invoice_id/transmit', authenticateToken, transmitInvoice);

// Estado de documentos
router.get('/invoice/status', authenticateToken, checkInvoiceStatus);

// Notificar por correo
router.post('/invoice/notify', authenticateToken, notifyInvoice);

// Anulaciones
router.post('/cancelations', authenticateToken, requireSuperAdmin, createCancellation);
router.get('/cancelations', authenticateToken, requireSuperAdmin, checkCancellations);

// Documentos recibidos
router.get('/received-documents', authenticateToken, requireSuperAdmin, getReceivedDocuments);
router.post('/received-documents/:documentId/commercial-response', authenticateToken, requireSuperAdmin, createCommercialResponse);
router.post('/received-documents/:documentId/commercial-response/:idCompany', authenticateToken, requireSuperAdmin, createCommercialResponse);

// Aprobaciones comerciales
router.get('/received-commercial-approvals', authenticateToken, requireSuperAdmin, getReceivedCommercialApprovals);
router.get('/commercial-approvals', authenticateToken, requireSuperAdmin, getGeneratedCommercialApprovals);

// Acuses de recibo
router.get('/acknowledgments/external', authenticateToken, requireSuperAdmin, getExternalAcknowledgments);
router.get('/acknowledgments/internal', authenticateToken, requireSuperAdmin, getInternalAcknowledgments);

// Estado DGII
router.get('/dgii-status', authenticateToken, requireSuperAdmin, checkDgiiStatus);

// Directorio de compañías
router.get('/directory', authenticateToken, requireSuperAdmin, checkDirectory);

// Información del proveedor
router.get('/provider-info', authenticateToken, requireSuperAdmin, getProviderInfo);

// Totales / estadísticas de documentos
router.get('/totals/emitted', authenticateToken, requireSuperAdmin, getTotalEmittedDocuments);
router.get('/totals/accepted', authenticateToken, requireSuperAdmin, getTotalAcceptedDocuments);
router.get('/totals/company/:idCompany', authenticateToken, requireSuperAdmin, getTotalDocumentsByCompany);

// Certificación / Firmar documentos
router.post('/certification/sign', authenticateToken, requireSuperAdmin, signDocument);
router.post('/certification/sign/:companyId', authenticateToken, requireSuperAdmin, signDocument);

// Set de pruebas
router.post('/test-set', authenticateToken, requireSuperAdmin, createTestSet);
router.get('/test-set', authenticateToken, requireSuperAdmin, checkTestSet);

// Simular recepción DGII (pruebas)
router.post('/reception-dgii/receive', authenticateToken, requireSuperAdmin, receiveDocumentFromDgii);

export default router;
