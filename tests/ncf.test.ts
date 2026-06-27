import { getNextNcfNumber, NCF_PREFIXES } from '../src/services/ncf.service';

const mockTransaction = jest.fn();
const mockFindUnique = jest.fn();

jest.mock('../src/models/db', () => ({
  __esModule: true,
  default: {
    $transaction: (cb: any) => mockTransaction(cb),
    ncfSequence: {
      findUnique: () => mockFindUnique(),
    },
  },
}));

// Simulate the transaction client with advisory lock
function setupTransaction(seq: { next: number; end: number } | null) {
  mockTransaction.mockImplementation(async (cb: any) => {
    const tx = {
      $executeRawUnsafe: jest.fn().mockResolvedValue([{ pg_advisory_xact_lock: true }]),
      ncfSequence: {
        upsert: jest.fn().mockResolvedValue({
          id: 1,
          company_id: 1,
          type: 'E31',
          prefix: 'E31',
          next: seq ? seq.next : 1,
          end: seq ? seq.end : 999999,
        }),
        update: jest.fn().mockImplementation((args: any) => ({
          id: 1,
          company_id: 1,
          type: 'E31',
          prefix: 'E31',
          next: args.data.next,
          end: 999999,
        })),
      },
    };
    return cb(tx);
  });
}

describe('ncf.service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('NCF_PREFIXES has E31-E47 keys', () => {
    expect(NCF_PREFIXES).toHaveProperty('E31');
    expect(NCF_PREFIXES).toHaveProperty('E32');
    expect(NCF_PREFIXES).toHaveProperty('E33');
    expect(NCF_PREFIXES).toHaveProperty('E34');
    expect(NCF_PREFIXES).toHaveProperty('E41');
    expect(NCF_PREFIXES).toHaveProperty('E43');
    expect(NCF_PREFIXES).toHaveProperty('E44');
    expect(NCF_PREFIXES).toHaveProperty('E45');
    expect(NCF_PREFIXES).toHaveProperty('E46');
    expect(NCF_PREFIXES).toHaveProperty('E47');
  });

  it('returns sequential NCF numbers', async () => {
    setupTransaction({ next: 1, end: 999999 });
    const ncf1 = await getNextNcfNumber(1, 'E31');
    expect(ncf1).toBe('E310000000001');

    setupTransaction({ next: 2, end: 999999 });
    const ncf2 = await getNextNcfNumber(1, 'E31');
    expect(ncf2).toBe('E310000000002');
  });

  it('formats NCF with 10-digit zero padding', async () => {
    setupTransaction({ next: 12345, end: 999999 });
    const ncf = await getNextNcfNumber(1, 'E31');
    expect(ncf).toBe('E310000012345');
  });

  it('throws for invalid type', async () => {
    await expect(getNextNcfNumber(1, 'INVALID')).rejects.toThrow();
  });

  it('uses different prefixes correctly', async () => {
    setupTransaction({ next: 1, end: 999999 });
    const ncfE34 = await getNextNcfNumber(1, 'E34');
    expect(ncfE34).toBe('E340000000001');

    setupTransaction({ next: 1, end: 999999 });
    const ncfE33 = await getNextNcfNumber(1, 'E33');
    expect(ncfE33).toBe('E330000000001');
  });
});
