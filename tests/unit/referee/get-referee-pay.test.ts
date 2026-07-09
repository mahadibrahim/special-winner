import { describe, it, expect, vi } from "vitest";

// `status` is a raw DB column consumed only to derive `locked` — it must not
// leak into the returned row shape (see the second assertion below).
const rows = [
  { gameId: "g1", scheduledAt: new Date("2026-06-01T18:00:00Z"), homeTeamName: "Red", awayTeamName: "Blue", feeCents: 4000, paymentStatus: "paid", status: "completed" },
  { gameId: "g2", scheduledAt: new Date("2026-06-08T18:00:00Z"), homeTeamName: "Red", awayTeamName: "Green", feeCents: 4000, paymentStatus: "unpaid", status: "completed" },
  { gameId: "g3", scheduledAt: new Date("2026-06-15T18:00:00Z"), homeTeamName: "Blue", awayTeamName: "Green", feeCents: 3500, paymentStatus: "unpaid", status: "scheduled" },
];
vi.mock("@/lib/db", () => ({
  getDb: () => ({
    select: () => ({ from: () => ({ innerJoin: () => ({ leftJoin: () => ({ leftJoin: () => ({ where: () => ({ orderBy: async () => rows }) }) }) }) }) }),
  }),
}));

import { getRefereePay } from "@/lib/referee/get-referee-pay";

describe("getRefereePay", () => {
  it("returns the rows (with locked derived, status stripped) and the total unpaid excluding locked rows", async () => {
    const out = await getRefereePay("u1");
    expect(out.rows).toEqual([
      { gameId: "g1", scheduledAt: rows[0].scheduledAt, homeTeamName: "Red", awayTeamName: "Blue", feeCents: 4000, paymentStatus: "paid", locked: false },
      { gameId: "g2", scheduledAt: rows[1].scheduledAt, homeTeamName: "Red", awayTeamName: "Green", feeCents: 4000, paymentStatus: "unpaid", locked: false },
      { gameId: "g3", scheduledAt: rows[2].scheduledAt, homeTeamName: "Blue", awayTeamName: "Green", feeCents: 3500, paymentStatus: "unpaid", locked: true },
    ]);
    // g3 is unpaid but its game is not completed — locked and excluded.
    expect(out.totalUnpaidCents).toBe(4000); // only g2
  });
});
