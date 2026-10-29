ALTER TABLE "activities"
ADD COLUMN "payment_date" DATE;

UPDATE "activities"
SET "payment_date" = "created_at"::date
WHERE "type" = 'PAYMENT_RECEIVED';
