ALTER TABLE "users"
DROP CONSTRAINT "users_reports_to_id_fkey";

ALTER TABLE "users"
ADD CONSTRAINT "users_reports_to_id_fkey"
FOREIGN KEY ("reports_to_id") REFERENCES "users"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;
