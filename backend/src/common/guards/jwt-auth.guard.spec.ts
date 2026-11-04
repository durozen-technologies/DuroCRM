import * as assert from "node:assert/strict";
import { test } from "node:test";
import { ExecutionContext } from "@nestjs/common";
import { sign } from "jsonwebtoken";
import type { Actor } from "../authorization/actor-permission";
import { PrismaService } from "../../prisma/prisma.service";
import { JwtAuthGuard } from "./jwt-auth.guard";

test("JWT actor scope includes transitive reporting-line descendants", async () => {
  const previousSecret = process.env.JWT_SECRET;
  const secret = "test-jwt-secret-with-at-least-thirty-two-characters";
  process.env.JWT_SECRET = secret;
  try {
    const request: { headers: Record<string, string>; user?: Actor } = {
      headers: {
        authorization: `Bearer ${sign({ sub: "manager-1" }, secret)}`,
      },
    };
    const prisma = {
      user: {
        findUnique: async () => ({
          id: "manager-1",
          isCliAdmin: false,
          customRole: {
            id: "manager-role",
            name: "Manager",
            permissions: ["dashboard"],
          },
          fullName: "Manager",
          email: "manager@example.com",
          isActive: true,
          tokenVersion: 0,
        }),
        findMany: async () => [
          { id: "lead-1", reportsToId: "manager-1" },
          { id: "bde-1", reportsToId: "lead-1" },
          { id: "unrelated-1", reportsToId: "other-manager" },
        ],
      },
      teamRole: {
        findMany: async () => [
          { id: "manager-role", subordinateRoles: [{ id: "lead-role" }] },
        ],
      },
    };
    const guard = new JwtAuthGuard(prisma as unknown as PrismaService);
    const context = {
      switchToHttp: () => ({ getRequest: () => request }),
    } as ExecutionContext;

    assert.equal(await guard.canActivate(context), true);
    assert.deepEqual(request.user?.subordinateUserIds, ["lead-1", "bde-1"]);
  } finally {
    if (previousSecret === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = previousSecret;
  }
});
