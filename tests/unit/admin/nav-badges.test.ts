import { describe, it, expect, vi } from "vitest";

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
  it("returns inbox, refundsPending, and attention counts", async () => {
    const b = await getNavBadges("org_1");
    expect(b).toEqual({ refundsPending: 3, inbox: 5, attention: 2 });
  });
});
