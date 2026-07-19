import { describe, it, expect } from "vitest";
import {
  captainDepositCreditCents,
  captainShareDueCents,
  teamCollectedCents,
  teamDepositPaid,
} from "@/lib/registrations/captain-credit";

/**
 * Captain deposit-credit semantics (the double-charge fix).
 *
 * A captain who paid the $200 team deposit and then registers themselves as
 * a player has their share credited by the deposit: due = max(0, share −
 * deposit). Typical case ($120 individual share, $200 deposit) → $0 due.
 * The tracker must not double-count: the deposit is counted once, and the
 * captain's own paid share only adds the portion above the deposit.
 */

const DEPOSIT = 20000; // $200 (locked decision)

describe("captainShareDueCents / captainDepositCreditCents", () => {
  it("fully covers a share at or below the deposit (typical $120 solo share)", () => {
    expect(captainShareDueCents(12000, DEPOSIT)).toBe(0);
    expect(captainDepositCreditCents(12000, DEPOSIT)).toBe(12000);
  });

  it("covers a share exactly equal to the deposit", () => {
    expect(captainShareDueCents(20000, DEPOSIT)).toBe(0);
    expect(captainDepositCreditCents(20000, DEPOSIT)).toBe(20000);
  });

  it("charges only the remainder for a share above the deposit ($350 assigned share)", () => {
    expect(captainShareDueCents(35000, DEPOSIT)).toBe(15000);
    expect(captainDepositCreditCents(35000, DEPOSIT)).toBe(20000);
  });

  it("gives no credit when no deposit was paid", () => {
    expect(captainShareDueCents(12000, 0)).toBe(12000);
    expect(captainDepositCreditCents(12000, 0)).toBe(0);
  });

  it("never goes negative on garbage inputs", () => {
    expect(captainShareDueCents(12000, -500)).toBe(12000);
    expect(captainDepositCreditCents(-100, DEPOSIT)).toBe(0);
    expect(captainShareDueCents(0, DEPOSIT)).toBe(0);
  });
});

describe("teamCollectedCents (payment-tracker double-count guard)", () => {
  it("counts the deposit plus paid non-captain shares", () => {
    expect(
      teamCollectedCents({
        depositCents: DEPOSIT,
        invitees: [
          { assignedShareCents: 10000, status: "paid", isCaptain: false },
          { assignedShareCents: 10000, status: "pending", isCaptain: false },
        ],
      }),
    ).toBe(30000);
  });

  it("adds NOTHING for a captain share fully covered by the deposit ($0 registration)", () => {
    expect(
      teamCollectedCents({
        depositCents: DEPOSIT,
        invitees: [
          { assignedShareCents: 12000, status: "paid", isCaptain: true },
        ],
      }),
    ).toBe(DEPOSIT);
  });

  it("adds only the above-deposit remainder for a partial-credit captain share", () => {
    // Captain assigned themselves $350; deposit covered $200, they paid $150.
    expect(
      teamCollectedCents({
        depositCents: DEPOSIT,
        invitees: [
          { assignedShareCents: 35000, status: "paid", isCaptain: true },
          { assignedShareCents: 10000, status: "paid", isCaptain: false },
        ],
      }),
    ).toBe(DEPOSIT + 15000 + 10000);
  });

  it("ignores unpaid and charged_to_captain rows", () => {
    expect(
      teamCollectedCents({
        depositCents: DEPOSIT,
        invitees: [
          { assignedShareCents: 10000, status: "charged_to_captain", isCaptain: false },
          { assignedShareCents: null, status: "paid", isCaptain: false },
        ],
      }),
    ).toBe(DEPOSIT);
  });
});

describe("teamDepositPaid", () => {
  it("is false before the deposit webhook lands", () => {
    expect(teamDepositPaid({ backstopStatus: "none", depositPaymentId: null })).toBe(false);
  });

  it("is true once backstopStatus moves past 'none' or the ledger row exists", () => {
    expect(teamDepositPaid({ backstopStatus: "pending", depositPaymentId: null })).toBe(true);
    expect(teamDepositPaid({ backstopStatus: "charged", depositPaymentId: null })).toBe(true);
    expect(
      teamDepositPaid({ backstopStatus: "none", depositPaymentId: "11111111-1111-1111-1111-111111111111" }),
    ).toBe(true);
  });
});
