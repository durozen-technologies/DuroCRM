import * as assert from "node:assert/strict";
import { test } from "node:test";
import { ForbiddenException } from "@nestjs/common";
import { LeadStage, Prisma } from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
import { CustomersService } from "./customers.service";

function createService(
  captureWhere: (where: Prisma.LeadWhereInput) => void,
) {
  const prisma = {
    lead: {
      findMany: async ({ where }: { where: Prisma.LeadWhereInput }) => {
        captureWhere(where);
        return [];
      },
    },
  } as unknown as PrismaService;
  return new CustomersService(prisma);
}

test("customer access includes only the user's won leads", async () => {
  let where: Prisma.LeadWhereInput | undefined;
  const service = createService((query) => {
    where = query;
  });

  await service.list({ sub: "user-1", permissions: ["customers"] });

  assert.deepEqual(where, {
    stage: LeadStage.WON,
    OR: [{ assignedBdeId: "user-1" }],
  });
});

test("customer access follows assigned reporting lines", async () => {
  let where: Prisma.LeadWhereInput | undefined;
  const service = createService((query) => {
    where = query;
  });

  await service.list({
    sub: "user-2",
    permissions: ["customers"],
    subordinateUserIds: ["bde-1"],
  });

  assert.deepEqual(where, {
    stage: LeadStage.WON,
    OR: [{ assignedBdeId: "user-2" }, { assignedBdeId: "bde-1" }],
  });
});

test("users without customer access are forbidden", async () => {
  const service = createService(() => {
    assert.fail("Should not query customers without access");
  });

  await assert.rejects(
    service.list({ sub: "user-1", permissions: [] }),
    ForbiddenException,
  );
});
