import * as assert from "node:assert/strict";
import { test } from "node:test";
import { PrismaService } from "../../prisma/prisma.service";
import { UsersService } from "./users.service";

test("lists only BDEs assigned to the requesting manager", async () => {
  let query: unknown;
  const service = new UsersService({
    user: {
      findMany: async (args: unknown) => {
        query = args;
        return [];
      },
    },
  } as unknown as PrismaService);

  await service.listManagedBdes("manager-1");

  assert.deepEqual(query, {
    where: { role: "BDE", managerId: "manager-1" },
    select: {
      id: true,
      fullName: true,
      email: true,
      isActive: true,
      isOnline: true,
      lastActiveAt: true,
      _count: { select: { leads: true } },
    },
    orderBy: { fullName: "asc" },
  });
});

test("creates a trimmed custom role with no permissions by default", async () => {
  let createArgs: unknown;
  const service = new UsersService({
    teamRole: {
      findFirst: async () => null,
      create: async (args: unknown) => {
        createArgs = args;
        return { id: "role-1", name: "Support Lead", permissions: [] };
      },
    },
  } as unknown as PrismaService);

  const role = await service.createTeamRole("  Support Lead  ");

  assert.deepEqual(createArgs, {
    data: { name: "Support Lead" },
    select: { id: true, name: true, permissions: true },
  });
  assert.deepEqual(role, {
    id: "role-1",
    name: "Support Lead",
    permissions: [],
  });
});

test("saves selected permissions for a custom role", async () => {
  let updateArgs: unknown;
  const service = new UsersService({
    teamRole: {
      update: async (args: unknown) => {
        updateArgs = args;
        return {
          id: "role-1",
          name: "Support Lead",
          permissions: ["dashboard", "leads_view"],
        };
      },
    },
  } as unknown as PrismaService);

  const role = await service.updateTeamRolePermissions("role-1", [
    "dashboard",
    "leads_view",
  ]);

  assert.deepEqual(updateArgs, {
    where: { id: "role-1" },
    data: { permissions: ["dashboard", "leads_view"] },
    select: { id: true, name: true, permissions: true },
  });
  assert.deepEqual(role.permissions, ["dashboard", "leads_view"]);
});
