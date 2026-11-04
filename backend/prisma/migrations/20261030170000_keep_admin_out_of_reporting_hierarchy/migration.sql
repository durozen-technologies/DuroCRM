UPDATE "users"
SET "reports_to_id" = NULL
WHERE "reports_to_id" IN (
  SELECT "id"
  FROM "users"
  WHERE "is_cli_admin" = TRUE
);
