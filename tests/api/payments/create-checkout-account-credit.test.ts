import { describe, it, expect } from "vitest";
import { getDb } from "@/lib/db";
import { createCheckoutForRegistration } from "@/lib/payments/create-checkout-for-registration";
import { issueAccountCredit, getAccountCreditBalanceCents } from "@/lib/payments/account-credit";
import { seedPaidRegistration } from "../../utils/registration-context";

// Gate on Stripe being configured, same pattern as
// tests/api/payments-create-checkout.test.ts — createCheckoutForRegistration
// checks isStripeConfigured() unconditionally up front (step 1), even for
// the paid_zero path which never actually calls the Stripe API.
const stripeConfigured = Boolean(process.env.STRIPE_SECRET_KEY);
const itWithStripe = stripeConfigured ? it : it.skip;

describe("createCheckoutForRegistration — applyAccountCredit", () => {
  itWithStripe(
    "full-cover: credit >= amountDue takes the paid_zero path, no Stripe session, credit redeemed",
    async () => {
      const { registrationId, organizationId, userId } = await seedPaidRegistration(0, {
        amountDueCents: 5000,
        paymentStatus: "unpaid",
        status: "pending",
      });
      await issueAccountCredit({ userId, organizationId, amountCents: 5000 });

      const result = await createCheckoutForRegistration({
        db: getDb(),
        registrationId,
        userId,
        baseUrl: "http://localhost:4321",
        applyAccountCredit: true,
      });

      expect(result.kind).toBe("paid_zero");
      expect(result.creditAppliedCents).toBe(5000);

      const balance = await getAccountCreditBalanceCents(userId, organizationId);
      expect(balance).toBe(0);
    },
  );

  itWithStripe(
    "partial: credit less than amountDue reduces the Stripe session amount and reports creditAppliedCents",
    async () => {
      const { registrationId, organizationId, userId } = await seedPaidRegistration(0, {
        amountDueCents: 10000,
        paymentStatus: "unpaid",
        status: "pending",
      });
      await issueAccountCredit({ userId, organizationId, amountCents: 3000 });

      const result = await createCheckoutForRegistration({
        db: getDb(),
        registrationId,
        userId,
        baseUrl: "http://localhost:4321",
        applyAccountCredit: true,
      });

      expect(result.kind).toBe("stripe_session");
      if (result.kind !== "stripe_session") return;
      expect(result.creditAppliedCents).toBe(3000);

      const balance = await getAccountCreditBalanceCents(userId, organizationId);
      expect(balance).toBe(0);
    },
  );

  itWithStripe(
    "caps applied credit at amountDue — over-apply guard",
    async () => {
      const { registrationId, organizationId, userId } = await seedPaidRegistration(0, {
        amountDueCents: 2000,
        paymentStatus: "unpaid",
        status: "pending",
      });
      // Issue far more credit than the amount due.
      await issueAccountCredit({ userId, organizationId, amountCents: 50000 });

      const result = await createCheckoutForRegistration({
        db: getDb(),
        registrationId,
        userId,
        baseUrl: "http://localhost:4321",
        applyAccountCredit: true,
      });

      expect(result.kind).toBe("paid_zero");
      expect(result.creditAppliedCents).toBe(2000);

      // Only the amount due was consumed — the rest remains as balance.
      const balance = await getAccountCreditBalanceCents(userId, organizationId);
      expect(balance).toBe(48000);
    },
  );

  itWithStripe(
    "does not apply credit when applyAccountCredit is omitted",
    async () => {
      const { registrationId, organizationId, userId } = await seedPaidRegistration(0, {
        amountDueCents: 10000,
        paymentStatus: "unpaid",
        status: "pending",
      });
      await issueAccountCredit({ userId, organizationId, amountCents: 3000 });

      const result = await createCheckoutForRegistration({
        db: getDb(),
        registrationId,
        userId,
        baseUrl: "http://localhost:4321",
        // applyAccountCredit omitted
      });

      expect(result.kind).toBe("stripe_session");
      if (result.kind !== "stripe_session") return;
      expect(result.creditAppliedCents).toBe(0);

      const balance = await getAccountCreditBalanceCents(userId, organizationId);
      expect(balance).toBe(3000);
    },
  );
});
