import { describe, it, expect, vi, beforeEach } from "vitest";

let assignment: { id: string } | undefined;
let txCalls: string[] = [];

const txMock = {
  update: () => ({ set: () => ({ where: async () => { txCalls.push("update"); } }) }),
  delete: () => ({ where: async () => { txCalls.push("delete"); } }),
  insert: () => ({ values: async () => { txCalls.push("insert"); } }),
};

vi.mock("@/lib/db", () => ({
  getDb: () => ({
    select: () => ({ from: () => ({ where: () => ({ limit: async () => (assignment ? [assignment] : []) }) }) }),
    transaction: async (fn: (tx: typeof txMock) => Promise<void>) => { await fn(txMock); },
  }),
}));

import { POST } from "@/pages/api/referee/matches/[gameId]/report";

const ctx = (body: unknown, gameId = "g1") =>
  ({
    locals: { user: { id: "u1" } },
    params: { gameId },
    request: { json: async () => body },
  }) as any;

const validBody = { homeScore: 2, awayScore: 1, refereeNotes: "clean game", incidents: [{ type: "yellow_card", side: "home", player: "#7", minute: 65 }] };

describe("POST referee report", () => {
  beforeEach(() => { assignment = { id: "a1" }; txCalls = []; });

  it("401 when unauthenticated", async () => {
    const res = await POST({ ...ctx(validBody), locals: {} } as never);
    expect(res.status).toBe(401);
  });

  it("404 when the ref is not an assigned official", async () => {
    assignment = undefined;
    const res = await POST(ctx(validBody));
    expect(res.status).toBe(404);
  });

  it("400 on a negative score", async () => {
    const res = await POST(ctx({ ...validBody, homeScore: -1 }));
    expect(res.status).toBe(400);
  });

  it("400 on an unknown incident type", async () => {
    const res = await POST(ctx({ ...validBody, incidents: [{ type: "goal", side: "home" }] }));
    expect(res.status).toBe(400);
  });

  it("200 on a valid report, replacing incidents", async () => {
    const res = await POST(ctx(validBody));
    expect(res.status).toBe(200);
    // update game, delete old incidents, insert new
    expect(txCalls).toEqual(["update", "delete", "insert"]);
  });
});
