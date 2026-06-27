import { generateReport606, generateReport607 } from '../src/services/dgii-report.service';

const mockCompany = { rnc: '123456789', name: 'Test Company' };
const mockPurchases = [
  { ncf: 'E310000000001', rnc_proveedor: '987654321', nombre_proveedor: 'Proveedor A', fecha: new Date('2025-06-15'), monto_total: 1180, itbis: 180, tipo_comprobante: '01' },
  { ncf: 'E320000000001', rnc_proveedor: '111111111', nombre_proveedor: 'Proveedor B', fecha: new Date('2025-06-20'), monto_total: 590, itbis: 90, tipo_comprobante: '02' },
];
const mockInvoices = [
  { ncf: 'E310000000001', document_type: 'Factura de Crédito Fiscal', client: { rnc: '987654321', name: 'Client A' }, total_amount: 1000, tax_amount: 180, created_at: new Date('2025-06-15'), dgii_status: 'Aceptado' },
  { ncf: 'E320000000001', document_type: 'Factura de Consumo', client: { rnc: '111111111', name: 'Client B' }, total_amount: 500, tax_amount: 0, created_at: new Date('2025-06-20'), dgii_status: 'Aceptado' },
];

jest.mock('../src/models/db', () => ({
  __esModule: true,
  default: {
    company: { findUnique: jest.fn() },
    invoice: { findMany: jest.fn() },
    receivedEcf: { findMany: jest.fn() },
    purchaseRecord: { findMany: jest.fn(), create: jest.fn(), update: jest.fn(), delete: jest.fn() },
    dgiiReport: { findUnique: jest.fn(), create: jest.fn(), upsert: jest.fn(), findMany: jest.fn() },
  },
}));


const prisma = require('../src/models/db').default;

describe('dgii-report.service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('generateReport606', () => {
    it('generates XML with header and purchase details', async () => {
      prisma.company.findUnique.mockResolvedValue(mockCompany);
      prisma.purchaseRecord.findMany.mockResolvedValue(mockPurchases);

      const xml = await generateReport606(1, 2025, 6);

      expect(xml).toContain('<?xml version="1.0" encoding="utf-8"?>');
      expect(xml).toContain('<eCF606');
      expect(xml).toContain('<Rnc>123456789</Rnc>');
      expect(xml).toContain('<RazonSocial>Test Company</RazonSocial>');
      expect(xml).toContain('<Periodo>06/2025</Periodo>');
      expect(xml).toContain('<NCF>E310000000001</NCF>');
      expect(xml).toContain('<NCF>E320000000001</NCF>');
      expect(xml).toContain('<RncEmisor>987654321</RncEmisor>');
      expect(xml).toContain('<RncEmisor>111111111</RncEmisor>');
      expect(xml).toContain('</eCF606>');
    });

    it('includes ITBIS from purchase records', async () => {
      prisma.company.findUnique.mockResolvedValue(mockCompany);
      prisma.purchaseRecord.findMany.mockResolvedValue(mockPurchases);

      const xml = await generateReport606(1, 2025, 6);

      expect(xml).toContain('<ITBIS>180.00</ITBIS>');
      expect(xml).toContain('<ITBIS>90.00</ITBIS>');
    });

    it('includes correct NCF type codes from purchase records', async () => {
      prisma.company.findUnique.mockResolvedValue(mockCompany);
      prisma.purchaseRecord.findMany.mockResolvedValue(mockPurchases);

      const xml = await generateReport606(1, 2025, 6);

      expect(xml).toContain('<TipoComprobante>01</TipoComprobante>');
      expect(xml).toContain('<TipoComprobante>02</TipoComprobante>');
    });

    it('sets CantidadRegistros to 0 when no purchases', async () => {
      prisma.company.findUnique.mockResolvedValue(mockCompany);
      prisma.purchaseRecord.findMany.mockResolvedValue([]);

      const xml = await generateReport606(1, 2025, 6);

      expect(xml).toContain('<CantidadRegistros>0</CantidadRegistros>');
    });
  });

  describe('generateReport607', () => {
    it('generates XML with header and invoice details', async () => {
      prisma.company.findUnique.mockResolvedValue(mockCompany);
      prisma.invoice.findMany.mockResolvedValue([
        { ncf: 'E310000000099', document_type: 'Factura de Crédito Fiscal', client: { rnc: '999999999', name: 'Client C' }, total_amount: 2500, tax_amount: 450, created_at: new Date('2025-06-10'), dgii_status: 'Aceptado' },
      ]);

      const xml = await generateReport607(1, 2025, 6);

      expect(xml).toContain('<?xml version="1.0" encoding="utf-8"?>');
      expect(xml).toContain('<eCF607');
      expect(xml).toContain('<NCF>E310000000099</NCF>');
      expect(xml).toContain('<RncEmisor>123456789</RncEmisor>');
      expect(xml).toContain('2500.00');
      expect(xml).toContain('</eCF607>');
    });
  });
});
