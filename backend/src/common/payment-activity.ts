import { Prisma } from "@prisma/client";

type PaymentActivityRecord = Pick<
  Prisma.PaymentTransactionGetPayload<Record<string, never>>,
  | "id"
  | "leadId"
  | "userId"
  | "paymentAmount"
  | "paymentDate"
  | "paymentStatus"
  | "paymentMode"
  | "description"
  | "remarks"
  | "createdAt"
>;

export async function syncPaymentActivity(
  tx: Prisma.TransactionClient,
  payment: PaymentActivityRecord,
) {
  const amount = payment.paymentAmount?.toFixed(2) ?? "0.00";
  await tx.activity.upsert({
    where: { paymentTransactionId: payment.id },
    create: {
      leadId: payment.leadId,
      userId: payment.userId,
      paymentTransactionId: payment.id,
      type: "PAYMENT_RECEIVED",
      contactType: "Payment",
      contactDate: payment.paymentDate ?? undefined,
      description: `${payment.paymentMode ?? "Payment"} payment of ${amount}`,
      outcome: payment.paymentStatus
        ? `Payment status: ${payment.paymentStatus}`
        : null,
      remarks: payment.remarks,
      createdAt: payment.createdAt,
    },
    update: {
      paymentTransactionId: payment.id,
      type: "PAYMENT_RECEIVED",
      contactType: "Payment",
      contactDate: payment.paymentDate ?? undefined,
      description: `${payment.paymentMode ?? "Payment"} payment of ${amount}`,
      outcome: payment.paymentStatus
        ? `Payment status: ${payment.paymentStatus}`
        : null,
      remarks: payment.remarks,
    },
  });
}
