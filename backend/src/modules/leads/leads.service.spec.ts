import * as assert from "node:assert/strict";
import { test } from "node:test";
import { BadRequestException, ForbiddenException } from "@nestjs/common";
import { LeadStage, Prisma } from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
import { StageTransitionService } from "../pipeline/stage-transition.service";
import { CreateLeadDto } from "./dto/create-lead.dto";
import { RecordLeadPaymentDto } from "./dto/record-lead-payment.dto";
import { UpdateLeadDto } from "./dto/update-lead.dto";
import { LeadsService } from "./leads.service";

const admin = {
  sub: "admin-1",
  permissions: ["leads_view", "leads_edit", "leads_create", "manage_team"],
};
const transitions = {
  assertAllowed: () => undefined,
  canTransition: () => true,
} as StageTransitionService;
const paymentDetails = Object.assign(new RecordLeadPaymentDto(), {
  amount: 300,
  paymentDate: "2026-10-28T09:30:00.000Z",
  paymentMode: "UPI",
  paymentSender: "Customer A",
  paymentReceiver: "Admin B",
  paymentTransactionId: "123456789012",
});

function createPaymentService(
  paidAmount: number,
  finalDealValue = 1000,
) {
  let leadUpdate: { data: Record<string, unknown> } | undefined;
  let activityCreate: { data: Record<string, unknown> } | undefined;
  const service = new LeadsService(
    {
      lead: {
        findFirst: async (args: { select?: Record<string, boolean> }) =>
          args.select?.id
            ? { id: "lead-1" }
            : {
                stage: LeadStage.WON,
                finalDealValue: new Prisma.Decimal(finalDealValue),
                paidAmount: new Prisma.Decimal(paidAmount),
              },
        update: async (args: { data: Record<string, unknown> }) => {
          leadUpdate = args;
          return { id: "lead-1", ...args.data };
        },
      },
      $transaction: async (operation: (tx: unknown) => Promise<unknown>) =>
        operation({
          $queryRaw: async () => [],
          lead: {
            findFirst: async () => ({
              stage: LeadStage.WON,
              finalDealValue: new Prisma.Decimal(finalDealValue),
              paidAmount: new Prisma.Decimal(paidAmount),
            }),
            update: async (args: { data: Record<string, unknown> }) => {
              leadUpdate = args;
              return { id: "lead-1", ...args.data };
            },
          },
          activity: {
            findFirst: async () => null,
            create: async (args: { data: Record<string, unknown> }) => {
              activityCreate = args;
              return args.data;
            },
          },
        }),
    } as unknown as PrismaService,
    transitions,
  );
  return {
    service,
    getLeadUpdate: () => leadUpdate,
    getActivityCreate: () => activityCreate,
  };
}

test("logging a payment calculates partial paid total and balance", async () => {
  const payment = createPaymentService(200);

  await payment.service.recordPayment("lead-1", paymentDetails, admin);

  assert.equal(payment.getLeadUpdate()?.data.paymentStatus, "Partial Payment");
  assert.equal(
    (payment.getLeadUpdate()?.data.paidAmount as Prisma.Decimal).toNumber(),
    500,
  );
  assert.equal(payment.getActivityCreate()?.data.type, "PAYMENT_RECEIVED");
  assert.equal(
    (payment.getActivityCreate()?.data.paymentDate as Date).toISOString(),
    "2026-10-28T09:30:00.000Z",
  );
  assert.equal(payment.getActivityCreate()?.data.paymentStatus, "Partial Payment");
  assert.equal(payment.getActivityCreate()?.data.paymentMode, "UPI");
  assert.equal(payment.getActivityCreate()?.data.paymentSender, "Customer A");
  assert.equal(payment.getActivityCreate()?.data.paymentReceiver, "Admin B");
  assert.equal(
    payment.getActivityCreate()?.data.paymentTransactionId,
    "123456789012",
  );
  assert.equal("paymentFrom" in payment.getActivityCreate()!.data, false);
  assert.equal("paymentTo" in payment.getActivityCreate()!.data, false);
  assert.equal(
    (payment.getActivityCreate()?.data.paymentBalance as Prisma.Decimal).toNumber(),
    500,
  );
});

test("editing a payment clears mode-specific values from the previous mode", async () => {
  let paymentUpdate: { data: Record<string, unknown> } | undefined;
  const service = new LeadsService(
    {
      $transaction: async (operation: (tx: unknown) => Promise<unknown>) =>
        operation({
          $queryRaw: async () => [],
          lead: {
            findFirst: async () => ({
              stage: LeadStage.WON,
              finalDealValue: new Prisma.Decimal(1000),
            }),
            update: async (args: { data: Record<string, unknown> }) => args.data,
          },
          activity: {
            findFirst: async () => ({
              id: "payment-1",
              paymentTransactionId: "00000000-0000-4000-8000-000000000001",
            }),
            findMany: async () => [
              {
                id: "payment-1",
                paymentAmount: new Prisma.Decimal(300),
                paymentDate: new Date("2026-10-28T09:30:00.000Z"),
                paymentChequeDate: null,
                createdAt: new Date("2026-10-28T09:30:00.000Z"),
              },
            ],
            update: async (args: { data: Record<string, unknown> }) => {
              if (!paymentUpdate) paymentUpdate = args;
              return args.data;
            },
          },
        }),
    } as unknown as PrismaService,
    transitions,
  );

  await service.updatePayment(
    "lead-1",
    "payment-1",
    Object.assign(new RecordLeadPaymentDto(), {
      amount: 300,
      paymentMode: "Cash",
      paymentDate: "2026-10-29T10:00:00.000Z",
      paymentSender: "Customer A",
      paymentReceiver: "Admin B",
    }),
    admin,
  );

  assert.equal(paymentUpdate?.data.paymentMode, "Cash");
  assert.equal(paymentUpdate?.data.paymentTransactionId, null);
  assert.equal(paymentUpdate?.data.paymentReceiver, "Admin B");
  assert.equal("paymentFrom" in paymentUpdate!.data, false);
  assert.equal("paymentTo" in paymentUpdate!.data, false);
  assert.equal(paymentUpdate?.data.paymentBankName, null);
  assert.equal(paymentUpdate?.data.paymentChequeNumber, null);
  assert.equal(paymentUpdate?.data.paymentOtherMethod, null);
});

test("editing a payment recalculates totals in the original log order", async () => {
  const updates: Array<{
    where: { id: string };
    data: Record<string, unknown>;
  }> = [];
  let leadUpdate: { data: Record<string, unknown> } | undefined;
  const service = new LeadsService(
    {
      $transaction: async (operation: (tx: unknown) => Promise<unknown>) =>
        operation({
          $queryRaw: async () => [],
          lead: {
            findFirst: async () => ({
              stage: LeadStage.WON,
              finalDealValue: new Prisma.Decimal(1000),
            }),
            update: async (args: { data: Record<string, unknown> }) => {
              leadUpdate = args;
              return args.data;
            },
          },
          activity: {
            findFirst: async () => ({
              id: "payment-3",
              paymentTransactionId: null,
            }),
            findMany: async () => [
              {
                id: "payment-3",
                paymentAmount: new Prisma.Decimal(100),
                createdAt: new Date("2026-11-01T10:00:00.000Z"),
              },
              {
                id: "payment-2",
                paymentAmount: new Prisma.Decimal(300),
                createdAt: new Date("2026-10-31T10:00:00.000Z"),
              },
              {
                id: "payment-1",
                paymentAmount: new Prisma.Decimal(200),
                createdAt: new Date("2026-10-30T10:00:00.000Z"),
              },
            ],
            update: async (args: {
              where: { id: string };
              data: Record<string, unknown>;
            }) => {
              updates.push(args);
              return args.data;
            },
          },
        }),
    } as unknown as PrismaService,
    transitions,
  );

  await service.updatePayment(
    "lead-1",
    "payment-3",
    Object.assign(new RecordLeadPaymentDto(), {
      amount: 100,
      paymentMode: "Cash",
      paymentDate: "2026-10-01T10:00:00.000Z",
      paymentSender: "Customer A",
      paymentReceiver: "Admin B",
    }),
    admin,
  );

  const recalculatedPayments = new Map(
    updates.map(({ where, data }) => [where.id, data]),
  );
  assert.equal(
    (recalculatedPayments.get("payment-1")?.paymentTotal as Prisma.Decimal)
      .toNumber(),
    200,
  );
  assert.equal(
    (recalculatedPayments.get("payment-2")?.paymentTotal as Prisma.Decimal)
      .toNumber(),
    500,
  );
  assert.equal(
    (recalculatedPayments.get("payment-3")?.paymentTotal as Prisma.Decimal)
      .toNumber(),
    600,
  );
  assert.equal(
    (leadUpdate?.data.advanceAmount as Prisma.Decimal).toNumber(),
    200,
  );
});

test("logging the remaining balance marks the deal fully paid", async () => {
  const payment = createPaymentService(700);

  await payment.service.recordPayment("lead-1", paymentDetails, admin);

  assert.equal(payment.getLeadUpdate()?.data.paymentStatus, "Fully Paid");
  assert.equal(
    (payment.getActivityCreate()?.data.paymentBalance as Prisma.Decimal).toNumber(),
    0,
  );
});

test("a payment cannot exceed the remaining deal balance", async () => {
  const payment = createPaymentService(900);

  await assert.rejects(
    payment.service.recordPayment(
      "lead-1",
      { ...paymentDetails, amount: 101 },
      admin,
    ),
    BadRequestException,
  );
  assert.equal(payment.getLeadUpdate(), undefined);
  assert.equal(payment.getActivityCreate(), undefined);
});

test("payment amount must use currency precision", async () => {
  const payment = createPaymentService(0);

  await assert.rejects(
    payment.service.recordPayment(
      "lead-1",
      { ...paymentDetails, amount: 10.123 },
      admin,
    ),
    BadRequestException,
  );
  assert.equal(payment.getLeadUpdate(), undefined);
  assert.equal(payment.getActivityCreate(), undefined);
});

test("non-cash payments require transaction account details", async () => {
  const payment = createPaymentService(0);

  await assert.rejects(
    payment.service.recordPayment(
      "lead-1",
      { ...paymentDetails, paymentTransactionId: undefined },
      admin,
    ),
    BadRequestException,
  );
  assert.equal(payment.getLeadUpdate(), undefined);
  assert.equal(payment.getActivityCreate(), undefined);
});

test("lead assignment requires only the assignment permission", async () => {
  let assignedLeadId: string | undefined;
  let assigneeWhere: unknown;
  const service = new LeadsService(
    {
      lead: {
        findFirst: async () => ({ id: "lead-1" }),
        update: async (args: {
          where: { id: string };
          data: { assignedBdeId: string };
          include: unknown;
        }) => {
          assignedLeadId = args.data.assignedBdeId;
          return {
            id: args.where.id,
            assignedBde: { id: args.data.assignedBdeId, fullName: "Assignee" },
          };
        },
      },
      user: {
        findFirst: async (args: { where: unknown }) => {
          assigneeWhere = args.where;
          return { id: "user-2" };
        },
      },
      teamRole: {
        findMany: async () => [
          {
            id: "manager-role",
            isSystem: false,
            subordinateRoles: [{ id: "bde-role" }],
            superiorRoles: [{ id: "lead-role" }],
          },
          {
            id: "bde-role",
            isSystem: false,
            subordinateRoles: [],
            superiorRoles: [{ id: "manager-role" }],
          },
          {
            id: "admin-role",
            isSystem: true,
            subordinateRoles: [],
            superiorRoles: [],
          },
        ],
      },
    } as unknown as PrismaService,
    transitions,
  );

  const assigned = await service.assign("lead-1", "user-2", {
    sub: "assigner",
    permissions: ["leads_assign"],
    subordinateUserIds: ["user-2"],
  });

  assert.equal(assignedLeadId, "user-2");
  assert.equal(assigned.assignedBde.id, "user-2");
  assert.deepEqual(assigneeWhere, {
    id: "user-2",
    isActive: true,
    isCliAdmin: false,
    customRoleId: { in: ["bde-role"] },
    OR: [{ id: "assigner" }, { id: "user-2" }],
  });
});

test("lead assignee options include only active bottom-level role users in scope", async () => {
  let assigneeWhere: unknown;
  const service = new LeadsService(
    {
      user: {
        findMany: async (args: { where: unknown }) => {
          assigneeWhere = args.where;
          return [{ id: "bde-1", fullName: "BDE One" }];
        },
      },
      teamRole: {
        findMany: async () => [
          {
            id: "lead-role",
            isSystem: false,
            subordinateRoles: [{ id: "manager-role" }],
            superiorRoles: [],
          },
          {
            id: "manager-role",
            isSystem: false,
            subordinateRoles: [{ id: "bde-role" }],
            superiorRoles: [{ id: "lead-role" }],
          },
          {
            id: "bde-role",
            isSystem: false,
            subordinateRoles: [],
            superiorRoles: [{ id: "manager-role" }],
          },
          {
            id: "supervisor-role",
            isSystem: false,
            subordinateRoles: [{ id: "lead-role" }, { id: "bde-role" }],
            superiorRoles: [],
          },
          {
            id: "admin-role",
            isSystem: true,
            subordinateRoles: [],
            superiorRoles: [],
          },
        ],
      },
    } as unknown as PrismaService,
    transitions,
  );

  const assignees = await service.assignees({
    sub: "lead-1",
    permissions: ["leads_assign"],
    subordinateUserIds: ["manager-1", "bde-1"],
  });

  assert.deepEqual(assignees, [{ id: "bde-1", fullName: "BDE One" }]);
  assert.deepEqual(assigneeWhere, {
    isActive: true,
    isCliAdmin: false,
    customRoleId: { in: ["bde-role"] },
    OR: [{ id: "lead-1" }, { id: "manager-1" }, { id: "bde-1" }],
  });
});

test("lead assignment rejects users outside the reporting hierarchy", async () => {
  let leadUpdated = false;
  const service = new LeadsService(
    {
      lead: {
        findFirst: async () => ({ id: "lead-1" }),
        update: async () => {
          leadUpdated = true;
          return {};
        },
      },
      user: { findFirst: async () => null },
      teamRole: {
        findMany: async () => [
          {
            id: "bde-role",
            isSystem: false,
            subordinateRoles: [],
            superiorRoles: [{ id: "manager-role" }],
          },
        ],
      },
    } as unknown as PrismaService,
    transitions,
  );

  await assert.rejects(
    service.assign("lead-1", "unrelated-user", {
      sub: "manager-1",
      permissions: ["leads_assign"],
      subordinateUserIds: [],
    }),
    BadRequestException,
  );
  assert.equal(leadUpdated, false);
});

test("Admin can reopen a lost lead as interested without next-action details", async () => {
  let savedData: Record<string, unknown> | undefined;
  const service = new LeadsService(
    {
      lead: {
        findFirst: async () => ({
          id: "lead-1",
          stage: LeadStage.LOST,
          assignedBdeId: "bde-1",
          nextAction: null,
          followUpAt: null,
          finalDealValue: null,
          lostReason: "Budget Not Available",
          mobileNumber: "1234567",
        }),
      },
      $transaction: async (operation: (tx: unknown) => Promise<unknown>) =>
        operation({
          lead: {
            update: async (args: { data: Record<string, unknown> }) => {
              savedData = args.data;
              return { id: "lead-1", ...args.data };
            },
          },
        }),
    } as unknown as PrismaService,
    transitions,
  );

  await service.update(
    "lead-1",
    Object.assign(new UpdateLeadDto(), {
      stage: LeadStage.INTERESTED,
    }),
    {
      sub: "admin-1",
      isCliAdmin: true,
      permissions: ["leads_edit"],
    },
  );

  assert.equal(savedData?.stage, LeadStage.INTERESTED);
});

test("cannot change the deal value after payments have been recorded", async () => {
  let updateStarted = false;
  const service = new LeadsService(
    {
      lead: {
        findFirst: async () => ({
          id: "lead-1",
          stage: LeadStage.WON,
          assignedBdeId: "bde-1",
          nextAction: null,
          followUpAt: null,
          finalDealValue: new Prisma.Decimal(9000),
          paidAmount: new Prisma.Decimal(9000),
          lostReason: null,
          mobileNumber: "1234567",
        }),
      },
      $transaction: async () => {
        updateStarted = true;
      },
    } as unknown as PrismaService,
    transitions,
  );

  await assert.rejects(
    service.update(
      "lead-1",
      Object.assign(new UpdateLeadDto(), { finalDealValue: 8500 }),
      { sub: "admin-1", permissions: ["leads_edit"] },
    ),
    BadRequestException,
  );
  assert.equal(updateStarted, false);
});

test("users without lead-creation permission cannot create leads", async () => {
  const service = new LeadsService(
    {} as PrismaService,
    transitions,
  );
  const dto = Object.assign(new CreateLeadDto(), {
    customerName: "Test lead",
    mobileNumber: "1234567",
    leadSource: "Website",
    assignedBdeId: "11111111-1111-4111-8111-111111111111",
    nextAction: "Call",
    followUpAt: "2026-10-23T10:00:00.000Z",
  });

  await assert.rejects(
    service.create(dto, { sub: "user-1", permissions: [] }),
    ForbiddenException,
  );
});
