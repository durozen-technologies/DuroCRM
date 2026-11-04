import * as assert from "node:assert/strict";
import { test } from "node:test";
import { UnauthorizedException } from "@nestjs/common";
import * as bcrypt from "bcrypt";
import { PrismaService } from "../../prisma/prisma.service";
import { AuthService } from "./auth.service";

test("reports inactive accounts after validating their credentials", async () => {
  const passwordHash = await bcrypt.hash("valid-password", 4);
  const service = new AuthService({
    user: {
      findFirst: async () => ({
        id: "inactive-user",
        email: "lead@example.com",
        passwordHash,
        isActive: false,
        customRole: {
          id: "role-1",
          name: "Lead",
          permissions: [],
        },
      }),
    },
  } as unknown as PrismaService);

  await assert.rejects(
    service.login({ email: "lead@example.com", password: "valid-password" }),
    (error: unknown) =>
      error instanceof UnauthorizedException &&
      error.message === "This account is inactive. Contact an administrator.",
  );
});

test("keeps invalid credentials distinct from inactive accounts", async () => {
  const service = new AuthService({
    user: {
      findFirst: async () => ({
        id: "user-1",
        passwordHash: await bcrypt.hash("different-password", 4),
        isActive: false,
        customRole: { id: "role-1", name: "Lead", permissions: [] },
      }),
    },
  } as unknown as PrismaService);

  await assert.rejects(
    service.login({ email: "lead@example.com", password: "wrong-password" }),
    (error: unknown) =>
      error instanceof UnauthorizedException &&
      error.message === "Invalid email or password",
  );
});

test("team visibility requires team permission and subordinate roles", async () => {
  const service = new AuthService({
    user: {
      findUnique: async () => ({
        id: "manager-1",
        fullName: "Manager",
        email: "manager@example.com",
        isCliAdmin: false,
        customRole: {
          id: "manager-role",
          name: "Manager",
          permissions: ["manage_team"],
          subordinateRoles: [{ id: "bde-role" }],
        },
      }),
    },
  } as unknown as PrismaService);

  assert.deepEqual(await service.currentUser("manager-1"), {
    id: "manager-1",
    name: "Manager",
    email: "manager@example.com",
    customRole: {
      id: "manager-role",
      name: "Manager",
      subordinateRoleIds: ["bde-role"],
    },
    permissions: ["manage_team"],
    isCliAdmin: false,
    canViewTeam: true,
  });
});

test("reports no subordinate roles for a bottom-level custom role", async () => {
  const service = new AuthService({
    user: {
      findUnique: async () => ({
        id: "bde-1",
        fullName: "BDE One",
        email: "bde@example.com",
        isCliAdmin: false,
        customRole: {
          id: "bde-role",
          name: "BDE",
          permissions: ["leads_create", "leads_assign"],
          subordinateRoles: [],
        },
      }),
    },
  } as unknown as PrismaService);

  assert.deepEqual(await service.currentUser("bde-1"), {
    id: "bde-1",
    name: "BDE One",
    email: "bde@example.com",
    customRole: { id: "bde-role", name: "BDE", subordinateRoleIds: [] },
    permissions: ["leads_create", "leads_assign"],
    isCliAdmin: false,
    canViewTeam: false,
  });
});

test("logout records the logout time and clears online status", async () => {
  let update: { where: unknown; data: Record<string, unknown> } | undefined;
  const service = new AuthService({
    user: {
      updateMany: async (args: {
        where: unknown;
        data: Record<string, unknown>;
      }) => {
        update = args;
        return { count: 1 };
      },
    },
  } as unknown as PrismaService);

  const beforeLogout = Date.now();
  assert.deepEqual(await service.logout("user-1"), {
    message: "Signed out",
  });

  assert.deepEqual(update?.where, { id: "user-1", isActive: true });
  assert.equal(update?.data.isOnline, false);
  assert.ok(update?.data.lastActiveAt instanceof Date);
  assert.ok(
    Math.abs((update?.data.lastActiveAt as Date).getTime() - beforeLogout) <
      1_000,
  );
});
