import { describe, it, expect } from "vitest";
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
import { handleCheckoutComplete } from "@/lib/stripe/handle-checkout-complete";

/**
 * Build a realistic fake Checkout Session. Fields we assert on are always
 * present; unused fields are set to unsafe casts since our handler only reads
 * a small subset.
 */
function makeCheckoutSession(overrides: {
  sessionId: string;
  paymentIntentId: string;
  registrationId: string;
  amountTotal: number;
  customerEmail: string;
}): Stripe.Checkout.Session {
  return {
    id: overrides.sessionId,
    object: "checkout.session",
    amount_total: overrides.amountTotal,
    currency: "usd",
    customer_email: overrides.customerEmail,
    payment_intent: overrides.paymentIntentId,
    metadata: {
      registrationId: overrides.registrationId,
      type: "registration_payment",
    },
    payment_status: "paid",
    status: "complete",
    mode: "payment",
  } as unknown as Stripe.Checkout.Session;
}

/**
 * Seed the minimum row graph needed to exercise handleCheckoutComplete. Returns
 * the registration id so tests can assert on state transitions.
 */
async function seedPendingRegistration(opts: {
  amountDueCents: number;
  registrationType?: "full" | "deposit";
}): Promise<{ registrationId: string; userId: string }> {
  const db = getDb();
  const suffix = Math.random().toString(36).slice(2, 10);

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
      priceCents: opts.amountDueCents,
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
      status: "pending",
      paymentStatus: "unpaid",
      amountPaidCents: 0,
      amountDueCents: opts.amountDueCents,
      registrationType: opts.registrationType ?? "full",
      waiverSigned: true,
      waiverSignedAt: new Date(),
      waiverSignedBy: "Pat Parent",
    })
    .returning();

  return { registrationId: registration.id, userId: user.id };
}

describe("handleCheckoutComplete", () => {
  it("confirms the registration and records the payment on success", async () => {
    const db = getDb();
    const { registrationId } = await seedPendingRegistration({
      amountDueCents: 12500,
    });

    const result = await handleCheckoutComplete(
      makeCheckoutSession({
        sessionId: `cs_test_${Math.random().toString(36).slice(2)}`,
        paymentIntentId: `pi_test_${Math.random().toString(36).slice(2)}`,
        registrationId,
        amountTotal: 12500,
        customerEmail: "pat@test.example",
      })
    );

    expect(result.status).toBe("processed");

    const [reg] = await db
      .select()
      .from(registrations)
      .where(eq(registrations.id, registrationId));

    expect(reg.status).toBe("confirmed");
    expect(reg.paymentStatus).toBe("paid");
    expect(reg.amountPaidCents).toBe(12500);

    const paymentRows = await db
      .select()
      .from(payments)
      .where(eq(payments.registrationId, registrationId));

    expect(paymentRows).toHaveLength(1);
    expect(paymentRows[0].amountCents).toBe(12500);
    expect(paymentRows[0].status).toBe("succeeded");
  });

  it("skips non-registration payments", async () => {
    const session = {
      id: "cs_test_nonreg",
      metadata: { type: "something_else" },
    } as unknown as Stripe.Checkout.Session;
    const result = await handleCheckoutComplete(session);
    expect(result.status).toBe("skipped");
  });

  it("is idempotent when the same checkout session is delivered twice", async () => {
    const db = getDb();
    const { registrationId } = await seedPendingRegistration({
      amountDueCents: 10000,
    });

    const session = makeCheckoutSession({
      sessionId: `cs_test_idem_${Math.random().toString(36).slice(2)}`,
      paymentIntentId: `pi_test_idem_${Math.random().toString(36).slice(2)}`,
      registrationId,
      amountTotal: 10000,
      customerEmail: "pat@test.example",
    });

    const first = await handleCheckoutComplete(session);
    const second = await handleCheckoutComplete(session);

    expect(first.status).toBe("processed");
    expect(second.status).toBe("skipped");

    const [reg] = await db
      .select()
      .from(registrations)
      .where(eq(registrations.id, registrationId));
    // Must NOT have double-counted the payment.
    expect(reg.amountPaidCents).toBe(10000);

    const paymentRows = await db
      .select()
      .from(payments)
      .where(eq(payments.registrationId, registrationId));
    expect(paymentRows).toHaveLength(1);
  });
});
