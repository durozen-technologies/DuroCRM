CREATE TABLE "payment_transactions" (
    "id" UUID NOT NULL,
    "lead_id" UUID NOT NULL,
    "user_id" UUID,
    "payment_amount" DECIMAL(18,2),
    "payment_date" TIMESTAMP(3),
    "payment_status" TEXT,
    "payment_total" DECIMAL(18,2),
    "payment_balance" DECIMAL(18,2),
    "payment_mode" TEXT,
    "payment_sender" TEXT,
    "payment_receiver" TEXT,
    "payment_transaction_id" TEXT,
    "payment_bank_name" TEXT,
    "payment_card_type" TEXT,
    "payment_cheque_number" TEXT,
    "payment_cheque_date" DATE,
    "payment_deposit_date" DATE,
    "payment_clearance_date" DATE,
    "payment_instrument_status" TEXT,
    "payment_other_method" TEXT,
    "description" TEXT NOT NULL,
    "remarks" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payment_transactions_pkey" PRIMARY KEY ("id")
);

INSERT INTO "payment_transactions" (
    "id",
    "lead_id",
    "user_id",
    "payment_amount",
    "payment_date",
    "payment_status",
    "payment_total",
    "payment_balance",
    "payment_mode",
    "payment_sender",
    "payment_receiver",
    "payment_transaction_id",
    "payment_bank_name",
    "payment_card_type",
    "payment_cheque_number",
    "payment_cheque_date",
    "payment_deposit_date",
    "payment_clearance_date",
    "payment_instrument_status",
    "payment_other_method",
    "description",
    "remarks",
    "created_at"
)
SELECT
    "id",
    "lead_id",
    "user_id",
    "payment_amount",
    "payment_date",
    "payment_status",
    "payment_total",
    "payment_balance",
    "payment_mode",
    "payment_sender",
    "payment_receiver",
    "payment_transaction_id",
    "payment_bank_name",
    "payment_card_type",
    "payment_cheque_number",
    "payment_cheque_date",
    "payment_deposit_date",
    "payment_clearance_date",
    "payment_instrument_status",
    "payment_other_method",
    "description",
    "remarks",
    "created_at"
FROM "activities"
WHERE "type" = 'PAYMENT_RECEIVED';

CREATE INDEX "payment_transactions_lead_id_created_at_idx"
    ON "payment_transactions"("lead_id", "created_at");

ALTER TABLE "payment_transactions"
    ADD CONSTRAINT "payment_transactions_lead_id_fkey"
    FOREIGN KEY ("lead_id") REFERENCES "leads"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "payment_transactions"
    ADD CONSTRAINT "payment_transactions_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

DELETE FROM "activities"
WHERE "type" = 'PAYMENT_RECEIVED';

ALTER TABLE "activities"
    DROP COLUMN "payment_amount",
    DROP COLUMN "payment_date",
    DROP COLUMN "payment_status",
    DROP COLUMN "payment_total",
    DROP COLUMN "payment_balance",
    DROP COLUMN "payment_mode",
    DROP COLUMN "payment_sender",
    DROP COLUMN "payment_receiver",
    DROP COLUMN "payment_transaction_id",
    DROP COLUMN "payment_bank_name",
    DROP COLUMN "payment_card_type",
    DROP COLUMN "payment_cheque_number",
    DROP COLUMN "payment_cheque_date",
    DROP COLUMN "payment_deposit_date",
    DROP COLUMN "payment_clearance_date",
    DROP COLUMN "payment_instrument_status",
    DROP COLUMN "payment_other_method";
