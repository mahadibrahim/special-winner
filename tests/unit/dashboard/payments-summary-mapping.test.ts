import { describe, it, expect } from "vitest";
import { mapHistoryToSummary } from "@/lib/dashboard/payments-summary-mapping";
import type { HistoryPaymentRow } from "@/lib/dashboard/payments-summary-mapping";

function row(overrides: Partial<HistoryPaymentRow> = {}): HistoryPaymentRow {
  return {
    id: "pay_1",
    amount: 45,
    amountCents: 4500,
    paymentType: "installment",
    status: "succeeded",
    createdAt: "2026-08-01T12:00:00.000Z",
    stripePaymentIntentId: "pi_1",
    familyMember: { firstName: "Alex", lastName: "Doe" },
    team: null,
    season: { name: "Fall Classes 2026" },
    program: { name: "Youth Classes" },
    sport: { name: "Soccer", icon: null, color: null },
    membership: null,
    ...overrides,
  };
}

describe("mapHistoryToSummary", () => {
  it("returns an empty array for zero rows", () => {
    expect(mapHistoryToSummary([])).toEqual([]);
  });

  it("maps a payment row's person label from familyMember when present", () => {
    const result = mapHistoryToSummary([row()]);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      id: "pay_1",
      description: "Fall Classes 2026",
      personLabel: "Alex Doe",
      amountCents: 4500,
      status: "succeeded",
      createdAt: "2026-08-01T12:00:00.000Z",
    });
  });

  it("falls back to the team name when familyMember is null (team-level payment)", () => {
    const result = mapHistoryToSummary([
      row({ familyMember: null, team: { name: "U10 Blue" } }),
    ]);
    expect(result[0].personLabel).toBe("U10 Blue");
  });

  it("falls back to an em dash when neither familyMember nor team is present", () => {
    const result = mapHistoryToSummary([row({ familyMember: null, team: null })]);
    expect(result[0].personLabel).toBe("—");
  });

  it("sorts by createdAt descending regardless of input order", () => {
    const older = row({ id: "pay_old", createdAt: "2026-07-01T00:00:00.000Z" });
    const newer = row({ id: "pay_new", createdAt: "2026-08-15T00:00:00.000Z" });
    const result = mapHistoryToSummary([older, newer]);
    expect(result.map((r) => r.id)).toEqual(["pay_new", "pay_old"]);
  });

  it("falls back to the membership tier name when season is null (F1: membership charge row)", () => {
    const result = mapHistoryToSummary([
      row({
        season: null,
        program: null,
        sport: null,
        paymentType: "membership",
        membership: { tierName: "Academy" },
      }),
    ]);
    expect(result[0].description).toBe("Academy Membership");
  });

  it("falls back to a generic label when both season and membership are null", () => {
    const result = mapHistoryToSummary([
      row({ season: null, program: null, sport: null, membership: null }),
    ]);
    expect(result[0].description).toBe("Payment");
  });

  it("caps the result at 3 rows, keeping only the most recent", () => {
    const rows = [
      row({ id: "p1", createdAt: "2026-01-01T00:00:00.000Z" }),
      row({ id: "p2", createdAt: "2026-02-01T00:00:00.000Z" }),
      row({ id: "p3", createdAt: "2026-03-01T00:00:00.000Z" }),
      row({ id: "p4", createdAt: "2026-04-01T00:00:00.000Z" }),
    ];
    const result = mapHistoryToSummary(rows);
    expect(result).toHaveLength(3);
    expect(result.map((r) => r.id)).toEqual(["p4", "p3", "p2"]);
  });
});
