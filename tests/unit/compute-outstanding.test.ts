import { describe, it, expect } from "vitest";
import { computeOutstandingCents } from "@/lib/person/compute-outstanding";

describe("computeOutstandingCents", () => {
  it("sums unpaid + deposit_paid shortfalls, ignores paid/refunded", () => {
    expect(
      computeOutstandingCents([
        {
          paymentStatus: "unpaid",
          amountDueCents: 10000,
          amountPaidCents: 0,
        },
        {
          paymentStatus: "deposit_paid",
          amountDueCents: 10000,
          amountPaidCents: 4000,
        },
        { paymentStatus: "paid", amountDueCents: 5000, amountPaidCents: 5000 },
        {
          paymentStatus: "refunded",
          amountDueCents: 5000,
          amountPaidCents: 0,
        },
      ]),
    ).toBe(16000);
  });

  it("never goes negative", () => {
    expect(
      computeOutstandingCents([
        {
          paymentStatus: "unpaid",
          amountDueCents: 1000,
          amountPaidCents: 5000,
        },
      ]),
    ).toBe(0);
  });
});
