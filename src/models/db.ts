import { PrismaClient } from '@prisma/client';
import { encrypt, decrypt, isEncrypted } from '../utils/crypto';

const prisma = new PrismaClient();

const CERT_FIELDS = ['certificate_content', 'certificate_password'] as const;

prisma.$use(async (params, next) => {
  const { model, action, args } = params;

  if (model === 'Company') {
    // Encrypt on write operations
    if (action === 'create' || action === 'update' || action === 'upsert') {
      for (const field of CERT_FIELDS) {
        const data = action === 'upsert' ? args.create || args.update : args.data;
        if (data?.[field] && typeof data[field] === 'string') {
          const value = data[field];
          if (!isEncrypted(value)) {
            data[field] = encrypt(value);
          }
        }
      }
    }

    const result = await next(params);

    // Decrypt on read operations
    if (result && ['findUnique', 'findFirst', 'findMany', 'findUniqueOrThrow', 'findFirstOrThrow'].includes(action)) {
      const decryptFields = (item: any) => {
        for (const field of CERT_FIELDS) {
          if (item[field] && typeof item[field] === 'string' && isEncrypted(item[field])) {
            item[field] = decrypt(item[field]);
          }
        }
        return item;
      };

      if (Array.isArray(result)) {
        return result.map(decryptFields);
      }
      return decryptFields(result);
    }

    return result;
  }

  return next(params);
});

export default prisma;
