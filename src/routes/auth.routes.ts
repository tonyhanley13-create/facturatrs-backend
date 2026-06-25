import { Router } from 'express';
import { register, login, verifyToken, listCompanies, switchCompany, createCompany, listTemplateData, deleteCompany, updateFiscalProvider, searchCompanies } from '../controllers/auth.controller';
import { importFromChel } from '../controllers/chel.controller';
import { authenticateToken } from '../middlewares/auth';

const router = Router();

router.post('/register', register);
router.post('/login', login);
router.get('/verify', authenticateToken, verifyToken);
router.get('/companies', authenticateToken, listCompanies);
router.post('/companies/switch', authenticateToken, switchCompany);
router.post('/companies/create', authenticateToken, createCompany);
router.get('/companies/template-data', authenticateToken, listTemplateData);
router.delete('/companies/:id', authenticateToken, deleteCompany);
router.put('/companies/:id/fiscal-provider', authenticateToken, updateFiscalProvider);
router.get('/companies/search', searchCompanies);
router.post('/companies/import-chel', authenticateToken, importFromChel);

export default router;
