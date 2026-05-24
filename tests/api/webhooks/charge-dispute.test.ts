import { describe, it, expect, vi, beforeEach } from "vitest";
import { eq } from "drizzle-orm";
import type Stripe from "stripe";
import { getDb } from "@/lib/db";
import {
  registrations,
  payments,
  familyMembers,
  seasons,
  programs,
  sports,
  locations,
  organizations,
  users,
} from "@/lib/db/schema";
import * as emailModule from "@/lib/email/send";
import { handleChargeDispute } from "@/lib/stripe/handle-charge-dispute";

/**
 * Minimal Stripe.Dispute factory. Only the fields the handler reads
 * are populated; the rest are cast through `unknown` rather than
 * shoehorning every required Stripe field into a test fixture.
 */
function makeDispute(opts: {
  chargeId: string;
  disputeId: string;
  status: Stripe.Dispute.Status;
  reason: string;
  amount: number;
  evidenceDueByUnix?: number;
}): Stripe.Dispute {
  return {
    id: opts.disputeId,
    object: "dispute",
    charge: opts.chargeId,
    status: opts.status,
    reason: opts.reason,
    amount: opts.amount,
    currency: "usd",
    evidence_details: opts.evidenceDueByUnix
      ? { due_by: opts.evidenceDueByUnix }
      : undefined,
  } as unknown as Stripe.Dispute;
}

/**
 * Seed the minimum row graph: org → user → sport → location → program →
 * season → familyMember → registration (paid) → payment (with both
 * stripePaymentIntentId AND stripeChargeId so dispute lookup works).
 *
 * Mirrors `seedPaidRegistration` in charge-refunded.test.ts with the
 * `stripeChargeId` addition. Inlined per the per-feature-plan rule —
 * the two test files are independent; factoring the helper waits until
 * a third Stripe-event test shows up.
 */
async function seedPaidRegistrationWithCharge(amountPaidCents: number): Promise<{
  registrationId: string;
  paymentId: string;
  chargeId: string;
  paymentIntentId: string;
}> {
  const db = getDb();
  const suffix = Math.random().toString(36).slice(2, 10);
  const chargeId = `ch_test_${suffix}`;
  const paymentIntentId = `pi_test_${suffix}`;

  const [org] = await db
    .insert(organizations)
    .values({
      name: `Org ${suffix}`,
      slug: `org-${suffix}`,
      organizationType: "headquarters",
    })
    .returning();

  const [user] = await db
    .insert(users)
    .values({
      email: `parent-${suffix}@test.example`,
      passwordHash: "x",
      firstName: "Pat",
      lastName: "Parent",
    })
    .returning();

  const [sport] = await db
    .insert(sports)
    .values({
      name: `Sport ${suffix}`,
      slug: `sport-${suffix}`,
      organizationId: org.id,
    })
    .returning();

  const [location] = await db
    .insert(locations)
    .values({
      name: `Loc ${suffix}`,
      slug: `loc-${suffix}`,
      organizationId: org.id,
    })
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
      priceCents: amountPaidCents,
      status: "open",
    })
    .returning();

  const [member] = await db
    .insert(familyMembers)
    .values({
      parentUserId: user.id,
      firstName: "Kid",
      lastName: "Player",
      birthDate: "2015-01-01",
    })
    .returning();

  const [registration] = await db
    .insert(registrations)
    .values({
      seasonId: season.id,
      familyMemberId: member.id,
      registeredByUserId: user.id,
      status: "confirmed",
      paymentStatus: "paid",
      amountPaidCents,
      amountDueCents: 0,
      registrationType: "full",
      waiverSigned: true,
      waiverSignedAt: new Date(),
      waiverSignedBy: "Pat Parent",
    })
    .returning();

  const [payment] = await db
    .insert(payments)
    .values({
      registrationId: registration.id,
      userId: user.id,
      amountCents: amountPaidCents,
      paymentType: "full",
      status: "succeeded",
      stripePaymentIntentId: paymentIntentId,
      stripeChargeId: chargeId,
    })
    .returning();

  return {
    registrationId: registration.id,
    paymentId: payment.id,
    chargeId,
    paymentIntentId,
  };
}

describe("handleChargeDispute", () => {
  beforeEach(() => vi.restoreAllMocks());

  it("records dispute.created and sends a founder alert email", async () => {
    const spy = vi
      .spyOn(emailModule, "sendDisputeAlertEmail")
      .mockResolvedValue({ success: true });
    const { paymentId, chargeId } = await seedPaidRegistrationWithCharge(17500);
    const dispute = makeDispute({
      chargeId,
      disputeId: `dp_test_${Math.random().toString(36).slice(2)}`,
      status: "needs_response",
      reason: "fraudulent",
      amount: 17500,
    });

    const result = await handleChargeDispute(dispute, "charge.dispute.created");

    expect(result.status).toBe("processed");
    const [p] = await getDb()
      .select()
      .from(payments)
      .where(eq(payments.id, paymentId));
    expect(p.stripeDisputeId).toBe(dispute.id);
    expect(p.disputeStatus).toBe("needs_response");
    expect(p.disputeReasonCode).toBe("fraudulent");
    expect(spy).toHaveBeenCalledOnce();
  });

  it("updates state on funds_withdrawn without sending a second email", async () => {
    const spy = vi
      .spyOn(emailModule, "sendDisputeAlertEmail")
      .mockResolvedValue({ success: true });
    const { paymentId, chargeId } = await seedPaidRegistrationWithCharge(17500);
    const disputeId = `dp_test_${Math.random().toString(36).slice(2)}`;
    // Simulate dispute.created already processed.
    await getDb()
      .update(payments)
      .set({
        stripeDisputeId: disputeId,
        disputeStatus: "needs_response",
        disputeReasonCode: "fraudulent",
      })
      .where(eq(payments.id, paymentId));

    const dispute = makeDispute({
      chargeId,
      disputeId,
      status: "under_review",
      reason: "fraudulent",
      amount: 17500,
    });
    const result = await handleChargeDispute(
      dispute,
      "charge.dispute.funds_withdrawn",
    );

    expect(result.status).toBe("processed");
    const [p] = await getDb()
      .select()
      .from(payments)
      .where(eq(payments.id, paymentId));
    expect(p.disputeStatus).toBe("under_review");
    expect(spy).not.toHaveBeenCalled();
  });

  it("updates state on dispute.closed without a second alert email", async () => {
    const spy = vi
      .spyOn(emailModule, "sendDisputeAlertEmail")
      .mockResolvedValue({ success: true });
    const { paymentId, chargeId } = await seedPaidRegistrationWithCharge(17500);
    const disputeId = `dp_test_${Math.random().toString(36).slice(2)}`;
    await getDb()
      .update(payments)
      .set({
        stripeDisputeId: disputeId,
        disputeStatus: "under_review",
        disputeReasonCode: "fraudulent",
      })
      .where(eq(payments.id, paymentId));

    const dispute = makeDispute({
      chargeId,
      disputeId,
      status: "won",
      reason: "fraudulent",
      amount: 17500,
    });
    await handleChargeDispute(dispute, "charge.dispute.closed");

    const [p] = await getDb()
      .select()
      .from(payments)
      .where(eq(payments.id, paymentId));
    expect(p.disputeStatus).toBe("won");
    expect(spy).not.toHaveBeenCalled();
  });

  it("skips when no payment matches the charge id", async () => {
    const dispute = makeDispute({
      chargeId: "ch_nonexistent_xyz",
      disputeId: "dp_test_skip",
      status: "needs_response",
      reason: "duplicate",
      amount: 100,
    });
    const result = await handleChargeDispute(dispute, "charge.dispute.created");
    expect(result.status).toBe("skipped");
  });
});
