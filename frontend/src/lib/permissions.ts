function matchesRoute(pathname: string, route: string): boolean {
  return pathname === route || pathname.startsWith(`${route}/`);
}

export function canAccessRoute(
  permissions: string[],
  pathname: string,
  canViewTeam = permissions.includes("manage_team"),
): boolean {
  if (matchesRoute(pathname, "/access-required")) return true;
  if (matchesRoute(pathname, "/team")) return canViewTeam;
  const requiredPermission = [
    ["/leads/new", "leads_create"],
    ["/dashboard", "dashboard"],
    ["/pipeline", "pipeline"],
    ["/activities", "activities"],
    ["/meetings", "activities"],
    ["/proposals", "activities"],
    ["/negotiations", "activities"],
    ["/customers", "customers"],
    ["/reports", "reports"],
    ["/monthly-summary", "reports"],
    ["/performance", "reports"],
    ["/team", "manage_team"],
  ].find(([route]) => matchesRoute(pathname, route));
  if (requiredPermission) return permissions.includes(requiredPermission[1]);
  if (matchesRoute(pathname, "/leads")) {
    return ["leads_view", "leads_edit", "leads_assign"].some((permission) =>
      permissions.includes(permission),
    );
  }
  return false;
}

export function defaultRouteForPermissions(
  permissions: string[],
  canViewTeam = permissions.includes("manage_team"),
): string {
  if (permissions.includes("dashboard")) return "/dashboard";
  if (
    [
      "leads_view",
      "leads_edit",
      "leads_assign",
    ].some((permission) =>
      permissions.includes(permission),
    )
  ) {
    return "/leads";
  }
  if (permissions.includes("pipeline")) return "/pipeline";
  if (permissions.includes("leads_create")) return "/leads/new";
  if (permissions.includes("activities")) return "/activities";
  if (permissions.includes("customers")) return "/customers";
  if (permissions.includes("reports")) return "/reports";
  if (canViewTeam) return "/team";
  return "/access-required";
}
