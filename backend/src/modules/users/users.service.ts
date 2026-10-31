import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { Prisma, User } from "@prisma/client";
import { PrismaClientKnownRequestError } from "@prisma/client/runtime/library";
import * as bcrypt from "bcrypt";
import { Actor } from "../../common/authorization/actor-permission";
import { PrismaService } from "../../prisma/prisma.service";
import { CreateUserDto } from "./dto/create-user.dto";
import { CreateTeamRoleDto } from "./dto/create-team-role.dto";
import { UpdateTeamUserDto } from "./dto/update-team-user.dto";
import { UpdateTeamRoleDto } from "./dto/update-team-role.dto";
import { USER_PERMISSIONS } from "./user-permissions";

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async profile(id: string) {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id, isActive: true },
      select: {
        id: true,
        fullName: true,
        email: true,
        customRole: { select: { id: true, name: true, permissions: true } },
        isActive: true,
        isOnline: true,
        isCliAdmin: true,
        createdAt: true,
      },
    });
    return this.withEffectivePermissions(user);
  }

  async list(actor: Actor) {
    this.assertCliAdmin(actor);
    const users = await this.prisma.user.findMany({
      select: {
        id: true,
        fullName: true,
        email: true,
        customRole: { select: { id: true, name: true, permissions: true } },
        isActive: true,
        isOnline: true,
        isCliAdmin: true,
        createdAt: true,
        lastActiveAt: true,
      },
      orderBy: [{ isActive: "desc" }, { fullName: "asc" }],
    });
    return users.map((user) => this.withEffectivePermissions(user));
  }

  async listTeamRoles(actor: Actor) {
    this.assertCliAdmin(actor);
    const roles = await this.prisma.teamRole.findMany({
      where: {
        isSystem: false,
        name: { not: "Admin", mode: "insensitive" },
      },
      select: {
        id: true,
        name: true,
        description: true,
        permissions: true,
        subordinateRoles: { select: { id: true } },
        createdAt: true,
        updatedAt: true,
      },
    });
    const roleDepths = this.getRoleDepths(roles);
    roles.sort(
      (left, right) =>
        roleDepths.get(left.id)! - roleDepths.get(right.id)! ||
        left.name.localeCompare(right.name),
    );
    return roles.map(({ subordinateRoles, ...role }) => {
      const assignable =
        actor.isCliAdmin === true ||
        (actor.subordinateRoleIds ?? []).includes(role.id);
      return {
        ...role,
        subordinateRoleIds: subordinateRoles.map(({ id }) => id),
        assignable,
        manageable: assignable,
      };
    });
  }

  async createTeamRole(dto: CreateTeamRoleDto, actor: Actor) {
    this.assertCliAdmin(actor);
    const normalizedName = dto.name.trim();
    if (normalizedName.length < 2) {
      throw new BadRequestException("Role name must contain at least 2 characters.");
    }
    if (normalizedName.toLowerCase() === "admin") {
      throw new BadRequestException("Admin is a predefined system role.");
    }
    await this.validateSubordinateRoles(dto.subordinateRoleIds ?? [], actor);
    const duplicate = await this.prisma.teamRole.findFirst({
      where: { name: { equals: normalizedName, mode: "insensitive" } },
      select: { id: true },
    });
    if (duplicate) {
      throw new ConflictException("A role already uses this name.");
    }

    try {
      return await this.prisma.teamRole.create({
        data: {
          name: normalizedName,
          description: dto.description?.trim() ?? "",
          permissions: dto.permissions,
          subordinateRoles: {
            connect: dto.subordinateRoleIds.map((id) => ({ id })),
          },
        },
        select: {
          id: true,
          name: true,
          description: true,
          permissions: true,
          subordinateRoles: { select: { id: true } },
        },
      });
    } catch (error) {
      if (
        error instanceof PrismaClientKnownRequestError &&
        error.code === "P2002"
      ) {
        throw new ConflictException("A role already uses this name.");
      }
      throw error;
    }
  }

  async updateTeamRole(id: string, dto: UpdateTeamRoleDto, actor: Actor) {
    this.assertCliAdmin(actor);
    const existing = await this.prisma.teamRole.findUnique({
      where: { id },
      select: { id: true, name: true, isSystem: true },
    });
    if (!existing) throw new NotFoundException("Role not found.");
    if (existing.isSystem || existing.name.trim().toLowerCase() === "admin") {
      throw new ForbiddenException("The Admin system role cannot be changed.");
    }
    this.assertCanManageRole(id, actor);

    let normalizedName: string | undefined;
    if (dto.name !== undefined) {
      normalizedName = dto.name.trim();
      if (normalizedName.length < 2) {
        throw new BadRequestException("Role name must contain at least 2 characters.");
      }
      if (normalizedName.toLowerCase() === "admin") {
        throw new BadRequestException("Admin is a predefined system role.");
      }
      const duplicate = await this.prisma.teamRole.findFirst({
        where: {
          id: { not: id },
          name: { equals: normalizedName, mode: "insensitive" },
        },
        select: { id: true },
      });
      if (duplicate) {
        throw new ConflictException("A role already uses this name.");
      }
    }

    if (dto.subordinateRoleIds !== undefined) {
      await this.validateSubordinateRoles(dto.subordinateRoleIds, actor, id);
      await this.assertRoleHierarchyPreservesReportingAssignments(
        id,
        dto.subordinateRoleIds,
      );
    }
    try {
      return await this.prisma.teamRole.update({
        where: { id },
        data: {
          ...(normalizedName !== undefined ? { name: normalizedName } : {}),
          ...(dto.description !== undefined
            ? { description: dto.description.trim() }
            : {}),
          ...(dto.permissions !== undefined
            ? { permissions: dto.permissions }
            : {}),
          ...(dto.subordinateRoleIds !== undefined
            ? {
                subordinateRoles: {
                  set: dto.subordinateRoleIds.map((roleId) => ({
                    id: roleId,
                  })),
                },
              }
            : {}),
        },
        select: {
          id: true,
          name: true,
          description: true,
          permissions: true,
          subordinateRoles: { select: { id: true } },
        },
      });
    } catch (error) {
      if (
        error instanceof PrismaClientKnownRequestError &&
        error.code === "P2002"
      ) {
        throw new ConflictException("A role already uses this name.");
      }
      if (
        error instanceof PrismaClientKnownRequestError &&
        error.code === "P2025"
      ) {
        throw new NotFoundException("Role not found.");
      }
      throw error;
    }
  }

  async deleteTeamRole(id: string, actor: Actor) {
    this.assertCliAdmin(actor);
    const role = await this.prisma.teamRole.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        isSystem: true,
        _count: { select: { users: true } },
      },
    });
    if (!role) throw new NotFoundException("Role not found.");
    if (role.isSystem || role.name.trim().toLowerCase() === "admin") {
      throw new ForbiddenException("The Admin system role cannot be deleted.");
    }
    this.assertCanManageRole(id, actor);
    if (role._count.users > 0) {
      throw new ConflictException(
        "This role is assigned to users. Reassign them before deleting it.",
      );
    }
    try {
      await this.prisma.teamRole.delete({ where: { id } });
      return { id };
    } catch (error) {
      if (
        error instanceof PrismaClientKnownRequestError &&
        error.code === "P2003"
      ) {
        throw new ConflictException(
          "This role is assigned to users. Reassign them before deleting it.",
        );
      }
      if (
        error instanceof PrismaClientKnownRequestError &&
        error.code === "P2025"
      ) {
        throw new NotFoundException("Role not found.");
      }
      throw error;
    }
  }

  async listTeamPage(
    page: number,
    pageSize: number,
    search: string | undefined,
    roleId: string | undefined,
    status: "active" | "inactive" | undefined,
    actor: Actor,
  ) {
    const where: Prisma.UserWhereInput = {
      id: actor.isCliAdmin
        ? { not: actor.sub }
        : { not: actor.sub, in: actor.subordinateUserIds ?? [] },
      ...(roleId ? { customRoleId: roleId } : {}),
      ...(status ? { isActive: status === "active" } : {}),
      ...(search
        ? {
            OR: [
              { fullName: { contains: search, mode: "insensitive" } },
              { email: { contains: search, mode: "insensitive" } },
            ],
          }
        : {}),
    };
    const [users, total] = await this.prisma.$transaction([
      this.prisma.user.findMany({
        where,
        select: {
          id: true,
          fullName: true,
          email: true,
          isCliAdmin: true,
          customRole: { select: { id: true, name: true, permissions: true } },
          reportsToId: true,
          reportsTo: { select: { id: true, fullName: true } },
          isActive: true,
          isOnline: true,
          createdAt: true,
          lastActiveAt: true,
          _count: { select: { leads: true } },
        },
      }),
      this.prisma.user.count({ where }),
    ]);
    const roleFilters = await this.prisma.teamRole.findMany({
      where: actor.isCliAdmin
        ? {
            isSystem: false,
            name: { not: "Admin", mode: "insensitive" },
          }
        : { id: { in: actor.subordinateRoleIds ?? [] } },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    });
    if (roleId && !roleFilters.some((role) => role.id === roleId)) {
      throw new BadRequestException(
        "You can only filter by roles in your reporting hierarchy.",
      );
    }
    const roles = await this.prisma.teamRole.findMany({
      select: { id: true, subordinateRoles: { select: { id: true } } },
    });
    const supervisors = actor.isCliAdmin
      ? await this.prisma.user.findMany({
          where: { isActive: true, isCliAdmin: false },
          select: {
            id: true,
            fullName: true,
            customRoleId: true,
            customRole: { select: { name: true } },
          },
          orderBy: { fullName: "asc" },
        })
      : [];
    const roleDepths = this.getRoleDepths(roles);
    const orderedUsers = [...users].sort(
      (left, right) =>
        (roleDepths.get(left.customRole.id) ?? 0) -
          (roleDepths.get(right.customRole.id) ?? 0) ||
        left.customRole.name.localeCompare(right.customRole.name) ||
        Number(right.isActive) - Number(left.isActive) ||
        left.fullName.localeCompare(right.fullName),
    );
    const pageUsers = orderedUsers.slice(
      (page - 1) * pageSize,
      page * pageSize,
    );
    return {
      items: pageUsers.map((user) => ({
        ...this.withEffectivePermissions(user),
        reportsToId: user.reportsToId,
        reportsTo: user.reportsTo,
        eligibleSupervisors: supervisors
          .filter(
            (supervisor) =>
              supervisor.id !== user.id &&
              this.roleDirectlySupervisesInGraph(
                supervisor.customRoleId,
                user.customRole.id,
                roles,
              ),
          )
          .map(({ id, fullName, customRole }) => ({
            id,
            fullName,
            roleName: customRole.name,
          })),
      })),
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
      roleFilters,
    };
  }

  async create(dto: CreateUserDto, actor: Actor) {
    this.assertCliAdmin(actor);
    await this.assertAssignableRole(dto.customRoleId, actor);
    const passwordHash = await bcrypt.hash(dto.password, 12);
    try {
      const user = await this.prisma.user.create({
        data: {
          fullName: dto.fullName,
          email: dto.email.toLowerCase(),
          passwordHash,
          customRoleId: dto.customRoleId,
        },
        select: {
          id: true,
          fullName: true,
          email: true,
          customRole: { select: { id: true, name: true, permissions: true } },
          isActive: true,
          isCliAdmin: true,
        },
      });
      return this.withEffectivePermissions(user);
    } catch (error) {
      if (
        error instanceof PrismaClientKnownRequestError &&
        error.code === "P2002"
      ) {
        throw new ConflictException(
          "An account already uses this email address",
        );
      }
      throw error;
    }
  }

  async updateTeamUser(id: string, dto: UpdateTeamUserDto, actor: Actor) {
    this.assertCliAdmin(actor);
    const existing = await this.prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        email: true,
        customRoleId: true,
        isCliAdmin: true,
        reportsToId: true,
      },
    });
    if (!existing) {
      throw new NotFoundException("Team account not found");
    }
    this.assertNotCliAdmin(existing);
    this.assertCanManageRole(existing.customRoleId, actor, id);
    if (dto.customRoleId !== undefined) {
      if (actor.sub === id && dto.customRoleId !== existing.customRoleId) {
        throw new ForbiddenException("You cannot change your own custom role.");
      }
      await this.assertAssignableRole(dto.customRoleId, actor);
      await this.assertReportingHierarchyForRoleChange(
        id,
        dto.customRoleId,
        existing.reportsToId,
      );
    }

    try {
      const user = await this.prisma.user.update({
        where: { id },
        data: {
          fullName: dto.fullName.trim(),
          email: dto.email.trim().toLowerCase(),
          ...(dto.customRoleId !== undefined
            ? { customRoleId: dto.customRoleId }
            : {}),
        },
        select: {
          id: true,
          fullName: true,
          email: true,
          customRole: { select: { id: true, name: true, permissions: true } },
          isActive: true,
          isCliAdmin: true,
        },
      });
      return this.withEffectivePermissions(user);
    } catch (error) {
      if (
        error instanceof PrismaClientKnownRequestError &&
        error.code === "P2002"
      ) {
        throw new ConflictException(
          "An account already uses this email address",
        );
      }
      throw error;
    }
  }

  async assignSupervisor(
    id: string,
    supervisorId: string | null,
    actor: Actor,
  ) {
    this.assertCliAdmin(actor);
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        isCliAdmin: true,
        customRoleId: true,
      },
    });
    if (!user) throw new NotFoundException("Team account not found.");
    this.assertNotCliAdmin(user);

    if (supervisorId !== null) {
      if (supervisorId === id) {
        throw new BadRequestException("A user cannot be their own supervisor.");
      }
      const supervisor = await this.prisma.user.findUnique({
        where: { id: supervisorId, isActive: true },
        select: { id: true, isCliAdmin: true, customRoleId: true },
      });
      if (!supervisor) {
        throw new NotFoundException("Active supervisor account not found.");
      }
      if (supervisor.isCliAdmin) {
        throw new BadRequestException(
          "Admin is the highest system role and cannot be assigned as a supervisor.",
        );
      }
      if (
        !(await this.roleDirectlySupervises(
          supervisor.customRoleId,
          user.customRoleId,
        ))
      ) {
        throw new BadRequestException(
          "The selected supervisor must have the immediately superior role in the configured role hierarchy.",
        );
      }
    }

    return this.prisma.user.update({
      where: { id },
      data: { reportsToId: supervisorId },
      select: {
        id: true,
        reportsToId: true,
        reportsTo: { select: { id: true, fullName: true } },
      },
    });
  }

  async updateTeamUserPassword(id: string, password: string, actor: Actor) {
    this.assertCliAdmin(actor);
    const existing = await this.prisma.user.findUnique({
      where: { id },
      select: { id: true, isCliAdmin: true, customRoleId: true },
    });
    if (!existing) {
      throw new NotFoundException("Team account not found");
    }
    this.assertNotCliAdmin(existing);
    this.assertCanManageRole(existing.customRoleId, actor, id);

    const passwordHash = await bcrypt.hash(password, 12);
    await this.prisma.user.update({
      where: { id },
      data: {
        passwordHash,
        tokenVersion: { increment: 1 },
        isOnline: false,
      },
    });
    return { message: "Team account password updated." };
  }

  async setActive(
    id: string,
    isActive: boolean,
    actor: Actor,
  ): Promise<Pick<User, "id" | "fullName" | "email" | "isActive">> {
    this.assertCliAdmin(actor);
    if (actor.sub === id && !isActive) {
      throw new BadRequestException("You cannot deactivate your own account.");
    }
    const existing = await this.prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        isActive: true,
        isCliAdmin: true,
        customRoleId: true,
      },
    });
    if (!existing) throw new NotFoundException("Team account not found");
    this.assertNotCliAdmin(existing);
    this.assertCanManageRole(existing.customRoleId, actor, id);
    if (!isActive) await this.ensureAnotherTeamManager(id, existing);
    return this.prisma.user.update({
      where: { id },
      data: { isActive, ...(isActive ? {} : { isOnline: false }) },
      select: {
        id: true,
        fullName: true,
        email: true,
        isActive: true,
      },
    });
  }

  async deleteTeamUser(id: string, actor: Actor) {
    this.assertCliAdmin(actor);
    if (actor.sub === id) {
      throw new BadRequestException("You cannot delete your own account.");
    }
    try {
      await this.prisma.$transaction(
        async (transaction) => {
          const user = await transaction.user.findUnique({
            where: { id },
            select: {
              id: true,
              fullName: true,
              isActive: true,
              customRoleId: true,
              isCliAdmin: true,
              _count: { select: { leads: true } },
            },
          });
          if (!user) {
            throw new NotFoundException("Team account not found");
          }
          this.assertNotCliAdmin(user);
          this.assertCanManageRole(user.customRoleId, actor, id);
          await this.ensureAnotherTeamManager(id, user, transaction);
          const reportingUsers = await transaction.user.findMany({
            where: { reportsToId: { not: null } },
            select: {
              id: true,
              reportsToId: true,
            },
          });
          const reportsBySupervisor = new Map<string, typeof reportingUsers>();
          for (const reportingUser of reportingUsers) {
            if (!reportingUser.reportsToId) continue;
            const reports =
              reportsBySupervisor.get(reportingUser.reportsToId) ?? [];
            reports.push(reportingUser);
            reportsBySupervisor.set(reportingUser.reportsToId, reports);
          }
          let dependentUserCount = 0;
          const visited = new Set<string>([id]);
          const pending = [...(reportsBySupervisor.get(id) ?? [])];
          for (let index = 0; index < pending.length; index += 1) {
            const dependentUser = pending[index];
            if (visited.has(dependentUser.id)) continue;
            visited.add(dependentUser.id);
            dependentUserCount += 1;
            pending.push(
              ...(reportsBySupervisor.get(dependentUser.id) ?? []),
            );
          }
          if (dependentUserCount > 0 || user._count.leads > 0) {
            const reasons = [
              dependentUserCount > 0
                ? `${dependentUserCount} reporting ${
                    dependentUserCount === 1 ? "user" : "users"
                  }`
                : "",
              user._count.leads > 0
                ? `${user._count.leads} assigned ${
                    user._count.leads === 1 ? "lead" : "leads"
                  }`
                : "",
            ]
              .filter(Boolean)
              .join(" and ");
            throw new ConflictException(
              `Cannot delete ${user.fullName}: ${reasons} still depend on this account.\nReassign them before retrying.`,
            );
          }
          await transaction.user.delete({ where: { id } });
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
    } catch (error) {
      if (
        error instanceof NotFoundException ||
        error instanceof ConflictException
      ) {
        throw error;
      }
      if (
        error instanceof PrismaClientKnownRequestError &&
        error.code === "P2003"
      ) {
        throw new ConflictException(
          "This account still has dependent reporting assignments or linked CRM records. Refresh the team and resolve those dependencies before retrying.",
        );
      }
      if (
        error instanceof PrismaClientKnownRequestError &&
        error.code === "P2025"
      ) {
        throw new ConflictException(
          "The account changed or was deleted during this request. Refresh the team and retry.",
        );
      }
      if (
        error instanceof PrismaClientKnownRequestError &&
        error.code === "P2034"
      ) {
        throw new ConflictException(
          "Team dependencies changed during deletion. Refresh the team, resolve any new dependencies, and retry.",
        );
      }
      throw error;
    }
    return { id, deleted: true };
  }

  private assertNotCliAdmin(user: { isCliAdmin: boolean }) {
    if (user.isCliAdmin) {
      throw new ForbiddenException(
        "CLI-created Admin accounts cannot be managed through team management.",
      );
    }
  }

  private assertCliAdmin(actor: Actor) {
    if (!actor.isCliAdmin) {
      throw new ForbiddenException(
        "Only Admin can create or manage team accounts and custom roles.",
      );
    }
  }

  private async roleDirectlySupervises(
    superiorRoleId: string,
    subordinateRoleId: string,
  ) {
    const roles = await this.prisma.teamRole.findMany({
      select: { id: true, subordinateRoles: { select: { id: true } } },
    });
    return this.roleDirectlySupervisesInGraph(
      superiorRoleId,
      subordinateRoleId,
      roles,
    );
  }

  private roleDirectlySupervisesInGraph(
    superiorRoleId: string,
    subordinateRoleId: string,
    roles: Array<{ id: string; subordinateRoles: Array<{ id: string }> }>,
  ) {
    if (
      superiorRoleId === subordinateRoleId ||
      !roles
        .find((role) => role.id === superiorRoleId)
        ?.subordinateRoles.some(({ id }) => id === subordinateRoleId)
    ) {
      return false;
    }

    return !roles.some(
      (role) =>
        role.id !== superiorRoleId &&
        role.id !== subordinateRoleId &&
        this.roleSupervisesInGraph(superiorRoleId, role.id, roles) &&
        this.roleSupervisesInGraph(role.id, subordinateRoleId, roles),
    );
  }

  private roleSupervisesInGraph(
    superiorRoleId: string,
    subordinateRoleId: string,
    roles: Array<{ id: string; subordinateRoles: Array<{ id: string }> }>,
  ) {
    const childrenByRole = new Map(
      roles.map((role) => [
        role.id,
        role.subordinateRoles.map(({ id }) => id),
      ]),
    );
    const visited = new Set<string>();
    const pending = [...(childrenByRole.get(superiorRoleId) ?? [])];
    while (pending.length > 0) {
      const roleId = pending.pop()!;
      if (roleId === subordinateRoleId) return true;
      if (visited.has(roleId)) continue;
      visited.add(roleId);
      pending.push(...(childrenByRole.get(roleId) ?? []));
    }
    return false;
  }

  private async assertReportingHierarchyForRoleChange(
    userId: string,
    nextRoleId: string,
    reportsToId: string | null,
  ) {
    if (reportsToId) {
      const supervisor = await this.prisma.user.findUnique({
        where: { id: reportsToId },
        select: { isCliAdmin: true, customRoleId: true },
      });
      if (
        supervisor &&
        !supervisor.isCliAdmin &&
        !(await this.roleDirectlySupervises(
          supervisor.customRoleId,
          nextRoleId,
        ))
      ) {
        throw new BadRequestException(
          "The selected role is not subordinate to this user’s assigned supervisor.",
        );
      }
    }

    const directReports = await this.prisma.user.findMany({
      where: { reportsToId: userId },
      select: { customRoleId: true },
    });
    const roles = await this.prisma.teamRole.findMany({
      select: { id: true, subordinateRoles: { select: { id: true } } },
    });
    if (
      directReports.some(
        (report) =>
          !this.roleDirectlySupervisesInGraph(
            nextRoleId,
            report.customRoleId,
            roles,
          ),
      )
    ) {
      throw new BadRequestException(
        "The selected role would no longer be above one or more assigned team members.",
      );
    }
  }

  private async assertRoleHierarchyPreservesReportingAssignments(
    roleId: string,
    subordinateRoleIds: string[],
  ) {
    const roles = await this.prisma.teamRole.findMany({
      select: { id: true, subordinateRoles: { select: { id: true } } },
    });
    const updatedRoles = roles.map((role) =>
      role.id === roleId
        ? {
            ...role,
            subordinateRoles: subordinateRoleIds.map((id) => ({ id })),
          }
        : role,
    );
    const reportingAssignments = await this.prisma.user.findMany({
      where: { reportsToId: { not: null } },
      select: {
        customRoleId: true,
        reportsTo: {
          select: { customRoleId: true, isCliAdmin: true },
        },
      },
    });
    if (
      reportingAssignments.some(
        ({ customRoleId, reportsTo }) =>
          reportsTo &&
          !reportsTo.isCliAdmin &&
          !this.roleDirectlySupervisesInGraph(
            reportsTo.customRoleId,
            customRoleId,
            updatedRoles,
          ),
      )
    ) {
      throw new BadRequestException(
        "This role hierarchy change conflicts with assigned team reporting lines. Update those assignments first.",
      );
    }
  }

  private assertCanManageRole(
    roleId: string,
    actor: Actor,
    targetUserId?: string,
  ) {
    if (actor.isCliAdmin || actor.sub === targetUserId) return;
    if (!(actor.subordinateRoleIds ?? []).includes(roleId)) {
      throw new ForbiddenException(
        "You can only manage users and roles in your subordinate hierarchy.",
      );
    }
  }

  private async assertAssignableRole(roleId: string, actor: Actor) {
    const role = await this.prisma.teamRole.findUnique({
      where: { id: roleId },
      select: { id: true, name: true, isSystem: true },
    });
    if (!role) throw new NotFoundException("Custom role not found.");
    if (role.isSystem || role.name.trim().toLowerCase() === "admin") {
      throw new ForbiddenException("The Admin system role cannot be assigned.");
    }
    this.assertCanManageRole(roleId, actor);
  }

  private async validateSubordinateRoles(
    subordinateRoleIds: string[],
    actor: Actor,
    roleBeingUpdated?: string,
  ) {
    const roles = await this.prisma.teamRole.findMany({
      select: {
        id: true,
        name: true,
        isSystem: true,
        subordinateRoles: { select: { id: true } },
      },
    });
    const roleById = new Map(roles.map((role) => [role.id, role]));
    for (const subordinateId of subordinateRoleIds) {
      const subordinate = roleById.get(subordinateId);
      if (!subordinate) throw new NotFoundException("Subordinate role not found.");
      if (
        subordinate.isSystem ||
        subordinate.name.trim().toLowerCase() === "admin"
      ) {
        throw new BadRequestException("Admin cannot be a subordinate custom role.");
      }
      if (roleBeingUpdated && subordinateId === roleBeingUpdated) {
        throw new BadRequestException("A role cannot be subordinate to itself.");
      }
      this.assertCanManageRole(subordinateId, actor);
      if (roleBeingUpdated) {
        const visited = new Set<string>();
        const pending = [subordinateId];
        while (pending.length) {
          const currentId = pending.pop()!;
          if (currentId === roleBeingUpdated) {
            throw new BadRequestException(
              "This hierarchy change would create a role cycle.",
            );
          }
          if (visited.has(currentId)) continue;
          visited.add(currentId);
          pending.push(
            ...(roleById.get(currentId)?.subordinateRoles.map(({ id }) => id) ??
              []),
          );
        }
      }
    }
  }

  private withEffectivePermissions<
    T extends { isCliAdmin: boolean; customRole: { permissions: string[] } },
  >(user: T) {
    const { customRole, ...rest } = user;
    const { permissions, ...role } = customRole;
    return {
      ...rest,
      customRole: role,
      permissions: user.isCliAdmin ? [...USER_PERMISSIONS] : permissions,
    };
  }

  private getRoleDepths(
    roles: Array<{ id: string; subordinateRoles: Array<{ id: string }> }>,
  ) {
    const depths = new Map<string, number>();
    const rolesById = new Map(roles.map((role) => [role.id, role]));
    const getDepth = (roleId: string, visiting = new Set<string>()): number => {
      const cachedDepth = depths.get(roleId);
      if (cachedDepth !== undefined) return cachedDepth;
      const role = rolesById.get(roleId);
      if (!role || visiting.has(roleId)) return 0;
      const nextVisiting = new Set(visiting).add(roleId);
      const subordinateRoles = role.subordinateRoles ?? [];
      const depth =
        subordinateRoles.length === 0
          ? 0
          : 1 +
            Math.max(
              ...subordinateRoles.map(({ id }) => getDepth(id, nextVisiting)),
            );
      depths.set(roleId, depth);
      return depth;
    };
    roles.forEach(({ id }) => getDepth(id));
    return depths;
  }

  private async ensureAnotherTeamManager(
    id: string,
    existing: { isActive: boolean; customRoleId: string },
    prisma: Pick<Prisma.TransactionClient, "user" | "teamRole"> = this.prisma,
  ) {
    if (
      !existing.isActive ||
      !(await this.roleHasPermission(
        existing.customRoleId,
        "manage_team",
        prisma,
      ))
    ) {
      return;
    }
    const anotherManager = await prisma.user.count({
      where: {
        id: { not: id },
        isActive: true,
        customRole: { permissions: { has: "manage_team" } },
      },
    });
    if (anotherManager === 0) {
      throw new ConflictException(
        "At least one active user must retain team-management permission.",
      );
    }
  }

  private async roleHasPermission(
    roleId: string,
    permission: string,
    prisma: Pick<Prisma.TransactionClient, "teamRole"> = this.prisma,
  ) {
    const role = await prisma.teamRole.findUnique({
      where: { id: roleId },
      select: { permissions: true },
    });
    return role?.permissions.includes(permission) ?? false;
  }
}
