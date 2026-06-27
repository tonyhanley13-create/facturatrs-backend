import prisma from '../models/db';
import * as dgiiService from './dgii.service';

const RECONCILIATION_INTERVAL_MS = 15 * 60 * 1000;

export async function reconcilePendingInvoices() {
  const pendingInvoices = await prisma.invoice.findMany({
    where: {
      dgii_track_id: { not: null },
      dgii_status: { notIn: ['Aceptado', 'Rechazado', 'Aceptado Condicional'] },
      status: { in: ['draft', 'sent_to_dgii'] },
    },
    include: { company: true },
    take: 50,
  });

  if (pendingInvoices.length === 0) return { checked: 0, updated: 0, errors: 0 };

  let updated = 0;
  let errors = 0;

  for (const invoice of pendingInvoices) {
    if (!invoice.dgii_track_id || !invoice.company) continue;

    try {
      const result = await dgiiService.checkStatus(
        invoice.dgii_track_id,
        invoice.company_id!,
        invoice.company.dgii_environment
      );

      if (result && result.estado) {
        const newStatus = result.estado;
        await prisma.invoice.update({
          where: { id: invoice.id },
          data: {
            dgii_status: newStatus,
            status: newStatus === 'Aceptado' || newStatus === 'Aceptado Condicional'
              ? 'sent_to_dgii'
              : newStatus === 'Rechazado'
                ? 'rejected_by_dgii'
                : invoice.status,
            dgii_error: newStatus === 'Rechazado' ? result.mensajes?.join('; ') : null,
          },
        });
        updated++;
      }
    } catch (error) {
      errors++;
    }
  }

  return { checked: pendingInvoices.length, updated, errors };
}

let intervalHandle: NodeJS.Timeout | null = null;

export function startReconciliationScheduler() {
  if (intervalHandle) return;

  // Run first check after 1 minute (to avoid running during startup)
  setTimeout(() => {
    reconcilePendingInvoices().catch(() => {});
  }, 60_000);

  intervalHandle = setInterval(() => {
    reconcilePendingInvoices().catch(() => {});
  }, RECONCILIATION_INTERVAL_MS);

  console.log(`⏰ Scheduler de reconciliación DGII iniciado (cada ${RECONCILIATION_INTERVAL_MS / 60000} minutos)`);
}

export function stopReconciliationScheduler() {
  if (intervalHandle) {
    clearInterval(intervalHandle);
    intervalHandle = null;
  }
}
