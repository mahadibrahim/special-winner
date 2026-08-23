import { describe, it, expect } from "vitest";
import { eq, and } from "drizzle-orm";
import { getDb } from "@/lib/db";
import {
  membershipTiers,
  memberships,
  discountCodes,
  discountUsages,
  registrations,
} from "@/lib/db/schema";
import { createCheckoutForRegistration } from "@/lib/payments/create-checkout-for-registration";
import { seedPaidRegistration } from "../../utils/registration-context";

// Gate on Stripe being configured, same pattern as the other
// createCheckoutForRegistration test files — isStripeConfigured() is
// checked unconditionally up front (step 1), even for paths that never
// actually call the Stripe API.
const stripeConfigured = Boolean(process.env.STRIPE_SECRET_KEY);
const itWithStripe = stripeConfigured ? it : it.skip;

/** Seeds a membership tier with the given benefits, then a membership row
 *  for the given child (familyMemberId) in that tier/org. Returns the tier
 *  id for cleanup/inspection. */
async function seedChildMembership(
  organizationId: string,
  userId: string,
  familyMemberId: string,
  benefits: Record<string, unknown>,
  status: "active" | "paused" | "past_due" | "cancelled" | "incomplete" = "active",
) {
  const db = getDb();
  const [tier] = await db
    .insert(membershipTiers)
    .values({
      organizationId,
      name: "Test Camp Tier",
      monthlyPriceCents: 2999,
      benefits,
    })
    .returning();

  await db.insert(memberships).values({
    userId,
    familyMemberId,
    organizationId,
    tierId: tier.id,
    status,
    billingInterval: "month",
  });

  return tier.id;
}

describe("createCheckoutForRegistration — member camp discount", () => {
  itWithStripe(
    "member child + camp season: memberDiscountCents applied, reduces the Stripe session amount",
    async () => {
      const { registrationId, organizationId, userId, familyMemberId } =
        await seedPaidRegistration(0, {
          amountDueCents: 20000,
          paymentStatus: "unpaid",
          status: "pending",
          programType: "camp",
        });
      await seedChildMembership(organizationId, userId, familyMemberId, {
        camp_discount_pct: 10,
      });

      const result = await createCheckoutForRegistration({
        db: getDb(),
        registrationId,
        userId,
        baseUrl: "http://localhost:4321",
      });

      expect(result.kind).toBe("stripe_session");
      if (result.kind !== "stripe_session") return;
      expect(result.memberDiscountCents).toBe(2000); // 10% of 20000
      expect(result.memberDiscountPct).toBe(10);
    },
  );

  itWithStripe(
    "non-member child + camp season: no member discount",
    async () => {
      const { registrationId, userId } = await seedPaidRegistration(0, {
        amountDueCents: 20000,
        paymentStatus: "unpaid",
        status: "pending",
        programType: "camp",
      });
      // No membership row seeded for this child.

      const result = await createCheckoutForRegistration({
        db: getDb(),
        registrationId,
        userId,
        baseUrl: "http://localhost:4321",
      });

      expect(result.kind).toBe("stripe_session");
      if (result.kind !== "stripe_session") return;
      expect(result.memberDiscountCents).toBe(0);
    },
  );

  itWithStripe(
    "member with a non-active status (paused) + camp season: no member discount",
    async () => {
      const { registrationId, organizationId, userId, familyMemberId } =
        await seedPaidRegistration(0, {
          amountDueCents: 20000,
          paymentStatus: "unpaid",
          status: "pending",
          programType: "camp",
        });
      await seedChildMembership(
        organizationId,
        userId,
        familyMemberId,
        { camp_discount_pct: 10 },
        "paused",
      );

      const result = await createCheckoutForRegistration({
        db: getDb(),
        registrationId,
        userId,
        baseUrl: "http://localhost:4321",
      });

      expect(result.kind).toBe("stripe_session");
      if (result.kind !== "stripe_session") return;
      expect(result.memberDiscountCents).toBe(0);
    },
  );

  itWithStripe(
    "member child + non-camp (league) season: no member discount",
    async () => {
      const { registrationId, organizationId, userId, familyMemberId } =
        await seedPaidRegistration(0, {
          amountDueCents: 20000,
          paymentStatus: "unpaid",
          status: "pending",
          // programType omitted — defaults to "league"
        });
      await seedChildMembership(organizationId, userId, familyMemberId, {
        camp_discount_pct: 10,
      });

      const result = await createCheckoutForRegistration({
        db: getDb(),
        registrationId,
        userId,
        baseUrl: "http://localhost:4321",
      });

      expect(result.kind).toBe("stripe_session");
      if (result.kind !== "stripe_session") return;
      expect(result.memberDiscountCents).toBe(0);
    },
  );

  itWithStripe(
    "member child + a discount code LARGER than the member discount: code wins, is redeemed, member discount is zeroed",
    async () => {
      const { registrationId, organizationId, userId, familyMemberId, seasonId } =
        await seedPaidRegistration(0, {
          amountDueCents: 20000,
          paymentStatus: "unpaid",
          status: "pending",
          programType: "camp",
        });
      await seedChildMembership(organizationId, userId, familyMemberId, {
        camp_discount_pct: 10, // 2000c on a 20000c due
      });

      const db = getDb();
      // Stored uppercase to match create-checkout-for-registration's lookup
      // (`eq(discountCodes.code, discountCode.toUpperCase())`).
      const suffix = Math.random().toString(36).slice(2, 8).toUpperCase();
      const code = `BIG20-${suffix}`;
      const [discount] = await db
        .insert(discountCodes)
        .values({
          organizationId,
          code,
          discountType: "percentage",
          discountValue: 2000, // 20% — larger than the 10% member discount
          seasonId,
        })
        .returning();

      const result = await createCheckoutForRegistration({
        db,
        registrationId,
        userId,
        baseUrl: "http://localhost:4321",
        discountCode: code,
      });

      expect(result.kind).toBe("stripe_session");
      if (result.kind !== "stripe_session") return;
      expect(result.memberDiscountCents).toBe(0);

      const [usage] = await db
        .select()
        .from(discountUsages)
        .where(
          and(
            eq(discountUsages.discountCodeId, discount.id),
            eq(discountUsages.registrationId, registrationId),
          ),
        );
      expect(usage).toBeDefined();
      expect(usage.discountAmountCents).toBe(4000); // 20% of 20000

      const [updatedCode] = await db
        .select()
        .from(discountCodes)
        .where(eq(discountCodes.id, discount.id));
      expect(updatedCode.usedCount).toBe(1);
    },
  );

  itWithStripe(
    "member child + a discount code SMALLER than the member discount: code is NOT redeemed, member discount applies",
    async () => {
      const { registrationId, organizationId, userId, familyMemberId, seasonId } =
        await seedPaidRegistration(0, {
          amountDueCents: 20000,
          paymentStatus: "unpaid",
          status: "pending",
          programType: "camp",
        });
      await seedChildMembership(organizationId, userId, familyMemberId, {
        camp_discount_pct: 10, // 2000c on a 20000c due
      });

      const db = getDb();
      const suffix = Math.random().toString(36).slice(2, 8).toUpperCase();
      const code = `SMALL5-${suffix}`;
      const [discount] = await db
        .insert(discountCodes)
        .values({
          organizationId,
          code,
          discountType: "percentage",
          discountValue: 500, // 5% — smaller than the 10% member discount
          seasonId,
        })
        .returning();

      const result = await createCheckoutForRegistration({
        db,
        registrationId,
        userId,
        baseUrl: "http://localhost:4321",
        discountCode: code,
      });

      expect(result.kind).toBe("stripe_session");
      if (result.kind !== "stripe_session") return;
      expect(result.memberDiscountCents).toBe(2000); // member discount wins

      const usages = await db
        .select()
        .from(discountUsages)
        .where(eq(discountUsages.discountCodeId, discount.id));
      expect(usages).toHaveLength(0); // losing code is never redeemed

      const [updatedCode] = await db
        .select()
        .from(discountCodes)
        .where(eq(discountCodes.id, discount.id));
      expect(updatedCode.usedCount).toBe(0);
    },
  );

  // --- Regression: the discount must never compound across repeated
  // createCheckoutForRegistration calls. The function persists the reduced
  // amountDueCents, and the same registration re-enters checkout creation on
  // wizard resume (POST /api/registrations kind:"resumed"), the dashboard
  // pay-balance form, and guest retry. Before the marker column, the second
  // pass re-applied 10% to the already-reduced total (17910 → 16119).
  itWithStripe(
    "resumed checkout does NOT re-apply the member discount (no compounding)",
    async () => {
      const { registrationId, organizationId, userId, familyMemberId } =
        await seedPaidRegistration(0, {
          amountDueCents: 19900,
          paymentStatus: "unpaid",
          status: "pending",
          programType: "camp",
        });
      await seedChildMembership(organizationId, userId, familyMemberId, {
        camp_discount_pct: 10,
      });

      const db = getDb();
      const first = await createCheckoutForRegistration({
        db,
        registrationId,
        userId,
        baseUrl: "http://localhost:4321",
      });
      expect(first.kind).toBe("stripe_session");
      if (first.kind !== "stripe_session") return;
      expect(first.memberDiscountCents).toBe(1990); // 10% of 19900

      const [afterFirst] = await db
        .select()
        .from(registrations)
        .where(eq(registrations.id, registrationId));
      expect(afterFirst.amountDueCents).toBe(17910);
      expect(afterFirst.memberDiscountCentsApplied).toBe(1990);

      // Resume: same registration, second checkout creation.
      const second = await createCheckoutForRegistration({
        db,
        registrationId,
        userId,
        baseUrl: "http://localhost:4321",
      });
      expect(second.kind).toBe("stripe_session");
      if (second.kind !== "stripe_session") return;
      expect(second.memberDiscountCents).toBe(0);
      // Same charge total as the first pass (surcharge is derived from the
      // amount, so equal surcharges means equal amounts).
      expect(second.surchargeCents).toBe(first.surchargeCents);

      const [afterSecond] = await db
        .select()
        .from(registrations)
        .where(eq(registrations.id, registrationId));
      expect(afterSecond.amountDueCents).toBe(17910); // NOT 16119
      expect(afterSecond.memberDiscountCentsApplied).toBe(1990);
    },
  );

  itWithStripe(
    "a code that already won is not stacked with the member discount on resume",
    async () => {
      const { registrationId, organizationId, userId, familyMemberId, seasonId } =
        await seedPaidRegistration(0, {
          amountDueCents: 20000,
          paymentStatus: "unpaid",
          status: "pending",
          programType: "camp",
        });
      await seedChildMembership(organizationId, userId, familyMemberId, {
        camp_discount_pct: 10, // 2000c — loses to the 20% code below
      });

      const db = getDb();
      const suffix = Math.random().toString(36).slice(2, 8).toUpperCase();
      const code = `RESUME20-${suffix}`;
      await db.insert(discountCodes).values({
        organizationId,
        code,
        discountType: "percentage",
        discountValue: 2000, // 20% of 20000 = 4000c
        seasonId,
      });

      const first = await createCheckoutForRegistration({
        db,
        registrationId,
        userId,
        baseUrl: "http://localhost:4321",
        discountCode: code,
      });
      expect(first.kind).toBe("stripe_session");
      if (first.kind !== "stripe_session") return;
      expect(first.memberDiscountCents).toBe(0); // code won

      const [afterFirst] = await db
        .select()
        .from(registrations)
        .where(eq(registrations.id, registrationId));
      expect(afterFirst.amountDueCents).toBe(16000);

      // Resume without the code: the redeemed usage row already reduced the
      // stored total, so the member discount must NOT land on top of it.
      const second = await createCheckoutForRegistration({
        db,
        registrationId,
        userId,
        baseUrl: "http://localhost:4321",
      });
      expect(second.kind).toBe("stripe_session");
      if (second.kind !== "stripe_session") return;
      expect(second.memberDiscountCents).toBe(0);

      const [afterSecond] = await db
        .select()
        .from(registrations)
        .where(eq(registrations.id, registrationId));
      expect(afterSecond.amountDueCents).toBe(16000); // NOT 14400
      expect(afterSecond.memberDiscountCentsApplied).toBeNull();
    },
  );
});
