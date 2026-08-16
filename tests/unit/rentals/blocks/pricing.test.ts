import { describe, it, expect } from "vitest";
import { generateBlockSessions } from "@/lib/rentals/blocks/generate";
import {
  quoteBlock,
  priceSession,
  balanceDueAt,
  applyCancellationToBlockMoney,
} from "@/lib/rentals/blocks/pricing";

const TZ = "America/New_York";
const V1 = "11111111-1111-1111-1111-111111111111";

const soccerone = {
  brand: "soccerone" as const,
  timeZone: TZ,
  venueHourlyRateCents: { [V1]: null },
  defaultHourlyRateCents: 8000,
};

// 12 Tuesdays 8-9pm, Jan-Mar 2026, so the winter evening tier at $260/hr.
const tuesdays = generateBlockSessions({
  timeZone: TZ,
  firstDate: "2026-01-06",
  lastDate: "2026-03-24",
  days: [{ weekday: 2, startMinute: 1200, durationMinutes: 60, venueIds: [V1] }],
});

const multipleOf100 = (n: number) => n % 100 === 0;

describe("priceSession", () => {
  it("uses the SoccerOne winter evening tier", () => {
    expect(priceSession(tuesdays[0], soccerone)).toBe(26000);
  });

  it("uses the flat hourly rate for the Aspire storefront", () => {
    expect(priceSession(tuesdays[0], { ...soccerone, brand: "aspire" })).toBe(8000);
  });

  it("prefers a venue rate override on the Aspire storefront", () => {
    expect(
      priceSession(tuesdays[0], {
        ...soccerone,
        brand: "aspire",
        venueHourlyRateCents: { [V1]: 12000 },
      }),
    ).toBe(12000);
  });
});

describe("quoteBlock", () => {
  it("sums the rate card and applies a percent discount", () => {
    const q = quoteBlock(tuesdays, soccerone, {
      discount: { kind: "percent", value: 10 },
      depositPct: 25,
    });
    expect(q.subtotalCents).toBe(312000); // 12 x $260 = $3,120
    expect(q.discountCents).toBe(31200); // -$312
    expect(q.totalCents).toBe(280800); // $2,808
    expect(q.depositDueCents).toBe(70200); // $702
    expect(q.balanceDueCents).toBe(210600); // $2,106
  });

  it("applies a flat-amount discount", () => {
    const q = quoteBlock(tuesdays.slice(0, 11), soccerone, {
      discount: { kind: "amount", value: 30000 },
      depositPct: 25,
    });
    expect(q.subtotalCents).toBe(286000);
    expect(q.totalCents).toBe(256000); // $2,560
    expect(q.depositDueCents).toBe(64000); // 25% of $2,560 = $640
  });

  it("keeps every amount a whole number of dollars", () => {
    const q = quoteBlock(tuesdays.slice(0, 11), soccerone, {
      discount: { kind: "percent", value: 13 },
      depositPct: 25,
    });
    for (const n of [
      q.subtotalCents,
      q.discountCents,
      q.totalCents,
      q.depositDueCents,
      q.balanceDueCents,
    ]) {
      expect(multipleOf100(n)).toBe(true);
    }
    expect(q.sessions.every((s) => multipleOf100(s.allocatedCents))).toBe(true);
  });

  it("allocates per-session amounts summing exactly to the total, remainder on the first", () => {
    const q = quoteBlock(tuesdays.slice(0, 11), soccerone, {
      discount: { kind: "amount", value: 30000 },
      depositPct: 25,
    });
    const sum = q.sessions.reduce((a, s) => a + s.allocatedCents, 0);
    expect(sum).toBe(q.totalCents);
    // $2,560 / 11 gives $232 each, with the $8 remainder onto the first session.
    expect(q.sessions[0].allocatedCents).toBe(24000);
    expect(q.sessions[1].allocatedCents).toBe(23200);
  });

  it("treats a null discount as no discount", () => {
    const q = quoteBlock(tuesdays, soccerone, { discount: null, depositPct: 25 });
    expect(q.discountCents).toBe(0);
    expect(q.totalCents).toBe(q.subtotalCents);
  });

  it("never lets a discount push the total below zero", () => {
    const q = quoteBlock(tuesdays.slice(0, 1), soccerone, {
      discount: { kind: "amount", value: 99999900 },
      depositPct: 25,
    });
    expect(q.totalCents).toBe(0);
    expect(q.depositDueCents).toBe(0);
    expect(q.balanceDueCents).toBe(0);
  });

  it("returns a zero quote for no sessions", () => {
    const q = quoteBlock([], soccerone, { discount: null, depositPct: 25 });
    expect(q).toMatchObject({
      subtotalCents: 0,
      totalCents: 0,
      depositDueCents: 0,
      balanceDueCents: 0,
    });
    expect(q.sessions).toEqual([]);
  });

  it("charges a 100% deposit as the whole total with no balance", () => {
    const q = quoteBlock(tuesdays, soccerone, { discount: null, depositPct: 100 });
    expect(q.depositDueCents).toBe(q.totalCents);
    expect(q.balanceDueCents).toBe(0);
  });
});

describe("balanceDueAt", () => {
  it("is the lead-day count before the first session", () => {
    expect(balanceDueAt(new Date("2026-01-07T01:00:00.000Z"), 30).toISOString()).toBe(
      "2025-12-08T01:00:00.000Z",
    );
  });
});

describe("applyCancellationToBlockMoney", () => {
  // A 12-week block at $260/session: $3,120 total, 25% deposit paid, $2,340
  // balance still to collect.
  const depositPaidBlock = {
    totalCents: 312_000,
    balanceDueCents: 234_000,
    depositPaid: true,
    balancePaid: false,
  };

  it("takes the cancelled sessions off the total and the unpaid balance", () => {
    const r = applyCancellationToBlockMoney({
      ...depositPaidBlock,
      cancelledAllocatedCents: 78_000, // three sessions
    });
    expect(r.reductionCents).toBe(78_000);
    expect(r.totalCents).toBe(234_000);
    expect(r.balanceDueCents).toBe(156_000);
    expect(r.settled).toBe(false);
  });

  it("keeps every figure a whole number of dollars", () => {
    const r = applyCancellationToBlockMoney({
      ...depositPaidBlock,
      cancelledAllocatedCents: 78_049,
    });
    expect(multipleOf100(r.reductionCents)).toBe(true);
    expect(multipleOf100(r.totalCents)).toBe(true);
    expect(multipleOf100(r.balanceDueCents)).toBe(true);
  });

  it("never drops the total below what has been paid", () => {
    // Cancelling everything still leaves the $780 deposit already collected.
    const r = applyCancellationToBlockMoney({
      ...depositPaidBlock,
      cancelledAllocatedCents: 312_000,
    });
    expect(r.reductionCents).toBe(234_000);
    expect(r.totalCents).toBe(78_000);
    expect(r.balanceDueCents).toBe(0);
  });

  it("settles the balance when nothing is left to collect", () => {
    const r = applyCancellationToBlockMoney({
      ...depositPaidBlock,
      cancelledAllocatedCents: 999_000,
    });
    expect(r.balanceDueCents).toBe(0);
    expect(r.settled).toBe(true);
  });

  it("does not settle a block whose deposit is still outstanding", () => {
    const r = applyCancellationToBlockMoney({
      totalCents: 312_000,
      balanceDueCents: 234_000,
      cancelledAllocatedCents: 999_000,
      depositPaid: false,
      balancePaid: false,
    });
    expect(r.balanceDueCents).toBe(0);
    expect(r.totalCents).toBe(78_000);
    expect(r.settled).toBe(false);
  });

  it("leaves a fully paid block alone: collected money is the refund flow", () => {
    const r = applyCancellationToBlockMoney({
      totalCents: 312_000,
      balanceDueCents: 234_000,
      cancelledAllocatedCents: 78_000,
      depositPaid: true,
      balancePaid: true,
    });
    expect(r.reductionCents).toBe(0);
    expect(r.totalCents).toBe(312_000);
    expect(r.balanceDueCents).toBe(234_000);
    expect(r.settled).toBe(false);
  });

  it("settles a deposit-paid block that already owed nothing", () => {
    const r = applyCancellationToBlockMoney({
      totalCents: 312_000,
      balanceDueCents: 0,
      cancelledAllocatedCents: 26_000,
      depositPaid: true,
      balancePaid: false,
    });
    expect(r.reductionCents).toBe(0);
    expect(r.totalCents).toBe(312_000);
    expect(r.settled).toBe(true);
  });

  it("preserves total = deposit + balance", () => {
    const depositCents = depositPaidBlock.totalCents - depositPaidBlock.balanceDueCents;
    for (const cancelled of [0, 26_000, 130_000, 234_000, 500_000]) {
      const r = applyCancellationToBlockMoney({
        ...depositPaidBlock,
        cancelledAllocatedCents: cancelled,
      });
      expect(r.totalCents).toBe(depositCents + r.balanceDueCents);
      expect(r.balanceDueCents).toBeGreaterThanOrEqual(0);
    }
  });
});
