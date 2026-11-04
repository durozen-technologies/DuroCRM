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

    DELETE FROM "_RoleSubordinates"
    WHERE ("A" = sales_manager_id AND "B" = team_lead_id)
       OR ("A" = team_lead_id AND "B" = sales_manager_id)
       OR ("A" = sales_manager_id AND "B" = bde_id)
       OR ("A" = bde_id AND "B" = sales_manager_id)
       OR ("A" = team_lead_id AND "B" = bde_id)
       OR ("A" = bde_id AND "B" = team_lead_id);

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
