import { describe, it, expect, vi, beforeEach } from "vitest";

let owed = 0;
vi.mock("@/lib/referee/referee-queries", () => ({
  getReportsOwed: async () => owed,
}));

import { GET } from "@/pages/api/referee/nav-badges";

const ctx = () => ({ locals: { user: { id: "u1" } } }) as never;

describe("GET /api/referee/nav-badges", () => {
  beforeEach(() => { owed = 0; });

  it("returns the reports-owed count", async () => {
    owed = 3;
    const res = await GET(ctx());
    expect(await res.json()).toEqual({ reportsOwed: 3 });
  });

  it("401 when unauthenticated", async () => {
    const res = await GET({ locals: {} } as never);
    expect(res.status).toBe(401);
  });
});
