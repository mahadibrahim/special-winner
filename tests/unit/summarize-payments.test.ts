import { describe, it, expect } from "vitest";
import { summarizePayments } from "@/lib/person/summarize-payments";

describe("summarizePayments", () => {
  const rows = [
    { amountCents: 37500, status: "paid", createdAtIso: "2026-06-19T10:00:00Z", method: "Visa ••6411" },
    { amountCents: 9000, status: "paid", createdAtIso: "2026-05-01T10:00:00Z", method: "Visa ••6411" },
    { amountCents: 1500, status: "due", createdAtIso: "2026-06-20T10:00:00Z", method: "—" },
  ];
  it("sums paid, sums outstanding, and finds the most recent payment", () => {
    const s = summarizePayments(rows);
    expect(s.totalPaidCents).toBe(46500);
    expect(s.outstandingCents).toBe(1500);
    expect(s.lastPayment?.dateIso).toBe("2026-06-20T10:00:00Z");
  });
  it("returns zeros and null for no rows", () => {
    expect(summarizePayments([])).toEqual({ totalPaidCents: 0, outstandingCents: 0, lastPayment: null });
  });
});
