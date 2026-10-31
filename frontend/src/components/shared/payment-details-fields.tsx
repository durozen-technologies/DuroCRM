"use client";

import type { ChangeEvent } from "react";

export const PAYMENT_MODES = [
  "Cash",
  "UPI",
  "Bank Transfer",
  "Card",
  "Cheque",
  "Other",
] as const;

export type PaymentMode = (typeof PAYMENT_MODES)[number];
const PAYMENT_REFERENCE_PATTERN = /^[A-Za-z0-9][A-Za-z0-9/_-]{0,99}$/;
export type PaymentDetails = {
  paymentMode: "" | PaymentMode;
  paymentDate: string;
  paymentPurpose: string;
  paymentRemarks: string;
  paymentSender: string;
  paymentReceiver: string;
  paymentTransactionId: string;
  paymentBankName: string;
  paymentCardType: "" | "Debit" | "Credit";
  paymentChequeNumber: string;
  paymentChequeDate: string;
  paymentDepositDate: string;
  paymentClearanceDate: string;
  paymentInstrumentStatus: "" | "Issued" | "Deposited" | "Cleared" | "Bounced";
  paymentOtherMethod: string;
};

export type PaymentFieldErrors = Partial<Record<keyof PaymentDetails, string>>;

export function localPaymentDateTimeValue(date = new Date()) {
  const localDate = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return localDate.toISOString().slice(0, 16);
}

export const emptyPaymentDetails: PaymentDetails = {
  paymentMode: "",
  paymentDate: localPaymentDateTimeValue(),
  paymentPurpose: "",
  paymentRemarks: "",
  paymentSender: "",
  paymentReceiver: "",
  paymentTransactionId: "",
  paymentBankName: "",
  paymentCardType: "",
  paymentChequeNumber: "",
  paymentChequeDate: "",
  paymentDepositDate: "",
  paymentClearanceDate: "",
  paymentInstrumentStatus: "",
  paymentOtherMethod: "",
};

export function validatePaymentDetails(
  details: PaymentDetails,
): PaymentFieldErrors {
  const errors: PaymentFieldErrors = {};
  const required = (key: keyof PaymentDetails, label: string) => {
    if (!String(details[key] ?? "").trim()) {
      errors[key] = `${label} is required.`;
    }
  };
  const validDate = (key: keyof PaymentDetails, label: string) => {
    required(key, label);
    if (details[key] && Number.isNaN(new Date(String(details[key])).getTime())) {
      errors[key] = `${label} must be a valid date.`;
    }
  };
  const validDateTime = (label: string) => {
    validDate("paymentDate", label);
    if (details.paymentDate && !/[T ]\d{2}:\d{2}/.test(details.paymentDate)) {
      errors.paymentDate = `${label} must include a time.`;
    }
  };

  required("paymentMode", "Payment mode");
  if (details.paymentMode) {
    required("paymentSender", "Sender name");
    required("paymentReceiver", "Receiver name");
  }
  switch (details.paymentMode) {
    case "Cash":
      validDateTime("Payment date and time");
      break;
    case "UPI":
      required("paymentTransactionId", "UPI transaction ID");
      validDateTime("Transaction date and time");
      break;
    case "Bank Transfer":
      required("paymentTransactionId", "UTR number");
      required("paymentBankName", "Sender bank name");
      validDateTime("Transfer date and time");
      break;
    case "Card":
      required("paymentCardType", "Card type");
      required("paymentTransactionId", "Transaction ID");
      validDateTime("Transaction date and time");
      break;
    case "Cheque": {
      required("paymentChequeNumber", "Cheque number");
      required("paymentBankName", "Issuing bank name");
      required("paymentInstrumentStatus", "Cheque status");
      validDate("paymentChequeDate", "Cheque date");
      if (details.paymentDepositDate) {
        validDate("paymentDepositDate", "Deposit date");
        if (
          details.paymentChequeDate &&
          details.paymentDepositDate < details.paymentChequeDate
        ) {
          errors.paymentDepositDate = "Deposit date cannot precede cheque date.";
        }
      }
      if (details.paymentInstrumentStatus === "Cleared") {
        validDate("paymentClearanceDate", "Clearance date");
      }
      if (
        details.paymentClearanceDate &&
        (!details.paymentDepositDate ||
          details.paymentClearanceDate < details.paymentDepositDate)
      ) {
        errors.paymentClearanceDate =
          "Clearance date cannot precede deposit date.";
      }
      break;
    }
    case "Other":
      required("paymentOtherMethod", "Payment method name");
      required("paymentPurpose", "Description");
      validDateTime("Transaction date and time");
      break;
  }
  if (
    details.paymentTransactionId.trim() &&
    !PAYMENT_REFERENCE_PATTERN.test(details.paymentTransactionId.trim())
  ) {
    errors.paymentTransactionId =
      "Use 1-100 letters, numbers, hyphens, underscores, or slashes.";
  }
  return errors;
}

export function PaymentDetailsFields({
  details,
  onChange,
  errors = {},
}: {
  details: PaymentDetails;
  onChange: (details: PaymentDetails) => void;
  errors?: PaymentFieldErrors;
}) {
  function updateField(
    event: ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>,
  ) {
    const { name, value } = event.target;
    if (name === "paymentMode") {
      const paymentMode = value as PaymentDetails["paymentMode"];
      onChange({
        ...emptyPaymentDetails,
        paymentMode,
        paymentPurpose: details.paymentPurpose,
        paymentRemarks: details.paymentRemarks,
        paymentInstrumentStatus:
          paymentMode === "Cheque" ? "Issued" : "",
      });
      return;
    }
    if (name === "paymentInstrumentStatus") {
      const paymentInstrumentStatus =
        value as PaymentDetails["paymentInstrumentStatus"];
      onChange({
        ...details,
        paymentInstrumentStatus,
        ...(paymentInstrumentStatus === "Issued"
          ? { paymentDepositDate: "", paymentClearanceDate: "" }
          : paymentInstrumentStatus !== "Cleared"
            ? { paymentClearanceDate: "" }
            : {}),
      });
      return;
    }
    onChange({ ...details, [name]: value });
  }

  const field = (
    name: keyof PaymentDetails,
    label: string,
    type: "text" | "date" | "datetime-local" = "text",
    required = false,
    placeholder?: string,
  ) => (
    <label key={name}>
      {label}{required ? " *" : ""}
      <input
        aria-invalid={Boolean(errors[name])}
        aria-required={required || undefined}
        name={name}
        type={type}
        value={String(details[name])}
        onChange={updateField}
        placeholder={placeholder}
        maxLength={name === "paymentTransactionId" ? 100 : undefined}
      />
      {errors[name] && (
        <small className="payment-field-error" role="alert">
          {errors[name]}
        </small>
      )}
    </label>
  );

  const select = (
    name: keyof PaymentDetails,
    label: string,
    options: readonly string[],
    required = false,
  ) => (
    <label key={name}>
      {label}{required ? " *" : ""}
      <select
        aria-invalid={Boolean(errors[name])}
        aria-required={required || undefined}
        name={name}
        value={String(details[name])}
        onChange={updateField}
      >
        <option value="">Choose {label.toLowerCase()}</option>
        {options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
      {errors[name] && (
        <small className="payment-field-error" role="alert">
          {errors[name]}
        </small>
      )}
    </label>
  );

  const commonFields = (
    <>
      {field("paymentPurpose", "Payment purpose / description", "text", details.paymentMode === "Other")}
      {field("paymentRemarks", "Remarks")}
    </>
  );

  return (
    <>
      {details.paymentMode && (
        <>
          {field("paymentSender", "Sender name", "text", true)}
          {field("paymentReceiver", "Receiver name", "text", true)}
        </>
      )}
      <label>
        Payment mode *
        <select
          aria-invalid={Boolean(errors.paymentMode)}
          required
          name="paymentMode"
          value={details.paymentMode}
          onChange={updateField}
        >
          <option value="">Choose payment mode</option>
          {PAYMENT_MODES.map((mode) => (
            <option key={mode} value={mode}>
              {mode}
            </option>
          ))}
        </select>
        {errors.paymentMode && (
          <small className="payment-field-error" role="alert">
            {errors.paymentMode}
          </small>
        )}
      </label>
      {details.paymentMode === "Cash" && (
        <>
          {field("paymentDate", "Payment date & time", "datetime-local", true)}
        </>
      )}
      {details.paymentMode === "UPI" && (
        <>
          {field("paymentTransactionId", "UPI transaction ID", "text", true, "e.g. 123456789012")}
          {field("paymentDate", "Transaction date & time", "datetime-local", true)}
        </>
      )}
      {details.paymentMode === "Bank Transfer" && (
        <>
          {field("paymentTransactionId", "UTR number", "text", true, "e.g. HDFC20261031123456")}
          {field("paymentBankName", "Sender bank name", "text", true)}
          {field("paymentDate", "Transfer date & time", "datetime-local", true)}
        </>
      )}
      {details.paymentMode === "Card" && (
        <>
          {select("paymentCardType", "Card type", ["Debit", "Credit"], true)}
          {field("paymentTransactionId", "Transaction ID", "text", true, "e.g. TXN202610311234")}
          {field("paymentDate", "Transaction date & time", "datetime-local", true)}
          {/* <p className="form-wide payment-security-note">
            Never enter or store a card number, CVV, PIN, or OTP.
          </p> */}
        </>
      )}
      {details.paymentMode === "Cheque" && (
        <>
          {field("paymentChequeNumber", "Cheque number", "text", true)}
          {field("paymentChequeDate", "Cheque date", "date", true)}
          {field("paymentBankName", "Issuing bank name", "text", true)}
          {select(
            "paymentInstrumentStatus",
            "Cheque status",
            ["Issued", "Deposited", "Cleared", "Bounced"],
            true,
          )}
          {details.paymentInstrumentStatus !== "Issued" &&
            field("paymentDepositDate", "Deposit date", "date", true)}
          {details.paymentInstrumentStatus === "Cleared" &&
            field("paymentClearanceDate", "Clearance date", "date", true)}
        </>
      )}
      {details.paymentMode === "Other" && (
        <>
          {field("paymentOtherMethod", "Payment method name", "text", true)}
          {field("paymentTransactionId", "Transaction reference number", "text", false, "Optional reference number")}
          {field("paymentDate", "Transaction date & time", "datetime-local", true)}
        </>
      )}
      {details.paymentMode && commonFields}
    </>
  );
}
