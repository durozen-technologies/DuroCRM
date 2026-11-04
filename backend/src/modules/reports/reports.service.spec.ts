import * as assert from "node:assert/strict";
import { test } from "node:test";
import { ForbiddenException } from "@nestjs/common";
import { FollowUpStatus, Prisma } from "@prisma/client";
import {
  businessDateTime,
  startOfBusinessDay,
} from "../../common/utils/business-time";
import { ReportsService } from "./reports.service";
import { PrismaService } from "../../prisma/prisma.service";
import { PerformanceService } from "../performance/performance.service";

test("follow-up report applies category and explicit assignee filter globally", async () => {
  let capturedWhere: Prisma.FollowUpWhereInput | undefined;
  const today = startOfBusinessDay(new Date());
  const prisma = {
    followUp: {
      findMany: async (args: { where: Prisma.FollowUpWhereInput }) => {
        capturedWhere = args.where;
        return [];
      },
    },
  } as unknown as PrismaService;
  const performance = {} as PerformanceService;
  const reports = new ReportsService(prisma, performance);

  await reports.run(
    "follow-ups",
    undefined,
    undefined,
    {
      sub: "11111111-1111-4111-8111-111111111111",
      permissions: ["reports"],
    },
    {
      assignedUserId: "22222222-2222-4222-8222-222222222222",
      category: "overdue",
      status: "PENDING",
    },
  );

  assert.ok(capturedWhere);
  const leadWhere = capturedWhere.lead as Prisma.LeadWhereInput;
  assert.equal(
    leadWhere.assignedBdeId,
    "22222222-2222-4222-8222-222222222222",
  );
  assert.deepEqual(capturedWhere.AND, [
    { dueAt: { lt: today } },
    { status: FollowUpStatus.PENDING },
  ]);
});

test("date-only report filters cover whole Asia/Kolkata calendar days", async () => {
  let capturedWhere: Prisma.LeadWhereInput | undefined;
  const prisma = {
    lead: {
      findMany: async (args: { where: Prisma.LeadWhereInput }) => {
        capturedWhere = args.where;
        return [];
      },
    },
  } as unknown as PrismaService;
  const reports = new ReportsService(prisma, {} as PerformanceService);

  await reports.run(
    "leads",
    "2026-10-01",
    "2026-10-31",
    { sub: "admin-1", permissions: ["reports"] },
  );

  assert.deepEqual(capturedWhere?.createdAt, {
    gte: businessDateTime(2026, 10, 1),
    lt: businessDateTime(2026, 11, 1),
  });
});

test("sales performance report filters metrics across the requested date range", async () => {
  let capturedLeadWhere: Prisma.LeadWhereInput | undefined;
  const prisma = {
    lead: {
      count: async (args: { where: Prisma.LeadWhereInput }) => {
        capturedLeadWhere ??= args.where;
        return 0;
      },
      aggregate: async () => ({ _sum: { finalDealValue: null } }),
    },
    activity: { findMany: async () => [] },
    meeting: { count: async () => 0 },
    proposal: { count: async () => 0 },
    negotiation: { count: async () => 0 },
  } as unknown as PrismaService;
  const reports = new ReportsService(prisma, {} as PerformanceService);

  const [summary] = await reports.run(
    "monthly-summary",
    "2026-10-01",
    "2026-10-31",
    { sub: "admin-1", permissions: ["reports"] },
  );

  assert.deepEqual(capturedLeadWhere?.createdAt, {
    gte: businessDateTime(2026, 10, 1),
    lt: businessDateTime(2026, 11, 1),
  });
  assert.equal(
    "month" in summary ? summary.month : undefined,
    "2026-10-01 to 2026-10-31",
  );
});

test("user performance report uses the generic report type and user filter", async () => {
  let summaryArgs: unknown[] | undefined;
  const performance = {
    summary: async (...args: unknown[]) => {
      summaryArgs = args;
      return { users: [{ userId: "user-1", name: "Sales user" }] };
    },
  } as unknown as PerformanceService;
  const reports = new ReportsService({} as PrismaService, performance);

  const rows = await reports.run(
    "user-performance",
    "2026-10-01",
    "2026-10-31",
    { sub: "admin-1", permissions: ["reports"] },
    { assignedUserId: "22222222-2222-4222-8222-222222222222" },
  );

  assert.deepEqual(rows, [{ userId: "user-1", name: "Sales user" }]);
  assert.deepEqual(summaryArgs, [
    "2026-10-01",
    "2026-10-31",
    { sub: "admin-1", permissions: ["reports"] },
    "22222222-2222-4222-8222-222222222222",
  ]);
});

test("user filter options exclude CLI admin accounts", async () => {
  let userQuery: unknown;
  const prisma = {
    user: {
      findMany: async (args: unknown) => {
        userQuery = args;
        return [];
      },
    },
  } as unknown as PrismaService;
  const reports = new ReportsService(prisma, {} as PerformanceService);

  await reports.userOptions({ sub: "admin-1", permissions: ["reports"] });

  assert.deepEqual(userQuery, {
    where: {
      isActive: true,
      isCliAdmin: false,
      OR: [{ id: "admin-1" }],
    },
    select: { id: true, fullName: true },
    orderBy: { fullName: "asc" },
  });
});

test("lead report selects only its required lead fields", async () => {
  let capturedArgs:
    | { select: Prisma.LeadSelect; include?: unknown }
    | undefined;
  const prisma = {
    lead: {
      findMany: async (args: {
        select: Prisma.LeadSelect;
        include?: unknown;
      }) => {
        capturedArgs = args;
        return [];
      },
    },
  } as unknown as PrismaService;
  const reports = new ReportsService(prisma, {} as PerformanceService);

  await reports.run("leads", undefined, undefined, {
    sub: "admin-1",
    permissions: ["reports"],
  });

  assert.ok(capturedArgs);
  assert.equal(capturedArgs.include, undefined);
  assert.equal(capturedArgs.select.customerName, true);
  assert.equal(capturedArgs.select.paymentStatus, undefined);
});

test("users without report permission cannot access lead reports", async () => {
  const reports = new ReportsService(
    {} as PrismaService,
    {} as PerformanceService,
  );
  await assert.rejects(
    reports.run("leads", undefined, undefined, {
      sub: "bde-id",
      permissions: [],
    }),
    ForbiddenException,
  );
});
