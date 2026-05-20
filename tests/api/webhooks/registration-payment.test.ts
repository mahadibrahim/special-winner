import { describe, it, expect, beforeEach } from "vitest";
import { vi } from "vitest";
import { eq } from "drizzle-orm";
import type Stripe from "stripe";
import { getDb } from "@/lib/db";
import * as emailModule from "@/lib/email/send";
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
import { handleRegistrationPaymentSucceeded } from "@/lib/stripe/handle-registration-payment-succeeded";

/**
 * Build a realistic fake registration PaymentIntent. Registration runs on
 * Stripe PaymentIntents (not Checkout Sessions) — `payment_intent.succeeded`
 * with metadata.type "registration_payment" is what finalizes a
 * registration. Only the small subset of fields the handler reads is set.
 */
function makeRegistrationPaymentIntent(overrides: {
  paymentIntentId: string;
  registrationId: string;
  amountReceived: number;
  receiptEmail?: string;
}): Stripe.PaymentIntent {
  return {
    id: overrides.paymentIntentId,
    object: "payment_intent",
    amount: overrides.amountReceived,
    amount_received: overrides.amountReceived,
    currency: "usd",
    status: "succeeded",
    receipt_email: overrides.receiptEmail ?? "pat@test.example",
    metadata: {
      registrationId: overrides.registrationId,
      type: "registration_payment",
    },
  } as unknown as Stripe.PaymentIntent;
}

/**
 * Seed the minimum row graph needed to exercise
 * handleRegistrationPaymentSucceeded. Returns the registration id so tests
 * can assert on state transitions.
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

describe("handleRegistrationPaymentSucceeded", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("confirms the registration and records the payment on success", async () => {
    const db = getDb();
    const { registrationId } = await seedPendingRegistration({
      amountDueCents: 12500,
    });

    const result = await handleRegistrationPaymentSucceeded(
      makeRegistrationPaymentIntent({
        paymentIntentId: `pi_test_${Math.random().toString(36).slice(2)}`,
        registrationId,
        amountReceived: 12500,
      }),
    );

    expect(result.status).toBe("processed");

    const [reg] = await db
      .select()
      .from(registrations)
      .where(eq(registrations.id, registrationId));

    expect(reg.status).toBe("confirmed");
    expect(reg.paymentStatus).toBe("paid");
    expect(reg.amountPaidCents).toBe(12500);
    expect(reg.amountDueCents).toBe(0);

    const paymentRows = await db
      .select()
      .from(payments)
      .where(eq(payments.registrationId, registrationId));

    expect(paymentRows).toHaveLength(1);
    expect(paymentRows[0].amountCents).toBe(12500);
    expect(paymentRows[0].status).toBe("succeeded");
  });

  it("skips non-registration payments", async () => {
    const paymentIntent = {
      id: "pi_test_nonreg",
      metadata: { type: "something_else" },
    } as unknown as Stripe.PaymentIntent;
    const result = await handleRegistrationPaymentSucceeded(paymentIntent);
    expect(result.status).toBe("skipped");
  });

  it("is idempotent when the same payment intent is delivered twice", async () => {
    const db = getDb();
    const { registrationId } = await seedPendingRegistration({
      amountDueCents: 10000,
    });

    const paymentIntent = makeRegistrationPaymentIntent({
      paymentIntentId: `pi_test_idem_${Math.random().toString(36).slice(2)}`,
      registrationId,
      amountReceived: 10000,
    });

    const first = await handleRegistrationPaymentSucceeded(paymentIntent);
    const second = await handleRegistrationPaymentSucceeded(paymentIntent);

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

  it("flips to deposit_paid when the amount paid is a partial payment", async () => {
    const db = getDb();
    const { registrationId } = await seedPendingRegistration({
      amountDueCents: 20000,
      registrationType: "deposit",
    });

    const result = await handleRegistrationPaymentSucceeded(
      makeRegistrationPaymentIntent({
        paymentIntentId: `pi_test_dep_${Math.random().toString(36).slice(2)}`,
        registrationId,
        amountReceived: 5000,
      }),
    );

    expect(result.status).toBe("processed");

    const [reg] = await db
      .select()
      .from(registrations)
      .where(eq(registrations.id, registrationId));

    expect(reg.status).toBe("confirmed");
    expect(reg.paymentStatus).toBe("deposit_paid");
    expect(reg.amountPaidCents).toBe(5000);
    expect(reg.amountDueCents).toBe(15000);

    const paymentRows = await db
      .select()
      .from(payments)
      .where(eq(payments.registrationId, registrationId));

    expect(paymentRows).toHaveLength(1);
    expect(paymentRows[0].amountCents).toBe(5000);
    expect(paymentRows[0].paymentType).toBe("deposit");
  });

  it("sends the registration confirmation email on successful payment", async () => {
    const spy = vi
      .spyOn(emailModule, "sendRegistrationConfirmationEmail")
      .mockResolvedValue({ success: true } as never);

    const { registrationId } = await seedPendingRegistration({
      amountDueCents: 7500,
    });

    await handleRegistrationPaymentSucceeded(
      makeRegistrationPaymentIntent({
        paymentIntentId: `pi_test_email_${Math.random().toString(36).slice(2)}`,
        registrationId,
        amountReceived: 7500,
      }),
    );

    expect(spy).toHaveBeenCalledTimes(1);
    const args = spy.mock.calls[0][0];
    expect(args.registrationId).toBe(registrationId);
    expect(args.paymentStatus).toBe("paid");
    expect(args.registrationStatus).toBe("confirmed");
  });

  it("does NOT re-send the email on duplicate webhook delivery", async () => {
    const spy = vi
      .spyOn(emailModule, "sendRegistrationConfirmationEmail")
      .mockResolvedValue({ success: true } as never);

    const { registrationId } = await seedPendingRegistration({
      amountDueCents: 5000,
    });
    const paymentIntent = makeRegistrationPaymentIntent({
      paymentIntentId: `pi_test_nodup_${Math.random().toString(36).slice(2)}`,
      registrationId,
      amountReceived: 5000,
    });

    await handleRegistrationPaymentSucceeded(paymentIntent);
    await handleRegistrationPaymentSucceeded(paymentIntent);

    expect(spy).toHaveBeenCalledTimes(1);
  });
});
