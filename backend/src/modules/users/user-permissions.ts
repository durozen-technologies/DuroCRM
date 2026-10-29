export const USER_PERMISSIONS = [
  "dashboard",
  "leads_view",
  "leads_create",
  "leads_edit",
  "leads_assign",
  "leads_delete",
  "pipeline",
  "activities",
  "customers",
  "reports",
  "manage_team",
] as const;

export type UserPermission = (typeof USER_PERMISSIONS)[number];
