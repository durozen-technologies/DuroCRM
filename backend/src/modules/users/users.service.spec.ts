import * as assert from "node:assert/strict";
import { test } from "node:test";
import { BadRequestException, ForbiddenException } from "@nestjs/common";
import { Actor } from "../../common/authorization/actor-permission";
import { PrismaService } from "../../prisma/prisma.service";
import { CreateTeamRoleDto } from "./dto/create-team-role.dto";
import { UsersService } from "./users.service";

const admin: Actor = {
  sub: "admin-1",
  permissions: ["manage_team"],
  isCliAdmin: true,
};

function roleDto(
  overrides: Partial<CreateTeamRoleDto> = {},
): CreateTeamRoleDto {
  return {
    name: "Sales Manager",
    description: "Manages sales employees",
    permissions: ["dashboard", "leads_view", "manage_team"],
    subordinateRoleIds: [],
    ...overrides,
  };
}

test("custom role listing excludes system roles and marks assignable roles", async () => {
  let query: unknown;
  const service = new UsersService({
    teamRole: {
      findMany: async (args: unknown) => {
        query = args;
        return [
          {
            id: "role-1",
            name: "BDE",
            description: "Employee",
            permissions: ["dashboard"],
            subordinateRoles: [{ id: "role-2" }],
            createdAt: new Date(0),
            updatedAt: new Date(0),
          },
        ];
      },
    },
  } as unknown as PrismaService);

  const roles = await service.listTeamRoles(admin);

  assert.deepEqual(query, {
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
  assert.equal(roles[0].assignable, true);
  assert.deepEqual(roles[0].subordinateRoleIds, ["role-2"]);
});

test("custom roles are ordered bottom-up by the configured hierarchy", async () => {
  const hierarchy = [
    { id: "supervisor", name: "Supervisor", subordinateRoles: [{ id: "lead" }] },
    { id: "lead", name: "Team Lead", subordinateRoles: [{ id: "manager" }] },
    { id: "manager", name: "Sales Manager", subordinateRoles: [{ id: "bde" }] },
    { id: "bde", name: "BDE", subordinateRoles: [] },
  ];
  const service = new UsersService({
    teamRole: {
      findMany: async () =>
        hierarchy.map((role) => ({
          ...role,
          description: "",
          permissions: [],
          createdAt: new Date(0),
          updatedAt: new Date(0),
        })),
    },
  } as unknown as PrismaService);

  const roles = await service.listTeamRoles(admin);

  assert.deepEqual(
    roles.map((role) => role.name),
    ["BDE", "Sales Manager", "Team Lead", "Supervisor"],
  );
});

test("creates roles with configured permissions and subordinate roles", async () => {
  let createArgs: unknown;
  const service = new UsersService({
    teamRole: {
      findMany: async () => [],
      findFirst: async () => null,
      create: async (args: unknown) => {
        createArgs = args;
        return { id: "role-1", ...roleDto() };
      },
    },
  } as unknown as PrismaService);

  await service.createTeamRole(roleDto(), admin);

  assert.deepEqual(createArgs, {
    data: {
      name: "Sales Manager",
      description: "Manages sales employees",
      permissions: ["dashboard", "leads_view", "manage_team"],
      subordinateRoles: { connect: [] },
    },
    select: {
      id: true,
      name: true,
      description: true,
      permissions: true,
      subordinateRoles: { select: { id: true } },
    },
  });
});

test("prevents creating the predefined Admin system role", async () => {
  const service = new UsersService({} as PrismaService);
  await assert.rejects(
    service.createTeamRole(roleDto({ name: " admin " }), admin),
    BadRequestException,
  );
});

test("rejects a hierarchy update that would create a role cycle", async () => {
  const service = new UsersService({
    teamRole: {
      findUnique: async () => ({
        id: "role-b",
        name: "Team Lead",
        isSystem: false,
      }),
      findMany: async () => [
        {
          id: "role-a",
          name: "BDE",
          isSystem: false,
          subordinateRoles: [{ id: "role-b" }],
        },
        {
          id: "role-b",
          name: "Team Lead",
          isSystem: false,
          subordinateRoles: [],
        },
      ],
      update: async () => assert.fail("Should not save a cyclic hierarchy"),
    },
  } as unknown as PrismaService);

  await assert.rejects(
    service.updateTeamRole(
      "role-b",
      { subordinateRoleIds: ["role-a"] },
      admin,
    ),
    /role cycle/,
  );
});

test("rejects role hierarchy changes that invalidate assigned supervisors", async () => {
  const service = new UsersService({
    teamRole: {
      findUnique: async () => ({
        id: "manager-role",
        name: "Sales Manager",
        isSystem: false,
      }),
      findMany: async () => [
        {
          id: "manager-role",
          subordinateRoles: [{ id: "bde-role" }],
        },
        { id: "bde-role", subordinateRoles: [] },
      ],
      update: async () => assert.fail("Should preserve reporting hierarchy"),
    },
    user: {
      findMany: async () => [
        {
          customRoleId: "bde-role",
          reportsTo: {
            customRoleId: "manager-role",
            isCliAdmin: false,
          },
        },
      ],
    },
  } as unknown as PrismaService);

  await assert.rejects(
    service.updateTeamRole("manager-role", { subordinateRoleIds: [] }, admin),
    /conflicts with assigned team reporting lines/,
  );
});

test("team accounts inherit permissions from their selected role", async () => {
  let createArgs: { data?: Record<string, unknown> } | undefined;
  const service = new UsersService({
    teamRole: {
      findUnique: async () => ({
        id: "role-1",
        name: "BDE",
        isSystem: false,
      }),
    },
    user: {
      create: async (args: { data: Record<string, unknown> }) => {
        createArgs = args;
        return {
          id: "user-1",
          fullName: "BDE User",
          email: "bde@example.com",
          customRole: {
            id: "role-1",
            name: "BDE",
            permissions: ["dashboard", "leads_view"],
          },
          isActive: true,
          isCliAdmin: false,
        };
      },
    },
  } as unknown as PrismaService);

  const user = await service.create(
    {
      fullName: "BDE User",
      email: "bde@example.com",
      password: "temporary-password",
      customRoleId: "role-1",
    },
    admin,
  );

  assert.deepEqual(createArgs?.data, {
    fullName: "BDE User",
    email: "bde@example.com",
    passwordHash: createArgs?.data?.passwordHash,
    customRoleId: "role-1",
  });
  assert.equal(typeof createArgs?.data?.passwordHash, "string");
  assert.deepEqual(user.permissions, ["dashboard", "leads_view"]);
});

test("assigns a BDE to an active user in an eligible higher role", async () => {
  let savedAssignment: unknown;
  const service = new UsersService({
    user: {
      findUnique: async ({ where }: { where: { id: string } }) =>
        where.id === "bde-user"
          ? {
              id: "bde-user",
              isCliAdmin: false,
              customRoleId: "bde-role",
            }
          : {
              id: "manager-user",
              isCliAdmin: false,
              customRoleId: "manager-role",
            },
      update: async (args: { data: unknown }) => {
        savedAssignment = args.data;
        return {
          id: "bde-user",
          reportsToId: "manager-user",
          reportsTo: { id: "manager-user", fullName: "Manager" },
        };
      },
    },
    teamRole: {
      findMany: async () => [
        {
          id: "lead-role",
          subordinateRoles: [{ id: "manager-role" }, { id: "bde-role" }],
        },
        { id: "manager-role", subordinateRoles: [{ id: "bde-role" }] },
        { id: "bde-role", subordinateRoles: [] },
      ],
    },
  } as unknown as PrismaService);

  const result = await service.assignSupervisor(
    "bde-user",
    "manager-user",
    admin,
  );

  assert.deepEqual(savedAssignment, { reportsToId: "manager-user" });
  assert.equal(result.reportsTo?.fullName, "Manager");
});

test("rejects supervisor assignments outside the configured role hierarchy", async () => {
  let updated = false;
  const service = new UsersService({
    user: {
      findUnique: async ({ where }: { where: { id: string } }) =>
        where.id === "bde-user"
          ? {
              id: "bde-user",
              isCliAdmin: false,
              customRoleId: "bde-role",
            }
          : {
              id: "peer-user",
              isCliAdmin: false,
              customRoleId: "other-role",
            },
      update: async () => {
        updated = true;
      },
    },
    teamRole: {
      findMany: async () => [
        { id: "bde-role", subordinateRoles: [] },
        { id: "other-role", subordinateRoles: [] },
      ],
    },
  } as unknown as PrismaService);

  await assert.rejects(
    service.assignSupervisor("bde-user", "peer-user", admin),
    BadRequestException,
  );
  assert.equal(updated, false);
});

test("rejects skipping an intermediate role in the reporting hierarchy", async () => {
  let updated = false;
  const service = new UsersService({
    user: {
      findUnique: async ({ where }: { where: { id: string } }) =>
        where.id === "bde-user"
          ? {
              id: "bde-user",
              isCliAdmin: false,
              customRoleId: "bde-role",
            }
          : {
              id: "lead-user",
              isCliAdmin: false,
              customRoleId: "lead-role",
            },
      update: async () => {
        updated = true;
      },
    },
    teamRole: {
      findMany: async () => [
        {
          id: "lead-role",
          subordinateRoles: [{ id: "manager-role" }, { id: "bde-role" }],
        },
        { id: "manager-role", subordinateRoles: [{ id: "bde-role" }] },
        { id: "bde-role", subordinateRoles: [] },
      ],
    },
  } as unknown as PrismaService);

  await assert.rejects(
    service.assignSupervisor("bde-user", "lead-user", admin),
    BadRequestException,
  );
  assert.equal(updated, false);
});

test("rejects assigning Admin as a supervisor", async () => {
  let updated = false;
  const service = new UsersService({
    user: {
      findUnique: async ({ where }: { where: { id: string } }) =>
        where.id === "bde-user"
          ? {
              id: "bde-user",
              isCliAdmin: false,
              customRoleId: "bde-role",
            }
          : {
              id: "admin-1",
              isCliAdmin: true,
              customRoleId: "admin-role",
            },
      update: async () => {
        updated = true;
      },
    },
  } as unknown as PrismaService);

  await assert.rejects(
    service.assignSupervisor("bde-user", "admin-1", admin),
    (error: unknown) =>
      error instanceof BadRequestException &&
      error.message.includes("Admin is the highest system role"),
  );
  assert.equal(updated, false);
});

test("CLI Admin cannot be changed through custom team management", async () => {
  const service = new UsersService({
    user: {
      findUnique: async () => ({
        id: "admin-1",
        customRoleId: "admin-role",
        isCliAdmin: true,
      }),
      update: async () => assert.fail("Should not update the Admin account"),
    },
  } as unknown as PrismaService);

  await assert.rejects(
    service.updateTeamUser(
      "admin-1",
      { fullName: "Changed", email: "changed@example.com" },
      admin,
    ),
    ForbiddenException,
  );
});

test("user management is limited to reporting-line descendants", async () => {
  let query: { where?: Record<string, unknown> } | undefined;
  const service = new UsersService({
    user: {
      findMany: async (args: { where: Record<string, unknown> }) => {
        query = args;
        return [];
      },
      count: async () => 0,
    },
    teamRole: {
      findMany: async () => [{ id: "bde-role", name: "BDE" }],
    },
    $transaction: async (queries: Promise<unknown>[]) => Promise.all(queries),
  } as unknown as PrismaService);

  const page = await service.listTeamPage(1, 10, undefined, undefined, undefined, {
    sub: "manager-1",
    roleId: "manager-role",
    permissions: ["manage_team"],
    subordinateRoleIds: ["bde-role"],
    subordinateUserIds: ["bde-user"],
  });

  assert.deepEqual(query?.where, {
    id: { not: "manager-1", in: ["bde-user"] },
  });
  assert.deepEqual(page.roleFilters, [{ id: "bde-role", name: "BDE" }]);
});

test("team listing applies role and status filters", async () => {
  let findManyArgs: {
    where?: Record<string, unknown>;
    orderBy?: unknown;
    skip?: number;
  } | undefined;
  const service = new UsersService({
    user: {
      findMany: async (args: {
        where?: Record<string, unknown>;
      }) => {
        if (args.where?.OR !== undefined) findManyArgs = args;
        return [];
      },
      count: async () => 0,
    },
    teamRole: {
      findMany: async () => [{ id: "role-1", name: "Sales Manager" }],
    },
    $transaction: async (queries: Promise<unknown>[]) => Promise.all(queries),
  } as unknown as PrismaService);

  await service.listTeamPage(
    1,
    10,
    "alex",
    "role-1",
    "inactive",
    admin,
  );

  assert.deepEqual(findManyArgs?.where, {
    id: { not: admin.sub },
    customRoleId: "role-1",
    isActive: false,
    OR: [
      { fullName: { contains: "alex", mode: "insensitive" } },
      { email: { contains: "alex", mode: "insensitive" } },
    ],
  });
});

test("team pages follow the configured role hierarchy, including new roles", async () => {
  const roleChain = [
    {
      id: "supervisor",
      name: "Supervisor",
      subordinateRoles: [{ id: "regional" }],
    },
    {
      id: "regional",
      name: "Regional Supervisor",
      subordinateRoles: [{ id: "lead" }],
    },
    {
      id: "lead",
      name: "Team Lead",
      subordinateRoles: [{ id: "manager" }],
    },
    {
      id: "manager",
      name: "Sales Manager",
      subordinateRoles: [{ id: "bde" }],
    },
    { id: "bde", name: "BDE", subordinateRoles: [] },
  ];
  const teamUsers = roleChain.map((role) => ({
    id: `${role.id}-user`,
    fullName: role.name,
    email: `${role.id}@example.com`,
    isCliAdmin: false,
    customRole: { id: role.id, name: role.name, permissions: [] },
    reportsToId: null,
    reportsTo: null,
    isActive: true,
    isOnline: false,
    createdAt: new Date(0),
    lastActiveAt: null,
    _count: { leads: 0 },
  }));
  const service = new UsersService({
    user: {
      findMany: async (args: { where?: Record<string, unknown> }) =>
        args.where?.isActive === true ? [] : teamUsers,
      count: async () => teamUsers.length,
    },
    teamRole: {
      findMany: async () => roleChain,
    },
    $transaction: async (queries: Promise<unknown>[]) => Promise.all(queries),
  } as unknown as PrismaService);

  const page = await service.listTeamPage(
    2,
    2,
    undefined,
    undefined,
    undefined,
    admin,
  );

  assert.deepEqual(
    page.items.map((user) => user.customRole),
    [
      { id: "lead", name: "Team Lead" },
      { id: "regional", name: "Regional Supervisor" },
    ],
  );
  assert.equal(page.totalPages, 3);
});

test("Admin team rows list only users with configured senior roles", async () => {
  const bde = {
    id: "bde-user",
    fullName: "BDE",
    email: "bde@example.com",
    isCliAdmin: false,
    customRole: { id: "bde-role", name: "BDE", permissions: [] },
    reportsToId: null,
    reportsTo: null,
    isActive: true,
    isOnline: false,
    createdAt: new Date(0),
    lastActiveAt: null,
    _count: { leads: 0 },
  };
  const service = new UsersService({
    user: {
      findMany: async (args: { where?: Record<string, unknown> }) =>
        args.where?.isActive === true
          ? [
              {
                id: "manager-user",
                fullName: "Manager",
                customRoleId: "manager-role",
                customRole: { name: "Sales Manager" },
              },
            ]
          : [bde],
      count: async () => 1,
    },
    teamRole: {
      findMany: async () => [
        {
          id: "lead-role",
          subordinateRoles: [{ id: "manager-role" }, { id: "bde-role" }],
        },
        { id: "manager-role", subordinateRoles: [{ id: "bde-role" }] },
        { id: "bde-role", subordinateRoles: [] },
      ],
    },
    $transaction: async (queries: Promise<unknown>[]) => Promise.all(queries),
  } as unknown as PrismaService);

  const page = await service.listTeamPage(
    1,
    10,
    undefined,
    undefined,
    undefined,
    admin,
  );

  assert.deepEqual(
    page.items[0].eligibleSupervisors.map(
      (supervisor: { id: string }) => supervisor.id,
    ),
    ["manager-user"],
  );
});

test("user deletion reports dependency counts in a concise two-line message", async () => {
  let deleted = false;
  const service = new UsersService({
    user: {
      count: async () => 1,
    },
    $transaction: async (
      operation: (transaction: unknown) => Promise<unknown>,
    ) =>
      operation({
        user: {
          findUnique: async () => ({
            id: "lead-user",
            fullName: "Team Lead Account",
            isActive: false,
            customRoleId: "future-lead-role",
            isCliAdmin: false,
            _count: { leads: 2 },
          }),
          findMany: async () => [
            {
              id: "manager-user",
              reportsToId: "lead-user",
            },
            {
              id: "bde-user",
              reportsToId: "manager-user",
            },
          ],
          delete: async () => {
            deleted = true;
          },
        },
      }),
  } as unknown as PrismaService);

  await assert.rejects(
    service.deleteTeamUser("lead-user", admin),
    (error: Error) => {
      assert.equal(
        error.message,
        "Cannot delete Team Lead Account: 2 reporting users and 2 assigned leads still depend on this account.\nReassign them before retrying.",
      );
      return true;
    },
  );
  assert.equal(deleted, false);
});

test("user deletion proceeds transactionally after dependencies are resolved", async () => {
  let deleted = false;
  let isolationLevel: unknown;
  const service = new UsersService({
    $transaction: async (
      operation: (transaction: unknown) => Promise<unknown>,
      options: { isolationLevel: unknown },
    ) => {
      isolationLevel = options.isolationLevel;
      return operation({
        user: {
          findUnique: async () => ({
            id: "bde-user",
            fullName: "BDE Account",
            isActive: false,
            customRoleId: "future-bde-role",
            isCliAdmin: false,
            _count: { leads: 0 },
          }),
          findMany: async () => [],
          delete: async () => {
            deleted = true;
          },
        },
      });
    },
  } as unknown as PrismaService);

  const result = await service.deleteTeamUser("bde-user", admin);

  assert.equal(deleted, true);
  assert.equal(isolationLevel, "Serializable");
  assert.deepEqual(result, { id: "bde-user", deleted: true });
});

test("only Admin can list roles or manage role and team accounts", async () => {
  const service = new UsersService({} as PrismaService);
  const manager: Actor = {
    sub: "manager-1",
    permissions: ["manage_team"],
    subordinateRoleIds: ["role-1"],
  };
  const operations: Array<() => Promise<unknown>> = [
    () => service.list(manager),
    () => service.listTeamRoles(manager),
    () => service.createTeamRole(roleDto(), manager),
    () => service.updateTeamRole("role-1", {}, manager),
    () => service.deleteTeamRole("role-1", manager),
    () =>
      service.create(
        {
          fullName: "New user",
          email: "new@example.com",
          password: "temporary-password",
          customRoleId: "role-1",
        },
        manager,
      ),
    () =>
      service.updateTeamUser(
        "user-1",
        { fullName: "Changed", email: "changed@example.com" },
        manager,
      ),
    () => service.updateTeamUserPassword("user-1", "temporary-password", manager),
    () => service.setActive("user-1", false, manager),
    () => service.deleteTeamUser("user-1", manager),
  ];

  for (const operation of operations) {
    await assert.rejects(operation(), ForbiddenException);
  }
});
