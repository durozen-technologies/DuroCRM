ALTER TABLE "activities"
ADD COLUMN "payment_transaction_id" UUID;

CREATE UNIQUE INDEX "activities_payment_transaction_id_key"
ON "activities"("payment_transaction_id");

ALTER TABLE "activities"
ADD CONSTRAINT "activities_payment_transaction_id_fkey"
FOREIGN KEY ("payment_transaction_id") REFERENCES "payment_transactions"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

INSERT INTO "activities" (
    "id",
    "lead_id",
    "user_id",
    "type",
    "description",
    "outcome",
    "contact_date",
    "contact_type",
    "remarks",
    "created_at",
    "payment_transaction_id"
)
SELECT
    gen_random_uuid(),
    payment."lead_id",
    payment."user_id",
    'PAYMENT_RECEIVED',
    COALESCE(payment."payment_mode", 'Payment') || ' payment of ' ||
        COALESCE(payment."payment_amount"::text, '0.00'),
    CASE
        WHEN payment."payment_status" IS NULL THEN NULL
        ELSE 'Payment status: ' || payment."payment_status"
    END,
    payment."payment_date"::date,
    'Payment',
    payment."remarks",
    payment."created_at",
    payment."id"
FROM "payment_transactions" AS payment;
