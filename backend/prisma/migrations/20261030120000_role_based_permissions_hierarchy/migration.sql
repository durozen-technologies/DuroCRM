ALTER TABLE "team_roles"
ADD COLUMN "description" TEXT NOT NULL DEFAULT '',
ADD COLUMN "permissions" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
ADD COLUMN "is_system" BOOLEAN NOT NULL DEFAULT FALSE;

UPDATE "team_roles" AS role
SET "permissions" = COALESCE(
    (
        SELECT array_agg(DISTINCT granted.permission ORDER BY granted.permission)
        FROM "users" AS user_account
        CROSS JOIN LATERAL unnest(user_account."permissions") AS granted(permission)
        WHERE user_account."custom_role_id" = role."id"
    ),
    ARRAY[]::TEXT[]
);

UPDATE "team_roles"
SET "is_system" = TRUE,
    "permissions" = ARRAY[
        'dashboard', 'leads_view', 'leads_create', 'leads_edit',
        'leads_assign', 'leads_delete', 'pipeline', 'activities',
        'customers', 'reports', 'manage_team'
    ]::TEXT[]
WHERE lower("name") = 'admin';

CREATE TABLE "_RoleSubordinates" (
    "A" UUID NOT NULL,
    "B" UUID NOT NULL,

    CONSTRAINT "_RoleSubordinates_AB_pkey" PRIMARY KEY ("A", "B"),
    CONSTRAINT "_RoleSubordinates_A_fkey"
        FOREIGN KEY ("A") REFERENCES "team_roles"("id")
        ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "_RoleSubordinates_B_fkey"
        FOREIGN KEY ("B") REFERENCES "team_roles"("id")
        ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "_RoleSubordinates_B_index" ON "_RoleSubordinates"("B");
