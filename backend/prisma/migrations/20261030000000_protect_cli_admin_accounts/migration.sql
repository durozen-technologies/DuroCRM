ALTER TABLE "users"
ADD COLUMN "is_cli_admin" BOOLEAN NOT NULL DEFAULT FALSE;

DO $$
DECLARE
    legacy_role_id UUID;
    admin_role_id UUID;
BEGIN
    SELECT "id" INTO legacy_role_id
    FROM "team_roles"
    WHERE "name" = 'Administrator';

    SELECT "id" INTO admin_role_id
    FROM "team_roles"
    WHERE "name" = 'Admin';

    IF legacy_role_id IS NOT NULL AND admin_role_id IS NOT NULL THEN
        UPDATE "users"
        SET "custom_role_id" = admin_role_id
        WHERE "custom_role_id" = legacy_role_id;

        DELETE FROM "team_roles"
        WHERE "id" = legacy_role_id;
    ELSIF legacy_role_id IS NOT NULL THEN
        UPDATE "team_roles"
        SET "name" = 'Admin'
        WHERE "id" = legacy_role_id;
    END IF;
END $$;

UPDATE "users" AS user_account
SET "is_cli_admin" = TRUE
FROM "team_roles" AS custom_role
WHERE user_account."custom_role_id" = custom_role."id"
  AND custom_role."name" = 'Admin'
  AND user_account."permissions" @> ARRAY['manage_team']::TEXT[];
