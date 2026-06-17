import { describe, it, expect } from "vitest";
import { sumUnpaidSharesCents, assignEvenShares } from "@/lib/payments/team-captain-charge";
describe("team shares", () => {
  it("sums only unpaid invitee shares", () => {
    expect(sumUnpaidSharesCents([
      { assignedShareCents: 12000, status: "pending" },
      { assignedShareCents: 12000, status: "paid" },
      { assignedShareCents: 10000, status: "pending" },
    ] as any)).toBe(22000);
  });
  it("even split distributes remainder to the first shares", () => {
    expect(assignEvenShares(10000, ["a@x.com", "b@x.com", "c@x.com"])).toEqual([3334, 3333, 3333]);
  });
});
