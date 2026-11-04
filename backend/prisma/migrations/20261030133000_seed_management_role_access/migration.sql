UPDATE "team_roles"
SET "permissions" = ARRAY[
    'dashboard',
    'leads_view',
    'leads_create',
    'leads_edit',
    'leads_assign',
    'pipeline',
    'activities',
    'customers',
    'reports',
    'manage_team'
]::TEXT[]
WHERE lower(trim("name")) IN ('sales manager', 'team lead')
  AND cardinality("permissions") = 0;

DO $$
DECLARE
    sales_manager_id UUID;
    team_lead_id UUID;
    bde_id UUID;
BEGIN
    SELECT "id" INTO sales_manager_id
    FROM "team_roles"
    WHERE lower(trim("name")) = 'sales manager'
    LIMIT 1;

    SELECT "id" INTO team_lead_id
    FROM "team_roles"
    WHERE lower(trim("name")) = 'team lead'
    LIMIT 1;

    SELECT "id" INTO bde_id
    FROM "team_roles"
    WHERE lower(trim("name")) = 'bde'
    LIMIT 1;

    IF sales_manager_id IS NOT NULL AND team_lead_id IS NOT NULL THEN
        INSERT INTO "_RoleSubordinates" ("A", "B")
        VALUES (sales_manager_id, team_lead_id)
        ON CONFLICT ("A", "B") DO NOTHING;
    END IF;

    IF team_lead_id IS NOT NULL AND bde_id IS NOT NULL THEN
        INSERT INTO "_RoleSubordinates" ("A", "B")
        VALUES (team_lead_id, bde_id)
        ON CONFLICT ("A", "B") DO NOTHING;
    ELSIF sales_manager_id IS NOT NULL AND bde_id IS NOT NULL THEN
        INSERT INTO "_RoleSubordinates" ("A", "B")
        VALUES (sales_manager_id, bde_id)
        ON CONFLICT ("A", "B") DO NOTHING;
    END IF;
END $$;
