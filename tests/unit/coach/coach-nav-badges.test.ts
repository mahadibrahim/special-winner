import { describe, it, expect, vi, beforeEach } from "vitest";

let teamIds: string[] = [];
let parentRows: Array<{ parentUserId: string | null }> = [];
let unreadCount = 0;
let dueCount = 0;

vi.mock("@/lib/auth/roles", () => ({
  getCoachTeamIds: async () => teamIds,
}));
vi.mock("@/lib/curriculum/assessment-cadence-query", () => ({
  getAssessmentsDueCount: async () => dueCount,
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
  beforeEach(() => { teamIds = []; parentRows = []; unreadCount = 0; dueCount = 0; });

  it("returns zeros when the coach has no teams", async () => {
    teamIds = [];
    const res = await GET(ctx());
    expect(await res.json()).toEqual({ inbox: 0, assessmentsDue: 0 });
  });

  it("counts unread conversations and assessments due", async () => {
    teamIds = ["t1"];
    parentRows = [{ parentUserId: "p1" }, { parentUserId: "p2" }];
    unreadCount = 3;
    dueCount = 4;
    const res = await GET(ctx());
    expect(await res.json()).toEqual({ inbox: 3, assessmentsDue: 4 });
  });

  it("still reports assessments due when no roster parents have accounts", async () => {
    teamIds = ["t1"];
    parentRows = [];
    dueCount = 2;
    const res = await GET(ctx());
    expect(await res.json()).toEqual({ inbox: 0, assessmentsDue: 2 });
  });
});
