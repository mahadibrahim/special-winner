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
import { handleChargeRefunded } from "@/lib/stripe/handle-charge-refunded";

/**
 * Build a fake Stripe Charge object for testing charge.refunded handling.
 * Only the fields that handleChargeRefunded reads are populated.
 */
function makeChargeRefunded(opts: {
  paymentIntentId: string;
  amount: number;
  amountRefunded: number;
}): Stripe.Charge {
  return {
    id: `ch_test_${Math.random().toString(36).slice(2)}`,
    object: "charge",
    payment_intent: opts.paymentIntentId,
    amount: opts.amount,
    amount_refunded: opts.amountRefunded,
    refunded: opts.amountRefunded >= opts.amount,
  } as unknown as Stripe.Charge;
}

/**
 * Seed the minimum row graph needed to exercise handleChargeRefunded.
 * Creates org → user → sport → location → program → season → familyMember
 * → registration (paid) → payment (with stripePaymentIntentId).
 * Returns registrationId and paymentIntentId for assertions.
 */
async function seedPaidRegistration(
  amountPaidCents: number,
): Promise<{ registrationId: string; paymentIntentId: string; userId: string }> {
  const db = getDb();
  const suffix = Math.random().toString(36).slice(2, 10);
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

  await db.insert(payments).values({
    registrationId: registration.id,
    userId: user.id,
    amountCents: amountPaidCents,
    paymentType: "full",
    status: "succeeded",
    stripePaymentIntentId: paymentIntentId,
  });

  return { registrationId: registration.id, paymentIntentId, userId: user.id };
}

describe("handleChargeRefunded", () => {
  beforeEach(() => vi.restoreAllMocks());

  it("marks a registration fully refunded and emails the parent", async () => {
    const spy = vi
      .spyOn(emailModule, "sendRefundNotificationEmail")
      .mockResolvedValue({ success: true });
    const { registrationId, paymentIntentId } = await seedPaidRegistration(17500);

    const result = await handleChargeRefunded(
      makeChargeRefunded({ paymentIntentId, amount: 17500, amountRefunded: 17500 }),
    );

    expect(result.status).toBe("processed");
    const [reg] = await getDb()
      .select()
      .from(registrations)
      .where(eq(registrations.id, registrationId));
    expect(reg.paymentStatus).toBe("refunded");
    expect(reg.status).toBe("refunded");
    expect(reg.refundStatus).toBe("processed");
    expect(reg.refundAmountCents).toBe(17500);
    expect(spy).toHaveBeenCalledOnce();

    // Fix 4: assert payments row is also marked refunded
    const [pmt] = await getDb()
      .select()
      .from(payments)
      .where(eq(payments.registrationId, registrationId));
    expect(pmt.status).toBe("refunded");
  });

  it("marks a partial refund without cancelling the registration", async () => {
    vi.spyOn(emailModule, "sendRefundNotificationEmail").mockResolvedValue({
      success: true,
    });
    const { registrationId, paymentIntentId } = await seedPaidRegistration(17500);

    await handleChargeRefunded(
      makeChargeRefunded({ paymentIntentId, amount: 17500, amountRefunded: 5000 }),
    );

    const [reg] = await getDb()
      .select()
      .from(registrations)
      .where(eq(registrations.id, registrationId));
    expect(reg.paymentStatus).toBe("partial_refund");
    expect(reg.status).not.toBe("refunded");
    expect(reg.refundAmountCents).toBe(5000);
    // Fix 3: assert recomputed amountPaidCents after partial refund
    expect(reg.amountPaidCents).toBe(12500);
  });

  it("skips when no payment matches the payment intent", async () => {
    const result = await handleChargeRefunded(
      makeChargeRefunded({
        paymentIntentId: "pi_nonexistent",
        amount: 100,
        amountRefunded: 100,
      }),
    );
    expect(result.status).toBe("skipped");
  });

  // Fix 5: idempotent re-delivery — a second webhook for the same charge must
  // not fire a second email.
  it("is idempotent on re-delivery — email fires only once", async () => {
    const spy = vi
      .spyOn(emailModule, "sendRefundNotificationEmail")
      .mockResolvedValue({ success: true });
    const { paymentIntentId } = await seedPaidRegistration(17500);
    const charge = makeChargeRefunded({
      paymentIntentId,
      amount: 17500,
      amountRefunded: 17500,
    });

    const first = await handleChargeRefunded(charge);
    const second = await handleChargeRefunded(charge);

    expect(first.status).toBe("processed");
    expect(second.status).toBe("processed");
    // Email must have been sent exactly once despite two deliveries.
    expect(spy).toHaveBeenCalledTimes(1);
  });
});
