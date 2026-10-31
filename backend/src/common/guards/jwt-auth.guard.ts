import {
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
} from "@nestjs/common";
import { Injectable } from "@nestjs/common";
import { JwtPayload, TokenExpiredError } from "jsonwebtoken";
import { verify } from "jsonwebtoken";
import { getJwtSecret } from "../../config/jwt.config";
import { USER_PERMISSIONS } from "../../modules/users/user-permissions";
import { PrismaService } from "../../prisma/prisma.service";

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const authorization = request.headers.authorization;
    const token = authorization?.startsWith("Bearer ")
      ? authorization.slice(7)
      : undefined;

    if (!token) throw new UnauthorizedException();

    let claims: JwtPayload | string;
    try {
      claims = verify(token, getJwtSecret());
    } catch (error) {
      if (error instanceof TokenExpiredError) {
        throw new UnauthorizedException({
          code: "TOKEN_EXPIRED",
          message: "Your session has expired. Please sign in again.",
        });
      }
      throw new UnauthorizedException();
    }

    if (
      typeof claims === "string" ||
      typeof claims.sub !== "string" ||
      (claims.tokenVersion !== undefined &&
        (!Number.isInteger(claims.tokenVersion) || claims.tokenVersion < 0))
    ) {
      throw new UnauthorizedException();
    }
    const user = await this.prisma.user.findUnique({
      where: { id: claims.sub },
      select: {
        id: true,
        isCliAdmin: true,
        customRole: { select: { id: true, name: true, permissions: true } },
        fullName: true,
        email: true,
        isActive: true,
        tokenVersion: true,
      },
    });
    if (
      !user?.isActive ||
      (typeof claims.tokenVersion === "number" ? claims.tokenVersion : 0) !==
        user.tokenVersion
    ) {
      throw new UnauthorizedException();
    }

    const roleGraph = await this.prisma.teamRole.findMany({
      select: {
        id: true,
        subordinateRoles: { select: { id: true } },
      },
    });
    const roleChildren = new Map(
      roleGraph.map((role) => [
        role.id,
        role.subordinateRoles.map((subordinate) => subordinate.id),
      ]),
    );
    const subordinateRoleIds = new Set<string>();
    const pending = [...(roleChildren.get(user.customRole.id) ?? [])];
    while (pending.length) {
      const roleId = pending.pop()!;
      if (subordinateRoleIds.has(roleId) || roleId === user.customRole.id) {
        continue;
      }
      subordinateRoleIds.add(roleId);
      pending.push(...(roleChildren.get(roleId) ?? []));
    }

    const reportingLines = await this.prisma.user.findMany({
      where: { reportsToId: { not: null } },
      select: { id: true, reportsToId: true },
    });
    const directReportsBySupervisor = new Map<string, string[]>();
    for (const reportingLine of reportingLines) {
      if (!reportingLine.reportsToId) continue;
      const reports = directReportsBySupervisor.get(reportingLine.reportsToId) ?? [];
      reports.push(reportingLine.id);
      directReportsBySupervisor.set(reportingLine.reportsToId, reports);
    }
    const subordinateUserIds = new Set<string>();
    const pendingUsers = [...(directReportsBySupervisor.get(user.id) ?? [])];
    while (pendingUsers.length) {
      const userId = pendingUsers.pop()!;
      if (subordinateUserIds.has(userId) || userId === user.id) continue;
      subordinateUserIds.add(userId);
      pendingUsers.push(...(directReportsBySupervisor.get(userId) ?? []));
    }

    request.user = {
      sub: user.id,
      permissions: user.isCliAdmin
        ? [...USER_PERMISSIONS]
        : user.customRole.permissions,
      customRole: user.customRole,
      name: user.fullName,
      email: user.email,
      roleId: user.customRole.id,
      subordinateRoleIds: [...subordinateRoleIds],
      subordinateUserIds: [...subordinateUserIds],
      isCliAdmin: user.isCliAdmin,
    };
    return true;
  }
}
