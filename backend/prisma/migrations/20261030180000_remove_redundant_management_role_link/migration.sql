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

    IF sales_manager_id IS NOT NULL
       AND team_lead_id IS NOT NULL
       AND bde_id IS NOT NULL
       AND EXISTS (
           SELECT 1
           FROM "_RoleSubordinates"
           WHERE "A" = team_lead_id AND "B" = sales_manager_id
       )
       AND EXISTS (
           SELECT 1
           FROM "_RoleSubordinates"
           WHERE "A" = sales_manager_id AND "B" = bde_id
       )
    THEN
        DELETE FROM "_RoleSubordinates"
        WHERE "A" = team_lead_id AND "B" = bde_id;
    END IF;
END $$;
