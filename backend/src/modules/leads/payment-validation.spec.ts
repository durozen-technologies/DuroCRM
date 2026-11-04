import * as assert from "node:assert/strict";
import { test } from "node:test";
import { plainToInstance } from "class-transformer";
import { BadRequestException, ConflictException } from "@nestjs/common";
import { validateSync } from "class-validator";
import { Prisma } from "@prisma/client";
import { PaymentFieldsDto } from "./dto/payment-fields.dto";
import {
  assertUniquePaymentReference,
  validatePaymentDetails,
} from "./payment-validation";

const transactionDate = "2026-10-28T09:30:00.000Z";
const upiReference = "123456789012";

test("accepts blank inactive mode fields for a Cash payment DTO", () => {
  const dto = plainToInstance(PaymentFieldsDto, {
    paymentMode: "Cash",
    paymentDate: transactionDate,
    paymentSender: "Customer",
    paymentReceiver: "Admin",
    paymentTransactionId: "",
    paymentCardType: "",
    paymentChequeDate: "",
    paymentDepositDate: "",
    paymentClearanceDate: "",
    paymentInstrumentStatus: "",
  });

  assert.deepEqual(validateSync(dto), []);
});

test("accepts real-world payment references and enforces the reference length", () => {
  const valid = plainToInstance(PaymentFieldsDto, {
    paymentTransactionId: upiReference,
  });
  const validUtr = plainToInstance(PaymentFieldsDto, {
    paymentTransactionId: "HDFC202610311234567890",
  });
  const tooLong = plainToInstance(PaymentFieldsDto, {
    paymentTransactionId: "A".repeat(101),
  });

  assert.deepEqual(validateSync(valid), []);
  assert.deepEqual(validateSync(validUtr), []);
  assert.ok(
    validateSync(tooLong).some(
      (error) => error.property === "paymentTransactionId",
    ),
  );
});

const validPayments: {
  mode: string;
  details: Partial<PaymentFieldsDto>;
}[] = [
  {
    mode: "Cash",
    details: {
      paymentSender: "Customer",
      paymentReceiver: "Admin",
      paymentDate: transactionDate,
    },
  },
  {
    mode: "UPI",
    details: {
      paymentSender: "Customer",
      paymentReceiver: "Admin",
      paymentTransactionId: upiReference,
      paymentDate: transactionDate,
    },
  },
  {
    mode: "Bank Transfer",
    details: {
      paymentSender: "Customer",
      paymentReceiver: "Admin",
      paymentBankName: "Example Bank",
      paymentTransactionId: "HDFC202610311234567890",
      paymentDate: transactionDate,
    },
  },
  {
    mode: "Card",
    details: {
      paymentSender: "Cardholder",
      paymentReceiver: "Merchant",
      paymentCardType: "Credit",
      paymentTransactionId: "CARD202610311234",
      paymentDate: transactionDate,
    },
  },
  {
    mode: "Cheque",
    details: {
      paymentSender: "Account holder",
      paymentReceiver: "Merchant",
      paymentBankName: "Example Bank",
      paymentChequeNumber: "000012",
      paymentChequeDate: "2026-10-28",
      paymentDepositDate: "2026-10-29",
      paymentClearanceDate: "2026-10-30",
      paymentInstrumentStatus: "Cleared",
    },
  },
  {
    mode: "Other",
    details: {
      paymentSender: "Customer",
      paymentReceiver: "Admin",
      paymentOtherMethod: "Cash on delivery",
      paymentPurpose: "Service payment",
      paymentDate: transactionDate,
    },
  },
];

for (const { mode, details } of validPayments) {
  test(`validates and normalizes ${mode} payment details`, () => {
    const result = validatePaymentDetails(
      Object.assign(new PaymentFieldsDto(), {
        paymentMode: mode,
        ...details,
      }),
    );

    assert.equal(result.paymentMode, mode);
    assert.equal(
      result.paymentDate instanceof Date,
      mode !== "Cheque",
    );
    if (mode === "UPI") {
      assert.equal(result.paymentTransactionId, upiReference);
      assert.equal(result.paymentBankName, null);
      assert.equal("paymentFrom" in result, false);
      assert.equal("paymentTo" in result, false);
    }
    if (mode === "Bank Transfer") {
      assert.equal(result.paymentBankName, "Example Bank");
      assert.equal(result.paymentReceiver, "Admin");
    }
    if (mode === "Card") {
      assert.equal(result.paymentCardType, "Credit");
      assert.equal(result.paymentReceiver, "Merchant");
    }
    if (mode === "Cheque") {
      assert.equal(result.paymentInstrumentStatus, "Cleared");
      assert.equal(result.paymentDate, null);
    }
    if (mode === "Other") {
      assert.equal(result.paymentOtherMethod, "Cash on delivery");
      assert.equal(result.paymentSender, "Customer");
    }
  });
}

for (const { mode, details } of validPayments) {
  test(`requires sender and receiver for ${mode} payments`, () => {
    const withoutSender = { ...details };
    const withoutReceiver = { ...details };
    delete withoutSender.paymentSender;
    delete withoutReceiver.paymentReceiver;

    assert.throws(
      () =>
        validatePaymentDetails(
          Object.assign(new PaymentFieldsDto(), {
            paymentMode: mode,
            ...withoutSender,
          }),
        ),
      BadRequestException,
    );
    assert.throws(
      () =>
        validatePaymentDetails(
          Object.assign(new PaymentFieldsDto(), {
            paymentMode: mode,
            ...withoutReceiver,
          }),
        ),
      BadRequestException,
    );
  });
}

for (const mode of ["Cash", "UPI", "Bank Transfer", "Card", "Cheque", "Other"]) {
  test(`rejects missing required fields for ${mode}`, () => {
    assert.throws(
      () =>
        validatePaymentDetails(
          Object.assign(new PaymentFieldsDto(), { paymentMode: mode }),
        ),
      BadRequestException,
    );
  });
}

test("requires date and time for non-cheque modes", () => {
  assert.throws(
    () =>
      validatePaymentDetails(
        Object.assign(new PaymentFieldsDto(), {
          paymentMode: "Cash",
          paymentSender: "Customer",
          paymentReceiver: "Admin",
          paymentDate: "2026-10-28",
        }),
      ),
    BadRequestException,
  );
});

test("rejects payment references with unsupported characters", () => {
  assert.throws(
    () =>
      validatePaymentDetails(
        Object.assign(new PaymentFieldsDto(), {
          paymentMode: "UPI",
          paymentSender: "Customer",
          paymentReceiver: "Admin",
          paymentTransactionId: "upi reference!",
          paymentDate: transactionDate,
        }),
      ),
    BadRequestException,
  );
});

test("validates cheque lifecycle status and date ordering", () => {
  const clearedWithoutDate = Object.assign(new PaymentFieldsDto(), {
    paymentMode: "Cheque",
    paymentSender: "Account holder",
    paymentBankName: "Example Bank",
    paymentChequeNumber: "000012",
    paymentChequeDate: "2026-10-28",
    paymentInstrumentStatus: "Cleared",
  });
  assert.throws(
    () => validatePaymentDetails(clearedWithoutDate),
    BadRequestException,
  );

  const depositBeforeCheque = Object.assign(new PaymentFieldsDto(), {
    paymentMode: "Cheque",
    paymentSender: "Account holder",
    paymentBankName: "Example Bank",
    paymentChequeNumber: "000012",
    paymentChequeDate: "2026-10-29",
    paymentDepositDate: "2026-10-28",
    paymentInstrumentStatus: "Deposited",
  });
  assert.throws(
    () => validatePaymentDetails(depositBeforeCheque),
    BadRequestException,
  );
});

test("rejects a transaction reference that already exists", async () => {
  let queryCount = 0;
  const tx = {
    $queryRaw: async () =>
      queryCount++ === 0 ? [] : [{ id: "existing-payment" }],
    activity: {
      findFirst: async () => null,
    },
  } as unknown as Prisma.TransactionClient;

  await assert.rejects(
    assertUniquePaymentReference(tx, upiReference),
    ConflictException,
  );
});

test("allows a transaction reference when it is unused or belongs to the edited payment", async () => {
  const tx = {
    $queryRaw: async () => [],
    activity: {
      findFirst: async () => null,
    },
  } as unknown as Prisma.TransactionClient;

  await assert.doesNotReject(assertUniquePaymentReference(tx, upiReference));
  await assert.doesNotReject(
    assertUniquePaymentReference(tx, upiReference, "payment-1"),
  );
});
