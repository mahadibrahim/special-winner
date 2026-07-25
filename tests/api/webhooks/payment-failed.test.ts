import { describe, it, expect, beforeEach, vi } from "vitest";
import { eq } from "drizzle-orm";
import type Stripe from "stripe";
import { getDb } from "@/lib/db";
import * as emailModule from "@/lib/email/send";
import {
  registrations,
  familyMembers,
  seasons,
  programs,
  sports,
  locations,
  organizations,
  users,
} from "@/lib/db/schema";
import { handlePaymentFailed } from "@/lib/stripe/handle-payment-failed";

function makeFailedPaymentIntent(registrationId: string): Stripe.PaymentIntent {
  return {
    id: `pi_test_fail_${Math.random().toString(36).slice(2)}`,
    object: "payment_intent",
    amount: 12000,
    status: "requires_payment_method",
    payment_method_types: ["card"],
    last_payment_error: { message: "Your card was declined." },
    metadata: { registrationId, type: "registration_payment" },
  } as unknown as Stripe.PaymentIntent;
}

/**
 * Seed a pending registration. `passwordHash: null` models a guest
 * (passwordless) parent; the default "x" models a password account.
 */
async function seedPendingRegistration(opts: {
  amountDueCents: number;
  passwordHash?: string | null;
}): Promise<{ registrationId: string; userId: string }> {
  const db = getDb();
  const suffix = Math.random().toString(36).slice(2, 10);

  const [org] = await db
    .insert(organizations)
    .values({ name: `Org ${suffix}`, slug: `org-${suffix}`, organizationType: "headquarters" })
    .returning();
  const [user] = await db
    .insert(users)
    .values({
      email: `parent-${suffix}@test.example`,
      passwordHash: opts.passwordHash === undefined ? "x" : opts.passwordHash,
      firstName: "Pat",
      lastName: "Parent",
    })
    .returning();
  const [sport] = await db
    .insert(sports)
    .values({ name: `Sport ${suffix}`, slug: `sport-${suffix}`, organizationId: org.id })
    .returning();
  const [location] = await db
    .insert(locations)
    .values({ name: `Loc ${suffix}`, slug: `loc-${suffix}`, organizationId: org.id })
    .returning();
  const [program] = await db
    .insert(programs)
    .values({
      name: `Prog ${suffix}`,
      slug: `prog-${suffix}`,
      sportId: sport.id,
      locationId: location.id,
      programType: "league",
    })
    .returning();
  const [season] = await db
    .insert(seasons)
    .values({
      name: `Season ${suffix}`,
      slug: `season-${suffix}`,
      programId: program.id,
      startDate: "2026-09-01",
      endDate: "2026-12-01",
      priceCents: opts.amountDueCents,
      status: "open",
    })
    .returning();
  const [member] = await db
    .insert(familyMembers)
    .values({ parentUserId: user.id, firstName: "Kid", lastName: "Player", birthDate: "2015-01-01" })
    .returning();
  const [registration] = await db
    .insert(registrations)
    .values({
      seasonId: season.id,
      familyMemberId: member.id,
      registeredByUserId: user.id,
      status: "pending",
      paymentStatus: "unpaid",
      amountPaidCents: 0,
      amountDueCents: opts.amountDueCents,
      registrationType: "full",
      waiverSigned: true,
      waiverSignedAt: new Date(),
      waiverSignedBy: "Pat Parent",
    })
    .returning();

  return { registrationId: registration.id, userId: user.id };
}

describe("handlePaymentFailed", () => {
  beforeEach(() => vi.restoreAllMocks());

  it("sets payment_status = failed", async () => {
    const db = getDb();
    vi.spyOn(emailModule, "sendPaymentFailedEmail").mockResolvedValue({ success: true } as never);
    const { registrationId } = await seedPendingRegistration({ amountDueCents: 12000 });

    const result = await handlePaymentFailed(makeFailedPaymentIntent(registrationId));

    expect(result.status).toBe("processed");
    const [reg] = await db.select().from(registrations).where(eq(registrations.id, registrationId));
    expect(reg.paymentStatus).toBe("failed");
  });

  it("emails a password user a direct pay-balance retry link", async () => {
    const spy = vi
      .spyOn(emailModule, "sendPaymentFailedEmail")
      .mockResolvedValue({ success: true } as never);
    const { registrationId } = await seedPendingRegistration({ amountDueCents: 12000, passwordHash: "x" });

    await handlePaymentFailed(makeFailedPaymentIntent(registrationId));

    const retryUrl = spy.mock.calls[0][0].retryUrl;
    expect(retryUrl).toContain(`/dashboard/registrations/${registrationId}/pay-balance`);
    expect(retryUrl).not.toContain("?retry=");
  });

  it("emails a guest a magic-link retry (not a bare dashboard bounce)", async () => {
    const spy = vi
      .spyOn(emailModule, "sendPaymentFailedEmail")
      .mockResolvedValue({ success: true } as never);
    const { registrationId } = await seedPendingRegistration({ amountDueCents: 12000, passwordHash: null });

    await handlePaymentFailed(makeFailedPaymentIntent(registrationId));

    const retryUrl = spy.mock.calls[0][0].retryUrl;
    // buildMagicLinkUrl → `<origin>/m/<token>`; the pay-balance path rides
    // inside the token's redirectTo, so the URL itself is the magic path.
    expect(retryUrl).toContain("/m/");
    expect(retryUrl).not.toContain("?retry=");
  });

  it("does not downgrade an already-paid registration", async () => {
    const db = getDb();
    const { registrationId } = await seedPendingRegistration({ amountDueCents: 12000 });
    await db
      .update(registrations)
      .set({ paymentStatus: "paid", status: "confirmed" })
      .where(eq(registrations.id, registrationId));

    const result = await handlePaymentFailed(makeFailedPaymentIntent(registrationId));

    expect(result.status).toBe("skipped");
    const [reg] = await db.select().from(registrations).where(eq(registrations.id, registrationId));
    expect(reg.paymentStatus).toBe("paid");
  });
});
