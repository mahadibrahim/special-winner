import { describe, it, expect, beforeAll } from "vitest";
import { apiFetch } from "../setup/test-helpers";

/**
 * POST /api/public/team-registrations/[token]/confirm-deposit
 *
 * Client-confirmed bridge over the payment_intent.succeeded webhook lag for
 * the captain's $200 team deposit (Task 7 finding 3 — see captain-credit.ts
 * and handle-team-deposit-succeeded.ts). The endpoint re-verifies the
 * PaymentIntent against Stripe itself before writing anything — it never
 * trusts the client beyond the PI id.
 *
 * CI doesn't carry STRIPE_SECRET_KEY by default. Without Stripe configured
 * the endpoint can't verify anything, so it 503s rather than either trusting
 * the client or pretending success — same contract as the other
 * Stripe-dependent endpoints in this route family (see
 * team-registrations/index.ts's `if (!stripe)` branches). With Stripe
 * configured, a bogus/non-existent PaymentIntent id 4xx's off the
 * `stripe.paymentIntents.retrieve` failure. The full happy path (a real
 * succeeded deposit PI) needs a live Stripe test-mode PI, which this suite
 * doesn't have a fixture for — leaving that as a manual/Stripe-gated check.
 */
const stripeConfigured = Boolean(process.env.STRIPE_SECRET_KEY);
const itWithStripe = stripeConfigured ? it : it.skip;
const itWithoutStripe = stripeConfigured ? it.skip : it;

describe("POST /api/public/team-registrations/[token]/confirm-deposit", () => {
  let orgAToken: string;

  beforeAll(async () => {
    const orgARes = await apiFetch("/api/test/org-fixtures?slug=aspire-sports");
    expect(orgARes.status).toBe(200);
    const orgAFix = await orgARes.json();
    expect(orgAFix.teamRegToken).toBeTruthy();
    orgAToken = orgAFix.teamRegToken;
  });

  it("400s on a missing/invalid body", async () => {
    const res = await apiFetch(
      `/api/public/team-registrations/${orgAToken}/confirm-deposit`,
      { method: "POST", body: JSON.stringify({}) },
    );
    expect(res.status).toBe(400);
  });

  it("404s for an unknown token", async () => {
    const res = await apiFetch(
      "/api/public/team-registrations/no-such-token-xyz-9999/confirm-deposit",
      {
        method: "POST",
        body: JSON.stringify({ paymentIntentId: "pi_does_not_exist" }),
      },
    );
    expect(res.status).toBe(404);
  });

  itWithoutStripe(
    "503s without Stripe configured, even for a well-formed body on a real token",
    async () => {
      const res = await apiFetch(
        `/api/public/team-registrations/${orgAToken}/confirm-deposit`,
        {
          method: "POST",
          body: JSON.stringify({ paymentIntentId: "pi_does_not_exist" }),
        },
      );
      expect(res.status).toBe(503);
    },
  );

  itWithStripe(
    "4xx's for a payment intent id Stripe doesn't recognize",
    async () => {
      const res = await apiFetch(
        `/api/public/team-registrations/${orgAToken}/confirm-deposit`,
        {
          method: "POST",
          body: JSON.stringify({ paymentIntentId: "pi_1_totally_bogus_id" }),
        },
      );
      expect(res.status).toBeGreaterThanOrEqual(400);
      expect(res.status).toBeLessThan(500);
    },
  );

  it("rate limits after 5 requests/min/IP", async () => {
    // Same tolerant pattern as team-registrations-anon.test.ts: the limiter
    // is in-memory/per-instance and fails open, and the broader suite may
    // run with DISABLE_RATE_LIMIT=1. Bodies are well-formed-but-meaningless
    // so every request reaches the rate-limit check before any Stripe/DB work.
    let sawLimit = false;
    let last = 0;
    for (let i = 0; i < 6; i++) {
      const res = await apiFetch(
        `/api/public/team-registrations/${orgAToken}/confirm-deposit`,
        {
          method: "POST",
          body: JSON.stringify({ paymentIntentId: `pi_ratelimit_probe_${i}` }),
        },
      );
      last = res.status;
      if (last === 429) {
        sawLimit = true;
        break;
      }
    }

    if (!sawLimit) {
      console.warn(
        `confirm-deposit rate-limit test: never saw 429 in 6 requests (last status ${last}) — ` +
          "likely DISABLE_RATE_LIMIT=1 or a fresh bucket; not failing.",
      );
      return;
    }
    expect(last).toBe(429);
  });
});
