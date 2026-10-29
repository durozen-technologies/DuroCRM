INSERT INTO "team_roles" ("id", "name", "updated_at")
VALUES
    ('019a3a00-0000-7000-8000-000000000001', 'Administrator', CURRENT_TIMESTAMP),
    ('019a3a00-0000-7000-8000-000000000002', 'Sales Manager', CURRENT_TIMESTAMP),
    ('019a3a00-0000-7000-8000-000000000003', 'BDE', CURRENT_TIMESTAMP)
ON CONFLICT ("name") DO NOTHING;

ALTER TABLE "users"
ADD COLUMN "custom_role_id" UUID,
ADD COLUMN "permissions" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

UPDATE "users"
SET "custom_role_id" = (
    SELECT "id" FROM "team_roles"
    WHERE "name" = CASE "role"::TEXT
        WHEN 'ADMIN' THEN 'Administrator'
        WHEN 'SALES_MANAGER' THEN 'Sales Manager'
        ELSE 'BDE'
    END
),
"permissions" = CASE "role"::TEXT
    WHEN 'ADMIN' THEN ARRAY['dashboard', 'leads_view', 'leads_create', 'leads_edit', 'leads_assign', 'leads_delete', 'pipeline', 'activities', 'customers', 'reports', 'manage_team']::TEXT[]
    WHEN 'SALES_MANAGER' THEN ARRAY['dashboard', 'leads_view', 'leads_create', 'leads_edit', 'leads_assign', 'pipeline', 'activities', 'reports']::TEXT[] || CASE WHEN "can_view_customers" THEN ARRAY['customers']::TEXT[] ELSE ARRAY[]::TEXT[] END
    ELSE ARRAY['dashboard', 'leads_view', 'leads_create', 'leads_edit', 'pipeline', 'activities', 'reports']::TEXT[] || CASE WHEN "can_view_customers" THEN ARRAY['customers']::TEXT[] ELSE ARRAY[]::TEXT[] END
END;

ALTER TABLE "users"
ALTER COLUMN "custom_role_id" SET NOT NULL,
DROP COLUMN "role",
DROP COLUMN "manager_id",
DROP COLUMN "can_view_customers";

ALTER TABLE "team_roles"
DROP COLUMN "permissions";

ALTER TABLE "users"
ADD CONSTRAINT "users_custom_role_id_fkey"
FOREIGN KEY ("custom_role_id") REFERENCES "team_roles"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX "users_custom_role_id_idx" ON "users"("custom_role_id");

DROP TYPE "UserRole";
