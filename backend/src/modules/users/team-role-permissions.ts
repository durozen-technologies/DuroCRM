export const TEAM_ROLE_PERMISSIONS = [
  "dashboard",
  "leads_view",
  "leads_create",
  "leads_edit",
  "leads_assign",
  "pipeline",
  "activities",
  "customers",
  "reports",
  "my_team",
  "manage_team",
] as const;

export type TeamRolePermission = (typeof TEAM_ROLE_PERMISSIONS)[number];
