ALTER TABLE "activities"
ADD COLUMN "payment_mode" TEXT,
ADD COLUMN "payment_sender" TEXT,
ADD COLUMN "payment_receiver" TEXT,
ADD COLUMN "payment_transaction_id" TEXT,
ADD COLUMN "payment_from" TEXT,
ADD COLUMN "payment_to" TEXT;
