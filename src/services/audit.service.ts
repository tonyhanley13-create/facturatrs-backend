import prisma from '../models/db';

export async function logInvoiceAction(
  invoiceId: number,
  userId: number,
  action: string,
  previousState?: string,
  newState?: string,
  details?: string
) {
  try {
    await prisma.invoiceAuditLog.create({
      data: {
        invoice_id: invoiceId,
        user_id: userId,
        action,
        previous_state: previousState,
        new_state: newState,
        details,
      },
    });
  } catch (error) {
    console.error(`❌ Error al registrar auditoría (factura ${invoiceId}, acción: ${action}):`, error);
  }
}

export async function getInvoiceAuditLog(invoiceId: number) {
  return prisma.invoiceAuditLog.findMany({
    where: { invoice_id: invoiceId },
    orderBy: { created_at: 'desc' },
    take: 100,
  });
}
