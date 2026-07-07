import { describe, it, expect, vi, beforeEach } from "vitest";
import { gameIncidents } from "@/lib/db/schema/teams";
import { suspensions } from "@/lib/db/schema/suspensions";

let assignmentRows: Array<{ id: string }> = [];
let gameRows: Array<{ homeTeamId: string | null; awayTeamId: string | null; organizationId: string }> = [];
let callIndex = 0;
let txCalls: string[] = [];
let lastSuspensionValues: any = null;
let lastIncidentValues: any = null;

function makeChain(idx: number) {
  const results = [assignmentRows, gameRows];
  const node: any = {
    from: () => node,
    innerJoin: () => node,
    where: () => node,
    limit: async () => results[idx] ?? [],
  };
  return node;
}

const txMock = {
  insert: (table: unknown) => ({
    values: (vals: any) => ({
      returning: async () => {
        if (table === gameIncidents) {
          txCalls.push("insert:incident");
          lastIncidentValues = vals;
          return [{ id: "inc1", ...vals }];
        }
        if (table === suspensions) {
          txCalls.push("insert:suspension");
          lastSuspensionValues = vals;
          return [{ id: "susp1", ...vals }];
        }
        throw new Error("unexpected insert table in test mock");
      },
    }),
  }),
};

vi.mock("@/lib/db", () => ({
  getDb: () => ({
    select: () => makeChain(callIndex++),
    transaction: async (fn: (tx: typeof txMock) => Promise<unknown>) => fn(txMock),
  }),
}));

import { POST } from "@/pages/api/referee/matches/[gameId]/ejections";

const ctx = (body: unknown, gameId = "g1") =>
  ({
    locals: { user: { id: "u1" } },
    params: { gameId },
    request: { json: async () => body },
  }) as any;

const validBody = {
  side: "home",
  player: "#7",
  minute: 65,
  reason: "Violent conduct",
  carriesSuspension: false,
};

describe("POST /api/referee/matches/[gameId]/ejections", () => {
  beforeEach(() => {
    assignmentRows = [{ id: "a1" }];
    gameRows = [{ homeTeamId: "team-home", awayTeamId: "team-away", organizationId: "org1" }];
    callIndex = 0;
    txCalls = [];
    lastSuspensionValues = null;
    lastIncidentValues = null;
  });

  it("401 when unauthenticated", async () => {
    const res = await POST({ ...ctx(validBody), locals: {} } as never);
    expect(res.status).toBe(401);
  });

  it("404 when the ref is not an assigned official", async () => {
    assignmentRows = [];
    const res = await POST(ctx(validBody));
    expect(res.status).toBe(404);
  });

  it("400 on an invalid payload (missing reason)", async () => {
    const { reason, ...bad } = validBody;
    const res = await POST(ctx(bad));
    expect(res.status).toBe(400);
  });

  it("400 on a bad side", async () => {
    const res = await POST(ctx({ ...validBody, side: "referee" }));
    expect(res.status).toBe(400);
  });

  it("201 on a valid ejection without a suspension (no suspensions insert)", async () => {
    const res = await POST(ctx(validBody));
    expect(res.status).toBe(201);
    expect(txCalls).toEqual(["insert:incident"]);
    const body = await res.json();
    expect(body.incident.type).toBe("ejection");
    expect(body.suspension).toBeNull();
  });

  it("201 on a valid ejection with a suspension (both inserts, teamId matches side)", async () => {
    const res = await POST(
      ctx({ ...validBody, side: "away", carriesSuspension: true, gamesMissed: 2, suspensionNotes: "note" }),
    );
    expect(res.status).toBe(201);
    expect(txCalls).toEqual(["insert:incident", "insert:suspension"]);
    expect(lastSuspensionValues.teamId).toBe("team-away");
    expect(lastSuspensionValues.gamesMissed).toBe(2);
    expect(lastSuspensionValues.organizationId).toBe("org1");
    const body = await res.json();
    expect(body.suspension.teamId).toBe("team-away");
  });

  it("defaults gamesMissed to 1 when carriesSuspension is true and gamesMissed is omitted", async () => {
    const res = await POST(ctx({ ...validBody, carriesSuspension: true }));
    expect(res.status).toBe(201);
    expect(lastSuspensionValues.gamesMissed).toBe(1);
  });

  it("400 when carriesSuspension is true but the side's team is TBD (null)", async () => {
    gameRows = [{ homeTeamId: null, awayTeamId: "team-away", organizationId: "org1" }];
    const res = await POST(ctx({ ...validBody, side: "home", carriesSuspension: true }));
    expect(res.status).toBe(400);
  });
});
