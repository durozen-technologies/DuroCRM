import { BadRequestException, ConflictException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PaymentFieldsDto } from "./dto/payment-fields.dto";

const REQUIRED_MESSAGE = "is required.";
const PAYMENT_REFERENCE_PATTERN = /^[A-Za-z0-9][A-Za-z0-9/_-]{0,99}$/;
const isPresent = (value: string | undefined) => Boolean(value?.trim());
const asDate = (value: string | undefined, field: string) => {
  if (!value) {
    throw new BadRequestException(`${field} ${REQUIRED_MESSAGE}`);
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new BadRequestException(`${field} must be a valid date.`);
  }
  return date;
};
const asDateTime = (value: string | undefined, field: string) => {
  const date = asDate(value, field);
  if (!/[T ]\d{2}:\d{2}/.test(value ?? "")) {
    throw new BadRequestException(`${field} must include a time.`);
  }
  return date;
};

export function validatePaymentDetails(details: PaymentFieldsDto) {
  const mode = details.paymentMode;
  if (!mode) throw new BadRequestException("Payment mode is required.");
  if (
    isPresent(details.paymentTransactionId) &&
    !PAYMENT_REFERENCE_PATTERN.test(details.paymentTransactionId!.trim())
  ) {
    throw new BadRequestException(
      "Transaction reference must use 1-100 letters, numbers, hyphens, underscores, or slashes.",
    );
  }

  const fields: Partial<
    Record<
      | "paymentSender"
      | "paymentReceiver"
      | "paymentTransactionId"
      | "paymentBankName"
      | "paymentCardType"
      | "paymentChequeNumber"
      | "paymentChequeDate"
      | "paymentDepositDate"
      | "paymentClearanceDate"
      | "paymentInstrumentStatus"
      | "paymentOtherMethod",
      string
    >
  > = {};
  const requireField = (key: keyof typeof fields, value: string | undefined) => {
    if (!isPresent(value)) {
      throw new BadRequestException(`${key.replace("payment", "")} ${REQUIRED_MESSAGE}`);
    }
    fields[key] = value!.trim();
  };

  requireField("paymentSender", details.paymentSender);
  requireField("paymentReceiver", details.paymentReceiver);

  switch (mode) {
    case "Cash":
      asDateTime(details.paymentDate, "Payment date and time");
      break;
    case "UPI":
      requireField("paymentTransactionId", details.paymentTransactionId);
      asDateTime(details.paymentDate, "Transaction date and time");
      break;
    case "Bank Transfer":
      requireField("paymentTransactionId", details.paymentTransactionId);
      requireField("paymentBankName", details.paymentBankName);
      asDateTime(details.paymentDate, "Transfer date and time");
      break;
    case "Card":
      requireField("paymentCardType", details.paymentCardType);
      requireField("paymentTransactionId", details.paymentTransactionId);
      asDateTime(details.paymentDate, "Transaction date and time");
      break;
    case "Cheque": {
      requireField("paymentChequeNumber", details.paymentChequeNumber);
      requireField("paymentBankName", details.paymentBankName);
      requireField("paymentInstrumentStatus", details.paymentInstrumentStatus);
      const chequeDate = asDate(details.paymentChequeDate, "Cheque date");
      const depositDate = details.paymentDepositDate
        ? asDate(details.paymentDepositDate, "Deposit date")
        : undefined;
      const clearanceDate = details.paymentClearanceDate
        ? asDate(details.paymentClearanceDate, "Clearance date")
        : undefined;
      if (
        ["Deposited", "Cleared", "Bounced"].includes(
          details.paymentInstrumentStatus ?? "",
        ) &&
        !depositDate
      ) {
        throw new BadRequestException(
          "Deposit date is required once the cheque is deposited.",
        );
      }
      if (depositDate && depositDate < chequeDate) {
        throw new BadRequestException("Deposit date cannot precede cheque date.");
      }
      if (
        details.paymentInstrumentStatus === "Cleared" &&
        !clearanceDate
      ) {
        throw new BadRequestException(
          "Clearance date is required when the cheque is cleared.",
        );
      }
      if (clearanceDate && (!depositDate || clearanceDate < depositDate)) {
        throw new BadRequestException(
          "Clearance date cannot precede deposit date.",
        );
      }
      fields.paymentChequeDate = details.paymentChequeDate;
      fields.paymentDepositDate =
        details.paymentInstrumentStatus === "Issued"
          ? undefined
          : details.paymentDepositDate;
      fields.paymentClearanceDate =
        details.paymentInstrumentStatus === "Cleared"
          ? details.paymentClearanceDate
          : undefined;
      fields.paymentInstrumentStatus = details.paymentInstrumentStatus;
      break;
    }
    case "Other":
      requireField("paymentOtherMethod", details.paymentOtherMethod);
      asDateTime(details.paymentDate, "Transaction date and time");
      if (!isPresent(details.paymentPurpose)) {
        throw new BadRequestException(
          "Description is required for Other payment mode.",
        );
      }
      if (isPresent(details.paymentTransactionId)) {
        fields.paymentTransactionId = details.paymentTransactionId!.trim();
      }
      break;
    default:
      throw new BadRequestException("Unsupported payment mode.");
  }

  const paymentDate =
    mode === "Cheque"
      ? null
      : asDateTime(details.paymentDate, "Payment date and time");
  return {
    paymentMode: mode,
    paymentDate,
    description:
      details.paymentPurpose?.trim() || `${mode} payment`,
    remarks: details.paymentRemarks?.trim() || null,
    paymentSender: fields.paymentSender ?? null,
    paymentReceiver: fields.paymentReceiver ?? null,
    paymentTransactionId: fields.paymentTransactionId ?? null,
    paymentBankName: fields.paymentBankName ?? null,
    paymentCardType: fields.paymentCardType ?? null,
    paymentChequeNumber: fields.paymentChequeNumber ?? null,
    paymentChequeDate: fields.paymentChequeDate
      ? asDate(fields.paymentChequeDate, "Cheque date")
      : null,
    paymentDepositDate: fields.paymentDepositDate
      ? asDate(fields.paymentDepositDate, "Deposit date")
      : null,
    paymentClearanceDate: fields.paymentClearanceDate
      ? asDate(fields.paymentClearanceDate, "Clearance date")
      : null,
    paymentInstrumentStatus: fields.paymentInstrumentStatus ?? null,
    paymentOtherMethod: fields.paymentOtherMethod ?? null,
  };
}

export async function assertUniquePaymentReference(
  tx: Prisma.TransactionClient,
  reference: string | null,
  exceptId?: string,
) {
  if (!reference) return;
  // Serialize reference checks to preserve legacy duplicate rows without allowing new duplicates.
  await tx.$queryRaw`
    SELECT pg_advisory_xact_lock(
      hashtextextended(${reference.trim().toLowerCase()}, 0)
    ) IS NULL
  `;
  const normalizedReference = reference.trim().toLowerCase();
  const duplicates = exceptId
    ? await tx.$queryRaw<{ id: string }[]>`
        SELECT id FROM activities
        WHERE lower(btrim(payment_transaction_id::text)) = ${normalizedReference}
          AND id <> ${exceptId}::uuid
        LIMIT 1
      `
    : await tx.$queryRaw<{ id: string }[]>`
        SELECT id FROM activities
        WHERE lower(btrim(payment_transaction_id::text)) = ${normalizedReference}
        LIMIT 1
      `;
  if (duplicates.length > 0) {
    throw new ConflictException(
      "This transaction reference has already been used.",
    );
  }
}

export function paymentReferenceConflict(error: unknown): never {
  const target =
    error instanceof Prisma.PrismaClientKnownRequestError
      ? error.meta?.target
      : undefined;
  const targetDescription = Array.isArray(target)
    ? target.join(",")
    : String(target ?? "");
  if (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2002" &&
    targetDescription.includes("payment_transaction_id")
  ) {
    throw new ConflictException(
      "This transaction reference has already been used.",
    );
  }
  throw error;
}
