import { Router } from 'express';
import {
  getCompanySettings,
  updateCompanySettings,
  updateInvoicingMode,
  getProducts,
  createProduct,
  updateProduct,
  deleteProduct,
  getInvoices,
  getInvoice,
  updateInvoice,
  deleteInvoice,
  createInvoiceWithItems,
  getDashboardData,
  getSalesReport,
  getDetailedSalesReport,
  exportSalesReportToExcel,
  getCxcReport,
  getRefundsReport,
  registerInvoicePayment,
  reverseInvoicePayment,
  registerClientAccountAbono,
} from '../controllers/commercial.controller';
import { authenticateToken, requireSuperAdmin } from '../middlewares/auth';

const router = Router();

// Ajustamos el prefijo comercial
router.get('/company/settings', authenticateToken, getCompanySettings);
router.put('/company/settings', authenticateToken, updateCompanySettings);
router.put('/company/invoicing-mode', authenticateToken, updateInvoicingMode);

router.get('/products', authenticateToken, getProducts);
router.post('/products', authenticateToken, createProduct);
router.put('/products/:product_id', authenticateToken, updateProduct);
router.delete('/products/:product_id', authenticateToken, deleteProduct);

router.get('/invoices', authenticateToken, getInvoices);
router.get('/invoices/:id', authenticateToken, getInvoice);
router.put('/invoices/:id', authenticateToken, updateInvoice);
router.delete('/invoices/:id', authenticateToken, deleteInvoice);
router.post('/invoices/with-items', authenticateToken, createInvoiceWithItems);
router.post('/invoices/:id/pay', authenticateToken, registerInvoicePayment);
router.post('/invoices/:id/reverse-payment', authenticateToken, reverseInvoicePayment);
router.post('/invoices/:id/unpay', authenticateToken, reverseInvoicePayment);
router.post('/clients/:clientId/abono', authenticateToken, registerClientAccountAbono);

router.get('/dashboard', authenticateToken, getDashboardData);
router.get('/reports/sales', authenticateToken, getSalesReport);
router.get('/reports/sales/detailed', authenticateToken, getDetailedSalesReport);
router.get('/reports/sales/excel', authenticateToken, exportSalesReportToExcel);
router.get('/reports/cxc', authenticateToken, getCxcReport);
router.get('/reports/refunds', authenticateToken, getRefundsReport);

export default router;
