const ACCESS_TOKEN_KEY = "durozen_access_token";
const AUTH_USER_KEY = "durozen_auth_user";

export type AuthUser = {
  id: string;
  name: string;
  email: string;
  customRole: {
    id: string;
    name: string;
    subordinateRoleIds?: string[];
  };
  permissions: string[];
  isCliAdmin: boolean;
  canViewTeam: boolean;
};

function isSubordinateRoleIds(value: unknown): value is string[] {
  return (
    Array.isArray(value) &&
    value.every((roleId) => typeof roleId === "string")
  );
}

function isCustomRole(value: unknown): value is AuthUser["customRole"] {
  return (
    typeof value === "object" &&
    value !== null &&
    "id" in value &&
    "name" in value &&
    typeof value.id === "string" &&
    typeof value.name === "string" &&
    (!("subordinateRoleIds" in value) ||
      isSubordinateRoleIds(value.subordinateRoleIds))
  );
}

export function getAccessToken(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(ACCESS_TOKEN_KEY);
}

export function setAccessToken(token: string): void {
  window.localStorage.setItem(ACCESS_TOKEN_KEY, token);
}

export function clearAccessToken(): void {
  if (typeof window !== "undefined") {
    window.localStorage.removeItem(ACCESS_TOKEN_KEY);
    window.localStorage.removeItem(AUTH_USER_KEY);
  }
}

export function setAuthUser(user: AuthUser): void {
  window.localStorage.setItem(AUTH_USER_KEY, JSON.stringify(user));
}

export function getAuthUser(): AuthUser | null {
  if (typeof window === "undefined") return null;
  const value = window.localStorage.getItem(AUTH_USER_KEY);
  if (value) {
    try {
      const user: unknown = JSON.parse(value);
      if (
        user &&
        typeof user === "object" &&
        "id" in user &&
        "name" in user &&
        "email" in user &&
        "customRole" in user &&
        "permissions" in user &&
        "isCliAdmin" in user &&
        "canViewTeam" in user &&
        typeof user.id === "string" &&
        typeof user.name === "string" &&
        typeof user.email === "string" &&
        typeof user.isCliAdmin === "boolean" &&
        typeof user.canViewTeam === "boolean" &&
        Array.isArray(user.permissions) &&
        user.permissions.every(
          (permission) => typeof permission === "string",
        ) &&
        isCustomRole(user.customRole)
      ) {
        return {
          id: user.id,
          name: user.name,
          email: user.email,
          customRole: user.customRole,
          permissions: user.permissions,
          isCliAdmin: user.isCliAdmin,
          canViewTeam: user.canViewTeam,
        };
      }
      return null;
    } catch {
      return null;
    }
  }
  return null;
}
