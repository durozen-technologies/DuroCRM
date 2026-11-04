ALTER TABLE "activities"
ALTER COLUMN "payment_transaction_id" TYPE TEXT
USING "payment_transaction_id"::TEXT;
