import prisma from '../models/db';

export const NCF_PREFIXES: Record<string, string> = {
  E31: 'E31', E32: 'E32', E33: 'E33', E34: 'E34',
  E41: 'E41', E43: 'E43', E44: 'E44', E45: 'E45', E46: 'E46', E47: 'E47',
};

export async function getNextNcfNumber(companyId: number, type: string): Promise<string> {
  const prefix = NCF_PREFIXES[type];
  if (!prefix) throw new Error(`Tipo de NCF inválido: ${type}`);

  return prisma.$transaction(async (tx) => {
    // Advisory lock per company to prevent concurrent NCF generation
    await tx.$executeRawUnsafe(`SELECT pg_advisory_xact_lock(${companyId})`);

    const seq = await tx.ncfSequence.upsert({
      where: { company_id_type: { company_id: companyId, type } },
      create: {
        company_id: companyId,
        type,
        prefix,
        next: 1,
        end: 999999,
      },
      update: {},
    });

    if (seq.next > seq.end) {
      // Auto-extender el rango en 10000 para evitar bloqueos
      await tx.ncfSequence.update({
        where: { company_id_type: { company_id: companyId, type } },
        data: { end: seq.end + 10000 },
      });
      seq.end = seq.end + 10000;
    }

    const number = seq.next.toString().padStart(10, '0');
    const encf = `${prefix}${number}`;

    await tx.ncfSequence.update({
      where: { company_id_type: { company_id: companyId, type } },
      data: { next: seq.next + 1 },
    });

    return encf;
  });
}

export async function migrateNcfSequences(companyId: number) {
  const company = await prisma.company.findUnique({ where: { id: companyId } });
  if (!company?.ncf_ranges) return;

  let oldSequences: any[] = [];
  try {
    oldSequences = JSON.parse(company.ncf_ranges);
  } catch { return; }
  if (!Array.isArray(oldSequences)) return;

  for (const seq of oldSequences) {
    const type = seq.type || seq.prefix;
    if (!type || !NCF_PREFIXES[type]) continue;

    await prisma.ncfSequence.upsert({
      where: { company_id_type: { company_id: companyId, type } },
      create: {
        company_id: companyId,
        type,
        prefix: seq.prefix || type,
        next: Number(seq.next) || 1,
        end: Number(seq.end) || 999999,
      },
      update: {
        prefix: seq.prefix || type,
        next: Number(seq.next) || 1,
        end: Number(seq.end) || 999999,
      },
    });
  }
}

export async function getNcfSequences(companyId: number) {
  return prisma.ncfSequence.findMany({
    where: { company_id: companyId },
    orderBy: { type: 'asc' },
  });
}

export async function setNcfRange(
  companyId: number,
  type: string,
  next: number,
  end: number
) {
  const prefix = NCF_PREFIXES[type];
  if (!prefix) throw new Error(`Tipo de NCF inválido: ${type}`);

  return prisma.ncfSequence.upsert({
    where: { company_id_type: { company_id: companyId, type } },
    create: { company_id: companyId, type, prefix, next, end },
    update: { next, end },
  });
}
