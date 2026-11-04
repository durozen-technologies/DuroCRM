import * as assert from "node:assert/strict";
import { test } from "node:test";
import { LeadStage } from "@prisma/client";
import { canTransition } from "./stage-rules";
import { StageTransitionService } from "./stage-transition.service";

test("allows backward movement between active pipeline stages", () => {
  assert.equal(canTransition(LeadStage.NEGOTIATION, LeadStage.PROPOSAL), true);
  assert.equal(canTransition(LeadStage.PROPOSAL, LeadStage.MEETING), true);
  assert.equal(canTransition(LeadStage.CONTACTED, LeadStage.NEW_LEAD), true);
});

test("preserves existing forward stage transitions", () => {
  assert.equal(canTransition(LeadStage.CONTACTED, LeadStage.MEETING), true);
  assert.equal(canTransition(LeadStage.NEW_LEAD, LeadStage.INTERESTED), true);
  assert.equal(canTransition(LeadStage.NEW_LEAD, LeadStage.PROPOSAL), false);
});

test("allows a customer to accept a proposal without entering negotiation", () => {
  assert.equal(canTransition(LeadStage.PROPOSAL, LeadStage.WON), true);
});

test("keeps won and lost leads terminal", () => {
  assert.equal(canTransition(LeadStage.WON, LeadStage.NEGOTIATION), false);
  assert.equal(canTransition(LeadStage.LOST, LeadStage.CONTACTED), false);
  assert.equal(canTransition(LeadStage.WON, LeadStage.LOST), false);
});

test("allows only Admin to reopen a lost lead as interested", () => {
  const transitions = new StageTransitionService();

  assert.throws(
    () =>
      transitions.assertAllowed(
        LeadStage.LOST,
        LeadStage.INTERESTED,
        false,
      ),
    /Lead cannot move from LOST to INTERESTED/,
  );
  assert.doesNotThrow(() =>
    transitions.assertAllowed(LeadStage.LOST, LeadStage.INTERESTED, true),
  );
  assert.throws(
    () =>
      transitions.assertAllowed(
        LeadStage.LOST,
        LeadStage.CONTACTED,
        true,
      ),
    /Lead cannot move from LOST to CONTACTED/,
  );
});
