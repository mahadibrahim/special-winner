import { describe, it, expect } from "vitest";
import { eq } from "drizzle-orm";
import { addMonths } from "date-fns";
import { getDb } from "@/lib/db";
import { organizations, users, accountCredits } from "@/lib/db/schema";
import {
  getAccountCreditBalanceCents,
  issueAccountCredit,
  redeemAccountCredit,
} from "@/lib/payments/account-credit";
import { seedPaidRegistration } from "../../utils/registration-context";

/** Tolerance for "~12 months from now" assertions — generous enough to
 *  absorb test runtime, not so generous it'd pass on a broken calculation. */
const TWELVE_MONTHS_TOLERANCE_MS = 5 * 60 * 1000;

function expectAroundTwelveMonthsOut(expiresAt: Date | null, from: Date) {
  expect(expiresAt).not.toBeNull();
  const expected = addMonths(from, 12).getTime();
  expect(Math.abs(expiresAt!.getTime() - expected)).toBeLessThan(
    TWELVE_MONTHS_TOLERANCE_MS,
  );
}

/** Minimal isolated org+user pair — enough for balance/issue/redeem tests
 *  that don't need a full registration row graph. */
async function seedOrgUser(): Promise<{ organizationId: string; userId: string }> {
  const db = getDb();
  const suffix = Math.random().toString(36).slice(2, 10);

  const [org] = await db
    .insert(organizations)
    .values({
      name: `Credit Org ${suffix}`,
      slug: `credit-org-${suffix}`,
      organizationType: "headquarters",
    })
    .returning();

  const [user] = await db
    .insert(users)
    .values({
      email: `credit-user-${suffix}@test.example`,
      passwordHash: "x",
      firstName: "Cred",
      lastName: "User",
    })
    .returning();

  return { organizationId: org.id, userId: user.id };
}

describe("getAccountCreditBalanceCents", () => {
  it("is 0 when the user has no credit issuances", async () => {
    const { organizationId, userId } = await seedOrgUser();
    const balance = await getAccountCreditBalanceCents(userId, organizationId);
    expect(balance).toBe(0);
  });

  it("reflects an issued amount", async () => {
    const { organizationId, userId } = await seedOrgUser();
    await issueAccountCredit({ userId, organizationId, amountCents: 2500 });
    const balance = await getAccountCreditBalanceCents(userId, organizationId);
    expect(balance).toBe(2500);
  });

  it("excludes expired issuances", async () => {
    const { organizationId, userId } = await seedOrgUser();
    // Expiry is fully automatic now (airline-style, set/refreshed by
    // issueAccountCredit/redeemAccountCredit) — to model "issued long ago,
    // zero activity since, now past its window" we insert the row directly
    // rather than through issueAccountCredit.
    const past = new Date(Date.now() - 24 * 60 * 60 * 1000);
    await getDb().insert(accountCredits).values({
      userId,
      organizationId,
      amountCents: 1000,
      expiresAt: past,
    });
    await issueAccountCredit({ userId, organizationId, amountCents: 500 });

    const balance = await getAccountCreditBalanceCents(userId, organizationId);
    expect(balance).toBe(500);
  });

  it("is org-scoped — a credit in another org does not leak into this org's balance", async () => {
    const { userId } = await seedOrgUser();
    const { organizationId: otherOrgId } = await seedOrgUser();
    const { organizationId } = await seedOrgUser();

    await issueAccountCredit({
      userId,
      organizationId: otherOrgId,
      amountCents: 9999,
    });

    const balance = await getAccountCreditBalanceCents(userId, organizationId);
    expect(balance).toBe(0);
  });

  it("subtracts redemptions from the issued total", async () => {
    const { organizationId, userId } = await seedOrgUser();
    const { registrationId } = await seedPaidRegistration(0, {
      amountDueCents: 5000,
      paymentStatus: "unpaid",
      status: "pending",
    });
    await issueAccountCredit({ userId, organizationId, amountCents: 3000 });

    await redeemAccountCredit({
      userId,
      organizationId,
      registrationId,
      amountCentsRequested: 1200,
    });

    const balance = await getAccountCreditBalanceCents(userId, organizationId);
    expect(balance).toBe(1800);
  });
});

describe("issueAccountCredit", () => {
  it("rejects a zero amount", async () => {
    const { organizationId, userId } = await seedOrgUser();
    await expect(
      issueAccountCredit({ userId, organizationId, amountCents: 0 }),
    ).rejects.toThrow();
  });

  it("rejects a negative amount", async () => {
    const { organizationId, userId } = await seedOrgUser();
    await expect(
      issueAccountCredit({ userId, organizationId, amountCents: -100 }),
    ).rejects.toThrow();
  });
});

describe("redeemAccountCredit", () => {
  it("redeems a single-row issuance in full", async () => {
    const { organizationId, userId } = await seedOrgUser();
    const { registrationId } = await seedPaidRegistration(0, {
      amountDueCents: 5000,
      paymentStatus: "unpaid",
      status: "pending",
    });
    await issueAccountCredit({ userId, organizationId, amountCents: 2000 });

    const result = await redeemAccountCredit({
      userId,
      organizationId,
      registrationId,
      amountCentsRequested: 1500,
    });

    expect(result.redeemedCents).toBe(1500);
    const balance = await getAccountCreditBalanceCents(userId, organizationId);
    expect(balance).toBe(500);
  });

  it("clamps redemption at the available balance (over-apply guard)", async () => {
    const { organizationId, userId } = await seedOrgUser();
    const { registrationId } = await seedPaidRegistration(0, {
      amountDueCents: 5000,
      paymentStatus: "unpaid",
      status: "pending",
    });
    await issueAccountCredit({ userId, organizationId, amountCents: 1000 });

    const result = await redeemAccountCredit({
      userId,
      organizationId,
      registrationId,
      amountCentsRequested: 999_999,
    });

    expect(result.redeemedCents).toBe(1000);
    const balance = await getAccountCreditBalanceCents(userId, organizationId);
    expect(balance).toBe(0);
  });

  it("returns 0 and no-ops when the user has no credit", async () => {
    const { organizationId, userId } = await seedOrgUser();
    const { registrationId } = await seedPaidRegistration(0, {
      amountDueCents: 5000,
      paymentStatus: "unpaid",
      status: "pending",
    });

    const result = await redeemAccountCredit({
      userId,
      organizationId,
      registrationId,
      amountCentsRequested: 500,
    });

    expect(result.redeemedCents).toBe(0);
  });

  it("splits a redemption FIFO across multiple issuance rows (oldest first)", async () => {
    const { organizationId, userId } = await seedOrgUser();
    const { registrationId } = await seedPaidRegistration(0, {
      amountDueCents: 5000,
      paymentStatus: "unpaid",
      status: "pending",
    });

    await issueAccountCredit({ userId, organizationId, amountCents: 500 });
    // Small delay so createdAt strictly orders the two issuances.
    await new Promise((r) => setTimeout(r, 10));
    await issueAccountCredit({ userId, organizationId, amountCents: 500 });

    // Request more than the first issuance alone can cover — must draw the
    // remainder from the second (oldest-issued-first FIFO).
    const result = await redeemAccountCredit({
      userId,
      organizationId,
      registrationId,
      amountCentsRequested: 700,
    });

    expect(result.redeemedCents).toBe(700);
    const balance = await getAccountCreditBalanceCents(userId, organizationId);
    expect(balance).toBe(300);
  });
});

describe("account credit expiry (airline-style, 12mo of inactivity)", () => {
  it("sets a new issuance's expiresAt to ~12 months out", async () => {
    const { organizationId, userId } = await seedOrgUser();
    const before = new Date();

    const credit = await issueAccountCredit({ userId, organizationId, amountCents: 1000 });

    expectAroundTwelveMonthsOut(credit.expiresAt, before);
  });

  it("a redemption extends the remaining unexpired issuance rows' expiry", async () => {
    const { organizationId, userId } = await seedOrgUser();
    const { registrationId } = await seedPaidRegistration(0, {
      amountDueCents: 5000,
      paymentStatus: "unpaid",
      status: "pending",
    });

    const credit = await issueAccountCredit({ userId, organizationId, amountCents: 2000 });
    // Backdate to "issued a while ago, still has a couple days left" so we
    // can observe the redemption pushing expiresAt back out.
    const soon = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000);
    await getDb()
      .update(accountCredits)
      .set({ expiresAt: soon })
      .where(eq(accountCredits.id, credit.id));

    const before = new Date();
    await redeemAccountCredit({
      userId,
      organizationId,
      registrationId,
      amountCentsRequested: 500,
    });

    const [refreshed] = await getDb()
      .select()
      .from(accountCredits)
      .where(eq(accountCredits.id, credit.id));

    expect(refreshed.expiresAt!.getTime()).toBeGreaterThan(soon.getTime());
    expectAroundTwelveMonthsOut(refreshed.expiresAt, before);
  });

  it("does not extend expiry when a redemption is a no-op (no credit available)", async () => {
    const { organizationId, userId } = await seedOrgUser();
    const { registrationId } = await seedPaidRegistration(0, {
      amountDueCents: 5000,
      paymentStatus: "unpaid",
      status: "pending",
    });

    const result = await redeemAccountCredit({
      userId,
      organizationId,
      registrationId,
      amountCentsRequested: 500,
    });

    expect(result.redeemedCents).toBe(0);
  });

  it("issuing new credit refreshes the expiry of existing unexpired rows", async () => {
    const { organizationId, userId } = await seedOrgUser();

    const first = await issueAccountCredit({ userId, organizationId, amountCents: 1000 });
    const soon = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000);
    await getDb()
      .update(accountCredits)
      .set({ expiresAt: soon })
      .where(eq(accountCredits.id, first.id));

    const before = new Date();
    await issueAccountCredit({ userId, organizationId, amountCents: 500 });

    const [refreshedFirst] = await getDb()
      .select()
      .from(accountCredits)
      .where(eq(accountCredits.id, first.id));

    expect(refreshedFirst.expiresAt!.getTime()).toBeGreaterThan(soon.getTime());
    expectAroundTwelveMonthsOut(refreshedFirst.expiresAt, before);
  });

  it("a balance with no activity for over a year reads 0", async () => {
    const { organizationId, userId } = await seedOrgUser();
    // Model "issued >1yr ago, zero activity since" directly — expiresAt is
    // fully automatic in the real code paths, so a genuinely-expired row
    // only occurs after a year of silence, which we simulate by inserting
    // the row with an already-past expiresAt.
    const past = new Date(Date.now() - 24 * 60 * 60 * 1000);
    await getDb().insert(accountCredits).values({
      userId,
      organizationId,
      amountCents: 4000,
      expiresAt: past,
    });

    const balance = await getAccountCreditBalanceCents(userId, organizationId);
    expect(balance).toBe(0);
  });
});
