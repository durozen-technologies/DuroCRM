import * as assert from "node:assert/strict";
import { test } from "node:test";
import { leadScope } from "./lead-scope";
import { teamScope } from "./team-scope";

test("limits individual lead access to their own assigned records", () => {
  const actor = { sub: "bde-1", permissions: ["leads_view"] };

  assert.deepEqual(leadScope(actor), {
    OR: [{ assignedBdeId: "bde-1" }],
  });
});

test("includes the manager and users in their reporting hierarchy", () => {
  const actor = {
    sub: "manager-1",
    permissions: ["leads_view"],
    subordinateRoleIds: ["team-lead", "bde"],
    subordinateUserIds: ["lead-1", "bde-1"],
  };

  assert.deepEqual(leadScope(actor), {
    OR: [
      { assignedBdeId: "manager-1" },
      { assignedBdeId: "lead-1" },
      { assignedBdeId: "bde-1" },
    ],
  });
  assert.deepEqual(teamScope(actor), {
    OR: [{ id: "manager-1" }, { id: "lead-1" }, { id: "bde-1" }],
  });
});

test("leaves Admin data scope unrestricted", () => {
  const actor = {
    sub: "admin-1",
    permissions: ["leads_view"],
    isCliAdmin: true,
  };

  assert.deepEqual(leadScope(actor), {});
  assert.deepEqual(teamScope(actor), {});
});
