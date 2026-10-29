import * as assert from "node:assert/strict";
import { test } from "node:test";
import {
  ConflictException,
  ForbiddenException,
} from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";
import { UsersService } from "./users.service";

test("lists custom role labels without permission bundles", async () => {
  let query: unknown;
  const service = new UsersService({
    teamRole: {
      findMany: async (args: unknown) => {
        query = args;
        return [];
      },
    },
  } as unknown as PrismaService);

  await service.listTeamRoles();

  assert.deepEqual(query, {
    select: {
      id: true,
      name: true,
      createdAt: true,
      updatedAt: true,
    },
    orderBy: { name: "asc" },
  });
});

test("excludes the signed-in user from the paginated team members list", async () => {
  const queries: { findMany?: unknown; count?: unknown } = {};
  const service = new UsersService({
    user: {
      findMany: async (args: unknown) => {
        queries.findMany = args;
        return [];
      },
      count: async (args: unknown) => {
        queries.count = args;
        return 2;
      },
    },
    $transaction: async (queries: Promise<unknown>[]) =>
      Promise.all(queries),
  } as unknown as PrismaService);

  const result = await service.listTeamPage(1, 10, undefined, "self-user");

  assert.deepEqual(queries.findMany, {
    where: { id: { not: "self-user" } },
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
    skip: 0,
    take: 10,
  });
  assert.deepEqual(queries.count, { where: { id: { not: "self-user" } } });
  assert.equal(result.total, 2);
});

test("creates a trimmed custom role with no permissions by default", async () => {
  let createArgs: unknown;
  const service = new UsersService({
    teamRole: {
      findFirst: async () => null,
      create: async (args: unknown) => {
        createArgs = args;
        return { id: "role-1", name: "Support Lead" };
      },
    },
  } as unknown as PrismaService);

  const role = await service.createTeamRole("  Support Lead  ");

  assert.deepEqual(createArgs, {
    data: { name: "Support Lead" },
    select: { id: true, name: true },
  });
  assert.deepEqual(role, { id: "role-1", name: "Support Lead" });
});

test("renames a custom role without changing its user assignments", async () => {
  let updateArgs: unknown;
  const service = new UsersService({
    teamRole: {
      findUnique: async () => ({ id: "role-1" }),
      findFirst: async () => null,
      update: async (args: unknown) => {
        updateArgs = args;
        return { id: "role-1", name: "Sales Lead" };
      },
    },
  } as unknown as PrismaService);

  const role = await service.updateTeamRole("role-1", "  Sales Lead  ");

  assert.deepEqual(updateArgs, {
    where: { id: "role-1" },
    data: { name: "Sales Lead" },
    select: { id: true, name: true },
  });
  assert.deepEqual(role, { id: "role-1", name: "Sales Lead" });
});

test("deletes a custom role that is not assigned to a user", async () => {
  let deletedId: string | undefined;
  const service = new UsersService({
    teamRole: {
      findUnique: async () => ({ id: "role-1", _count: { users: 0 } }),
      delete: async (args: { where: { id: string } }) => {
        deletedId = args.where.id;
        return { id: args.where.id };
      },
    },
  } as unknown as PrismaService);

  const result = await service.deleteTeamRole("role-1");

  assert.equal(deletedId, "role-1");
  assert.deepEqual(result, { id: "role-1" });
});

test("does not delete a custom role that is assigned to users", async () => {
  const service = new UsersService({
    teamRole: {
      findUnique: async () => ({ id: "role-1", _count: { users: 2 } }),
      delete: async () => assert.fail("Should not delete an assigned role"),
    },
  } as unknown as PrismaService);

  await assert.rejects(
    service.deleteTeamRole("role-1"),
    /This role is assigned to users/,
  );
});

test("prevents other team managers from changing a CLI-created admin", async () => {
  const service = new UsersService({
    user: {
      findUnique: async () => ({
        id: "cli-admin",
        isActive: true,
        permissions: ["manage_team"],
        isCliAdmin: true,
      }),
      update: async () => assert.fail("Should not update a CLI-created admin"),
    },
  } as unknown as PrismaService);

  await assert.rejects(
    service.updateUserPermissions(
      "cli-admin",
      [],
      { sub: "other-manager", permissions: ["manage_team"] },
    ),
    ForbiddenException,
  );
  await assert.rejects(
    service.updateTeamUser(
      "cli-admin",
      {
        fullName: "Changed",
        email: "changed@example.com",
      },
      { sub: "other-manager", permissions: ["manage_team"] },
    ),
    ForbiddenException,
  );
  await assert.rejects(
    service.updateTeamUserPassword(
      "cli-admin",
      "a-long-password",
      "other-manager",
    ),
    ForbiddenException,
  );
  await assert.rejects(
    service.setActive("cli-admin", false, "other-manager"),
    ForbiddenException,
  );
});

test("prevents other team managers from deleting a CLI-created admin", async () => {
  const service = new UsersService({
    $transaction: async (operation: (transaction: unknown) => Promise<unknown>) =>
      operation({
        user: {
          findUnique: async () => ({
            id: "cli-admin",
            isActive: true,
            permissions: ["manage_team"],
            isCliAdmin: true,
            _count: { leads: 0 },
          }),
          delete: async () => assert.fail("Should not delete a CLI-created admin"),
        },
      }),
  } as unknown as PrismaService);

  await assert.rejects(
    service.deleteTeamUser("cli-admin", "other-manager"),
    ForbiddenException,
  );
});

test("saves permissions on one user independently of the custom role", async () => {
  let updateArgs: unknown;
  const service = new UsersService({
    user: {
      findUnique: async () => ({
        id: "user-1",
        isActive: true,
        permissions: [],
      }),
      update: async (args: unknown) => {
        updateArgs = args;
        return { id: "user-1", permissions: ["dashboard", "leads_view"] };
      },
    },
  } as unknown as PrismaService);

  const permissions = await service.updateUserPermissions(
    "user-1",
    ["dashboard", "leads_view"],
    { sub: "admin-1", permissions: ["manage_team"] },
  );

  assert.deepEqual(updateArgs, {
    where: { id: "user-1" },
    data: { permissions: ["dashboard", "leads_view"] },
    select: { id: true, permissions: true },
  });
  assert.deepEqual(permissions.permissions, ["dashboard", "leads_view"]);
});

test("cannot deactivate the last active user with team-management access", async () => {
  const service = new UsersService({
    user: {
      findUnique: async () => ({
        id: "user-1",
        isActive: true,
        permissions: ["manage_team"],
      }),
      count: async () => 0,
      update: async () => assert.fail("Should not deactivate the last manager"),
    },
  } as unknown as PrismaService);

  await assert.rejects(
    service.setActive("user-1", false, "admin-1"),
    ConflictException,
  );
});
