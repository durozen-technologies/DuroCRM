ALTER TABLE "users"
ADD COLUMN "reports_to_id" UUID;

CREATE INDEX "users_reports_to_id_idx" ON "users"("reports_to_id");

ALTER TABLE "users"
ADD CONSTRAINT "users_reports_to_id_fkey"
FOREIGN KEY ("reports_to_id") REFERENCES "users"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
