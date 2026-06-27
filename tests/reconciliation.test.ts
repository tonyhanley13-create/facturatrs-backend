import { reconcilePendingInvoices } from '../src/services/reconciliation.service';

const mockFindMany = jest.fn();
const mockUpdate = jest.fn();

jest.mock('../src/models/db', () => ({
  __esModule: true,
  default: {
    invoice: {
      findMany: (...args: any[]) => mockFindMany(...args),
      update: (...args: any[]) => mockUpdate(...args),
    },
  },
}));

jest.mock('../src/services/dgii.service', () => ({
  checkStatus: jest.fn(),
}));

describe('reconciliation.service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should process no pending invoices gracefully', async () => {
    mockFindMany.mockResolvedValue([]);
    const result = await reconcilePendingInvoices();
    expect(result.checked).toBe(0);
  });

  it('should process pending invoices with DGII track IDs', async () => {
    const dgiiService = require('../src/services/dgii.service');
    dgiiService.checkStatus.mockResolvedValue({ estado: 'Aceptado' });

    mockFindMany.mockResolvedValue([
      { id: 1, dgii_track_id: 'track-123', status: 'pending_dgii', dgii_status: null, company: { dgii_environment: '1' }, company_id: 1 },
      { id: 2, dgii_track_id: 'track-456', status: 'pending_dgii', dgii_status: null, company: { dgii_environment: '1' }, company_id: 1 },
    ]);
    mockUpdate.mockResolvedValue({});

    const result = await reconcilePendingInvoices();
    expect(result.updated).toBe(2);
    expect(mockUpdate).toHaveBeenCalledTimes(2);
  });

  it('should skip invoices without DGII track IDs', async () => {
    mockFindMany.mockResolvedValue([
      { id: 1, dgii_track_id: null, status: 'pending_dgii', dgii_status: null, company: null },
    ]);

    const result = await reconcilePendingInvoices();
    expect(result.updated).toBe(0);
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it('should count errors when api fails', async () => {
    const dgiiService = require('../src/services/dgii.service');
    dgiiService.checkStatus.mockRejectedValueOnce(new Error('Network error'));

    mockFindMany.mockResolvedValue([
      { id: 1, dgii_track_id: 'track-999', status: 'pending_dgii', dgii_status: null, company: { dgii_environment: '1' }, company_id: 1 },
    ]);

    const result = await reconcilePendingInvoices();
    expect(result.updated).toBe(0);
    expect(result.errors).toBe(1);
  });
});
