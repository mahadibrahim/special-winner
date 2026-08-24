import { describe, it, expect, vi, beforeEach } from "vitest";

// getDb() is mocked so handleSubscriptionDeleted's two-step SQL shape —
// cancel the membership via .returning({ id }), then end its active class
// enrollments scoped to that membership id — is testable without a live DB.
// Same vi.mock("@/lib/db", ...) shape as tests/unit/memberships/annual-fee.test.ts.
//
// Per the Task 7 plan addendum: no pre-existing webhook-handlers unit-test
// file covers handleSubscriptionDeleted (it's fully mocked away in
// tests/unit/stripe/membership-event-routing.test.ts, which only asserts
// routing). This is a new, from-scratch unit test targeting the new
// class-enrollment cascade specifically.
import { memberships } from "@/lib/db/schema/memberships";
import { classEnrollments } from "@/lib/db/schema/classes";

let membershipUpdateReturns: Array<{ id: string }> = [];
const updateCalls: Array<{ table: unknown; values: Record<string, unknown> }> = [];
const whereCalls: Array<{ table: unknown; where: unknown }> = [];

vi.mock("@/lib/db", () => ({
  getDb: () => ({
    update: (table: unknown) => ({
      set: (values: Record<string, unknown>) => ({
        where: (whereExpr: unknown) => {
          updateCalls.push({ table, values });
          whereCalls.push({ table, where: whereExpr });
          return {
            returning: async () => (table === memberships ? membershipUpdateReturns : []),
          };
        },
      }),
    }),
  }),
}));

import { handleSubscriptionDeleted } from "@/lib/memberships/webhook-handlers";

describe("handleSubscriptionDeleted", () => {
  beforeEach(() => {
    membershipUpdateReturns = [];
    updateCalls.length = 0;
    whereCalls.length = 0;
  });

  it("cancels the membership, then ends its active class enrollments scoped to that membership id", async () => {
    membershipUpdateReturns = [{ id: "mem-1" }];

    await handleSubscriptionDeleted({ id: "sub_1" } as never);

    expect(updateCalls).toHaveLength(2);

    // Step 1: memberships → cancelled.
    expect(updateCalls[0].table).toBe(memberships);
    expect(updateCalls[0].values).toMatchObject({
      status: "cancelled",
      cancelAtPeriodEnd: false,
    });
    expect(updateCalls[0].values.cancelledAt).toBeInstanceOf(Date);

    // Step 2: class_enrollments → ended, scoped to the cancelled membership.
    expect(updateCalls[1].table).toBe(classEnrollments);
    expect(updateCalls[1].values).toMatchObject({ status: "ended" });
    expect(updateCalls[1].values.endedAt).toBeInstanceOf(Date);
  });

  it("skips the class_enrollments update when no membership matched the subscription id", async () => {
    membershipUpdateReturns = []; // no row — e.g. a subscription id that was never ours

    await handleSubscriptionDeleted({ id: "sub_unknown" } as never);

    expect(updateCalls).toHaveLength(1);
    expect(updateCalls[0].table).toBe(memberships);
  });
});
