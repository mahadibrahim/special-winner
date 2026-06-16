import { describe, it, expect, vi, beforeEach } from "vitest";

let teamIds: string[] = [];
let parentRows: Array<{ parentUserId: string | null }> = [];
let unreadCount = 0;

vi.mock("@/lib/auth/roles", () => ({
  getCoachTeamIds: async () => teamIds,
}));
vi.mock("@/lib/db", () => ({
  getDb: () => ({
    selectDistinct: () => ({ from: () => ({ innerJoin: () => ({ innerJoin: () => ({ where: async () => parentRows }) }) }) }),
    select: () => ({ from: () => ({ where: async () => [{ count: unreadCount }] }) }),
  }),
}));

import { GET } from "@/pages/api/coach/nav-badges";

const ctx = () => ({ locals: { user: { id: "u1" } } }) as never;

describe("GET /api/coach/nav-badges", () => {
  beforeEach(() => { teamIds = []; parentRows = []; unreadCount = 0; });

  it("returns 0 when the coach has no teams", async () => {
    teamIds = [];
    const res = await GET(ctx());
    expect(await res.json()).toEqual({ inbox: 0 });
  });

  it("counts unread conversations for parents on the coach's teams", async () => {
    teamIds = ["t1"];
    parentRows = [{ parentUserId: "p1" }, { parentUserId: "p2" }];
    unreadCount = 3;
    const res = await GET(ctx());
    expect(await res.json()).toEqual({ inbox: 3 });
  });
});
