import { CanActivate, ExecutionContext, Injectable } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { PERMISSIONS_KEY } from "../decorators/permissions.decorator";

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const permissions = this.reflector.getAllAndOverride<string[]>(
      PERMISSIONS_KEY,
      [
        context.getHandler(),
        context.getClass(),
      ],
    );
    if (!permissions?.length) return true;

    const request = context.switchToHttp().getRequest();
    const grantedPermissions: string[] = request.user?.permissions ?? [];
    return permissions.some((permission) =>
      grantedPermissions.includes(permission),
    );
  }
}
