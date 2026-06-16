import { describe, it, expect, vi } from "vitest";

const rows = [
  { gameId: "g1", scheduledAt: new Date("2026-06-01T18:00:00Z"), homeTeamName: "Red", awayTeamName: "Blue", feeCents: 4000, paymentStatus: "paid" },
  { gameId: "g2", scheduledAt: new Date("2026-06-08T18:00:00Z"), homeTeamName: "Red", awayTeamName: "Green", feeCents: 4000, paymentStatus: "unpaid" },
  { gameId: "g3", scheduledAt: new Date("2026-06-15T18:00:00Z"), homeTeamName: "Blue", awayTeamName: "Green", feeCents: 3500, paymentStatus: "unpaid" },
];
vi.mock("@/lib/db", () => ({
  getDb: () => ({
    select: () => ({ from: () => ({ innerJoin: () => ({ leftJoin: () => ({ leftJoin: () => ({ where: () => ({ orderBy: async () => rows }) }) }) }) }) }),
  }),
}));

import { getRefereePay } from "@/lib/referee/get-referee-pay";

describe("getRefereePay", () => {
  it("returns the rows and the total unpaid", async () => {
    const out = await getRefereePay("u1");
    expect(out.rows).toEqual(rows);
    expect(out.totalUnpaidCents).toBe(7500); // 4000 + 3500
  });
});
