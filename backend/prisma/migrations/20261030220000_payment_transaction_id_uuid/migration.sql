BEGIN;

UPDATE "activities"
SET "payment_transaction_id" = NULL
WHERE "payment_transaction_id" IS NOT NULL
  AND btrim("payment_transaction_id") !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$';

ALTER TABLE "activities"
ALTER COLUMN "payment_transaction_id" TYPE UUID
USING NULLIF(btrim("payment_transaction_id"), '')::UUID;

COMMIT;