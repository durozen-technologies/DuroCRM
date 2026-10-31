import { ForbiddenException } from "@nestjs/common";

export type Actor = {
  sub: string;
  permissions: string[];
  roleId?: string;
  subordinateRoleIds?: string[];
  subordinateUserIds?: string[];
  isCliAdmin?: boolean;
};

export function assertActorPermission(
  actor: Actor,
  requiredPermission: string,
): void {
  if (!actor.permissions.includes(requiredPermission)) {
    throw new ForbiddenException();
  }
}

export function assertAnyActorPermission(
  actor: Actor,
  allowedPermissions: readonly string[],
): void {
  if (!allowedPermissions.some((permission) => actor.permissions.includes(permission))) {
    throw new ForbiddenException();
  }
}
