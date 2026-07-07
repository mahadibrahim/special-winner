import { describe, it, expect } from "vitest";
import { getDb } from "@/lib/db";
import { organizations, users } from "@/lib/db/schema";
import {
  getAccountCreditBalanceCents,
  issueAccountCredit,
  redeemAccountCredit,
} from "@/lib/payments/account-credit";
import { seedPaidRegistration } from "../../utils/registration-context";

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
    const past = new Date(Date.now() - 24 * 60 * 60 * 1000);
    await issueAccountCredit({
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
