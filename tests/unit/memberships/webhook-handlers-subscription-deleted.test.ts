import { describe, it, expect, vi, beforeEach } from "vitest";

// getDb() is mocked so handleSubscriptionDeleted's two-step shape — cancel the
// membership via .returning({ id }), then cascade to that membership's class
// enrollments — is testable without a live DB. Same vi.mock("@/lib/db", ...)
// shape as tests/unit/memberships/annual-fee.test.ts.
//
// The cascade itself moved OUT of this file's handler and into
// `endEnrollmentsForMembership` (src/lib/classes/enrollment.ts), so that the
// webhook releases a churned family's already-materialized future $0 seats
// through the SAME helper the parent-facing quit and slot-change paths use
// (F6 review finding 2 — ending the standing seat alone left up to
// HORIZON_DAYS of confirmed classes standing). What this file still owns is
// the handler's contract: cancel the membership, and cascade exactly once,
// scoped to the membership this event actually cancelled. The cascade's own
// SQL is covered against a real database in
// tests/api/classes/enrollments.test.ts.
import { memberships } from "@/lib/db/schema/memberships";

let membershipUpdateReturns: Array<{ id: string }> = [];
const updateCalls: Array<{ table: unknown; values: Record<string, unknown> }> = [];
const endEnrollmentsCalls: string[] = [];

vi.mock("@/lib/db", () => ({
  getDb: () => ({
    update: (table: unknown) => ({
      set: (values: Record<string, unknown>) => ({
        where: () => {
          updateCalls.push({ table, values });
          return {
            returning: async () => (table === memberships ? membershipUpdateReturns : []),
          };
        },
      }),
    }),
  }),
}));

vi.mock("@/lib/classes/enrollment", () => ({
  endEnrollmentsForMembership: async (membershipId: string) => {
    endEnrollmentsCalls.push(membershipId);
    return { endedCount: 0 };
  },
}));

import { handleSubscriptionDeleted } from "@/lib/memberships/webhook-handlers";

describe("handleSubscriptionDeleted", () => {
  beforeEach(() => {
    membershipUpdateReturns = [];
    updateCalls.length = 0;
    endEnrollmentsCalls.length = 0;
  });

  it("cancels the membership, then cascades to its enrollments scoped to that membership id", async () => {
    membershipUpdateReturns = [{ id: "mem-1" }];

    await handleSubscriptionDeleted({ id: "sub_1" } as never);

    // Step 1: memberships → cancelled. The handler itself writes nothing else;
    // the enrollment cascade is delegated.
    expect(updateCalls).toHaveLength(1);
    expect(updateCalls[0].table).toBe(memberships);
    expect(updateCalls[0].values).toMatchObject({
      status: "cancelled",
      cancelAtPeriodEnd: false,
    });
    expect(updateCalls[0].values.cancelledAt).toBeInstanceOf(Date);

    // Step 2: the cascade — including the future-$0-seat release and the
    // post-commit waitlist promotion that live inside it.
    expect(endEnrollmentsCalls).toEqual(["mem-1"]);
  });

  it("skips the enrollment cascade when no membership matched the subscription id", async () => {
    membershipUpdateReturns = []; // no row — e.g. a subscription id that was never ours

    await handleSubscriptionDeleted({ id: "sub_unknown" } as never);

    expect(updateCalls).toHaveLength(1);
    expect(updateCalls[0].table).toBe(memberships);
    expect(endEnrollmentsCalls).toEqual([]);
  });
});
