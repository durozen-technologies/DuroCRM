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
import { UpdateTeamUserDto } from "./dto/update-team-user.dto";

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  profile(id: string) {
    return this.prisma.user.findUniqueOrThrow({
      where: { id, isActive: true },
      select: {
        id: true,
        fullName: true,
        email: true,
        permissions: true,
        customRole: { select: { id: true, name: true } },
        isActive: true,
        isOnline: true,
        isCliAdmin: true,
        createdAt: true,
      },
    });
  }

  list() {
    return this.prisma.user.findMany({
      select: {
        id: true,
        fullName: true,
        email: true,
        permissions: true,
        customRole: { select: { id: true, name: true } },
        isActive: true,
        isOnline: true,
        isCliAdmin: true,
        createdAt: true,
        lastActiveAt: true,
      },
      orderBy: [{ isActive: "desc" }, { fullName: "asc" }],
    });
  }

  listTeamRoles() {
    return this.prisma.teamRole.findMany({
      select: {
        id: true,
        name: true,
        createdAt: true,
        updatedAt: true,
      },
      orderBy: { name: "asc" },
    });
  }

  async createTeamRole(name: string) {
    const normalizedName = name.trim();
    if (normalizedName.length < 2) {
      throw new BadRequestException("Role name must contain at least 2 characters.");
    }
    const duplicate = await this.prisma.teamRole.findFirst({
      where: { name: { equals: normalizedName, mode: "insensitive" } },
      select: { id: true },
    });
    if (duplicate) {
      throw new ConflictException("A role already uses this name.");
    }

    try {
      return await this.prisma.teamRole.create({
        data: { name: normalizedName },
        select: { id: true, name: true },
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

  async updateTeamRole(id: string, name: string) {
    const normalizedName = name.trim();
    if (normalizedName.length < 2) {
      throw new BadRequestException("Role name must contain at least 2 characters.");
    }
    const existing = await this.prisma.teamRole.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!existing) throw new NotFoundException("Role not found.");
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

    try {
      return await this.prisma.teamRole.update({
        where: { id },
        data: { name: normalizedName },
        select: { id: true, name: true },
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

  async deleteTeamRole(id: string) {
    const role = await this.prisma.teamRole.findUnique({
      where: { id },
      select: { id: true, _count: { select: { users: true } } },
    });
    if (!role) throw new NotFoundException("Role not found.");
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

  async updateUserPermissions(
    id: string,
    permissions: string[],
    actor: Actor,
  ) {
    const existing = await this.prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        isActive: true,
        permissions: true,
        isCliAdmin: true,
      },
    });
    if (!existing) throw new NotFoundException("User not found.");
    this.assertCliAdminIsSelfManaged(existing, actor.sub, id);
    await this.ensureAnotherTeamManager(id, existing, permissions);
    if (
      actor.sub === id &&
      existing.permissions.includes("manage_team") &&
      !permissions.includes("manage_team")
    ) {
      throw new BadRequestException(
        "You cannot remove your own team-management permission.",
      );
    }
    try {
      return await this.prisma.user.update({
        where: { id },
        data: { permissions },
        select: { id: true, permissions: true },
      });
    } catch (error) {
      if (
        error instanceof PrismaClientKnownRequestError &&
        error.code === "P2025"
      ) {
        throw new NotFoundException("User not found.");
      }
      throw error;
    }
  }

  async listTeamPage(
    page: number,
    pageSize: number,
    search: string | undefined,
    excludedUserId: string,
  ) {
    const where: Prisma.UserWhereInput = {
      id: { not: excludedUserId },
      ...(search
        ? {
            OR: [
              { fullName: { contains: search, mode: "insensitive" } },
              { email: { contains: search, mode: "insensitive" } },
            ],
          }
        : {}),
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.user.findMany({
        where,
        select: {
          id: true,
          fullName: true,
          email: true,
          permissions: true,
          isCliAdmin: true,
          customRole: { select: { id: true, name: true } },
          isActive: true,
          isOnline: true,
          createdAt: true,
          lastActiveAt: true,
          _count: { select: { leads: true } },
        },
        orderBy: [{ isActive: "desc" }, { fullName: "asc" }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.user.count({ where }),
    ]);
    return {
      items,
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    };
  }

  async create(dto: CreateUserDto) {
    const passwordHash = await bcrypt.hash(dto.password, 12);
    try {
      return await this.prisma.user.create({
        data: {
          fullName: dto.fullName,
          email: dto.email.toLowerCase(),
          passwordHash,
          customRoleId: dto.customRoleId,
          permissions: dto.permissions ?? [],
        },
        select: {
          id: true,
          fullName: true,
          email: true,
          permissions: true,
          customRole: { select: { id: true, name: true } },
          isActive: true,
        },
      });
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
    const existing = await this.prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        email: true,
        isActive: true,
        permissions: true,
        isCliAdmin: true,
      },
    });
    if (!existing) {
      throw new NotFoundException("Team account not found");
    }
    this.assertCliAdminIsSelfManaged(existing, actor.sub, id);
    if (dto.permissions !== undefined) {
      await this.ensureAnotherTeamManager(id, existing, dto.permissions);
      if (
        actor.sub === id &&
        existing.permissions.includes("manage_team") &&
        !dto.permissions.includes("manage_team")
      ) {
        throw new BadRequestException(
          "You cannot remove your own team-management permission.",
        );
      }
    }

    try {
      return await this.prisma.user.update({
        where: { id },
        data: {
          fullName: dto.fullName.trim(),
          email: dto.email.trim().toLowerCase(),
          ...(dto.customRoleId !== undefined
            ? { customRoleId: dto.customRoleId }
            : {}),
          ...(dto.permissions !== undefined
            ? { permissions: dto.permissions }
            : {}),
        },
        select: {
          id: true,
          fullName: true,
          email: true,
          permissions: true,
          customRole: { select: { id: true, name: true } },
          isActive: true,
        },
      });
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

  async updateTeamUserPassword(id: string, password: string, actorId: string) {
    const existing = await this.prisma.user.findUnique({
      where: { id },
      select: { id: true, isCliAdmin: true },
    });
    if (!existing) {
      throw new NotFoundException("Team account not found");
    }
    this.assertCliAdminIsSelfManaged(existing, actorId, id);

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
    actorId: string,
  ): Promise<Pick<User, "id" | "fullName" | "email" | "isActive">> {
    if (actorId === id && !isActive) {
      throw new BadRequestException("You cannot deactivate your own account.");
    }
    const existing = await this.prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        isActive: true,
        permissions: true,
        isCliAdmin: true,
      },
    });
    if (!existing) throw new NotFoundException("Team account not found");
    this.assertCliAdminIsSelfManaged(existing, actorId, id);
    if (!isActive) await this.ensureAnotherTeamManager(id, existing, []);
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

  async deleteTeamUser(id: string, actorId: string) {
    if (actorId === id) {
      throw new BadRequestException("You cannot delete your own account.");
    }
    try {
      await this.prisma.$transaction(
        async (transaction) => {
          const user = await transaction.user.findUnique({
            where: { id },
            select: {
              id: true,
              isActive: true,
              permissions: true,
              isCliAdmin: true,
              _count: { select: { leads: true } },
            },
          });
          if (!user) {
            throw new NotFoundException("Team account not found");
          }
          this.assertCliAdminIsSelfManaged(user, actorId, id);
          await this.ensureAnotherTeamManager(id, user, []);
          if (user._count.leads > 0) {
            throw new ConflictException(
              "This user owns leads. Reassign those leads before deleting the account.",
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
        ["P2003", "P2025", "P2034"].includes(error.code)
      ) {
        throw new ConflictException(
          "This account is still linked to CRM records. Reassign its records before deleting it.",
        );
      }
      throw error;
    }
    return { id, deleted: true };
  }

  private assertCliAdminIsSelfManaged(
    user: { isCliAdmin: boolean },
    actorId: string,
    targetId: string,
  ) {
    if (user.isCliAdmin && actorId !== targetId) {
      throw new ForbiddenException(
        "CLI-created admin accounts can only be managed by their own account or the CLI.",
      );
    }
  }

  private async ensureAnotherTeamManager(
    id: string,
    existing: { isActive: boolean; permissions: string[] },
    nextPermissions: string[],
  ) {
    if (
      !existing.isActive ||
      !existing.permissions.includes("manage_team") ||
      nextPermissions.includes("manage_team")
    ) {
      return;
    }
    const anotherManager = await this.prisma.user.count({
      where: {
        id: { not: id },
        isActive: true,
        permissions: { has: "manage_team" },
      },
    });
    if (anotherManager === 0) {
      throw new ConflictException(
        "At least one active user must retain team-management permission.",
      );
    }
  }
}
