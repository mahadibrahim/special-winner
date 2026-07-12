import { describe, it, expect, vi, beforeEach } from "vitest";

// Two count queries run in getNavBadges in this order: refunds (3 inner joins),
// then inbox (no join). Return 3 then 5.
const counts = [{ count: 3 }, { count: 5 }];
let call = 0;
vi.mock("@/lib/db", () => ({
  getDb: () => ({
    select: () => ({
      from: () => ({
        innerJoin: () => ({ innerJoin: () => ({ innerJoin: () => ({ where: async () => [counts[call++]] }) }) }),
        where: async () => [counts[call++]],
      }),
    }),
  }),
}));

vi.mock("@/lib/admin/attention-feed", () => ({
  getAttentionFeed: vi.fn(async () => [{ id: "a" }, { id: "b" }]),
}));

import { getNavBadges } from "@/lib/admin/nav-badges";

describe("getNavBadges", () => {
  beforeEach(() => {
    call = 0;
  });

  it("returns inbox, refundsPending, and attention counts", async () => {
    const b = await getNavBadges("org_1");
    expect(b).toEqual({ refundsPending: 3, inbox: 5, attention: 2 });
  });

  it("scoped variant: location-scoped refunds + assigned-inbox, no attention", async () => {
    const b = await getNavBadges("org_1", { locationIds: ["loc_1"], userId: "u_1" });
    expect(b).toEqual({ refundsPending: 3, inbox: 5, attention: 0 });
  });

  it("inboxScope: 'org' keeps refunds location-scoped but does not throw building the org-wide inbox where clause", async () => {
    // The mocked DB layer doesn't assert on WHERE clause contents (it returns
    // positional counts regardless), so this locks in that the "org" branch
    // is reachable and returns the same shape — the actual WHERE-clause
    // scoping distinction is exercised end-to-end by the kiosk/venue API
    // suites, not this unit-level mock.
    const b = await getNavBadges("org_1", {
      locationIds: ["loc_1"],
      userId: "u_1",
      inboxScope: "org",
    });
    expect(b).toEqual({ refundsPending: 3, inbox: 5, attention: 0 });
  });
});
