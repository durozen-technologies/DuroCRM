ALTER TABLE "activities"
  ALTER COLUMN "payment_date" TYPE TIMESTAMP(3)
    USING "payment_date"::timestamp(3),
  ADD COLUMN "payment_bank_name" TEXT,
  ADD COLUMN "payment_card_type" TEXT,
  ADD COLUMN "payment_cheque_number" TEXT,
  ADD COLUMN "payment_cheque_date" DATE,
  ADD COLUMN "payment_deposit_date" DATE,
  ADD COLUMN "payment_clearance_date" DATE,
  ADD COLUMN "payment_instrument_status" TEXT,
  ADD COLUMN "payment_other_method" TEXT,
  ADD COLUMN "payment_proof" TEXT;
