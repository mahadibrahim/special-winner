import { describe, it, expect } from "vitest";

const BASE = process.env.TEST_BASE_URL || "http://localhost:4321";

// Gate Stripe-dependent tests the same way other test files do.
const stripeConfigured = Boolean(process.env.STRIPE_SECRET_KEY);
const itWithStripe = stripeConfigured ? it : it.skip;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function fetchOpenSeasonId(): Promise<string> {
  const res = await fetch(`${BASE}/api/public/seasons?status=open`);
  if (!res.ok) throw new Error(`Failed to fetch seasons: ${res.status}`);
  const data = await res.json();
  const seasons: Array<{
    id: string;
    maxParticipants?: number;
    registeredCount?: number;
  }> = data.seasons ?? [];
  if (seasons.length === 0) {
    throw new Error("No open seasons in test DB — re-seed e2e data");
  }
  // Prefer a season that still has capacity (avoids waitlist path).
  for (const s of seasons) {
    if (!s.maxParticipants || (s.registeredCount ?? 0) < s.maxParticipants) {
      return s.id;
    }
  }
  return seasons[0].id;
}

// Build a unique guest-checkout body for each test run so we don't pollute
// across runs (parent email is unique, child name is unique).
function guestBody(seasonId: string, overrides: Record<string, unknown> = {}) {
  return {
    seasonId,
    parent: {
      firstName: "CheckoutTest",
      lastName: "Parent",
      email: `checkout-test-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`,
      phone: "+15555550100",
    },
    child: {
      firstName: `Kid${Date.now()}`,
      lastName: "TestCheckout",
      birthDate: "2018-04-01",
      gender: "male" as const,
    },
    registrationType: "full" as const,
    waiverSigned: true,
    waiverSignedBy: "CheckoutTest Parent",
    // COPPA: verifiable parental consent at collection time.
    parentalConsent: true as const,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("POST /api/payments/create-checkout — embedded checkout shape", () => {
  // Test 1: assert that the endpoint returns the embedded-checkout shape
  // (clientSecret, publishableKey, sessionId) and NOT the old redirect shape
  // (checkoutUrl). We drive this via guest-checkout because it exercises the
  // same createCheckoutForRegistration helper as the authenticated endpoint.
  itWithStripe(
    "returns clientSecret, publishableKey, and sessionId — not checkoutUrl",
    async () => {
      const seasonId = await fetchOpenSeasonId();
      const res = await fetch(`${BASE}/api/registrations/guest-checkout`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(guestBody(seasonId)),
      });

      expect(res.status).toBe(200);
      const body = await res.json();

      // New embedded-checkout fields must be present.
      // createCheckoutSession creates a PaymentIntent (embedded checkout),
      // so clientSecret is pi_..._secret_... and sessionId is pi_...
      // PaymentIntent IDs are pi_{chars} (no test/live infix unlike cs_).
      expect(typeof body.clientSecret).toBe("string");
      expect(body.clientSecret).toMatch(/^pi_.+_secret_/);

      expect(typeof body.publishableKey).toBe("string");
      expect(body.publishableKey).toMatch(/^pk_(test|live)_/);

      expect(typeof body.sessionId).toBe("string");
      expect(body.sessionId).toMatch(/^pi_/);

      // Old redirect field must NOT be present.
      expect(body.checkoutUrl).toBeUndefined();
    },
  );

  // Test 2: assert that a _ga cookie in the request is parsed and forwarded
  // as ga_client_id in Stripe session metadata, and that the resolving org is
  // stamped as organization_id so every registration charge is
  // brand-attributable (Aspire vs SoccerOne) in the Stripe dashboard.
  itWithStripe(
    "_ga cookie round-trips as ga_client_id, and organization_id is stamped, in Stripe session metadata",
    async () => {
      const seasonId = await fetchOpenSeasonId();

      // Use a recognisable client_id so we can assert the exact value later.
      const gaClientId = "1234567890.0987654321";
      const gaCookieValue = `GA1.1.${gaClientId}`;

      const res = await fetch(`${BASE}/api/registrations/guest-checkout`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          // Send the _ga cookie alongside the request (no auth cookie needed
          // for guest-checkout).
          Cookie: `_ga=${gaCookieValue}`,
        },
        body: JSON.stringify(guestBody(seasonId)),
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      const sessionId: string = body.sessionId;
      expect(typeof sessionId).toBe("string");

      // Retrieve the Stripe session directly to inspect server-side metadata.
      // createCheckoutSession creates a PaymentIntent (not a Checkout
      // Session), so we retrieve via /v1/payment_intents instead of
      // /v1/checkout/sessions. The sessionId here is a pi_... ID.
      const stripeSecretKey = process.env.STRIPE_SECRET_KEY!;
      const stripeRes = await fetch(
        `https://api.stripe.com/v1/payment_intents/${sessionId}`,
        {
          headers: { Authorization: `Bearer ${stripeSecretKey}` },
        },
      );
      expect(stripeRes.status).toBe(200);
      const pi = await stripeRes.json();

      // The parsed client_id (everything after GA1.1.) should be in metadata.
      expect(pi.metadata?.ga_client_id).toBe(gaClientId);

      // The resolving org must be stamped so the charge is brand-attributable
      // without a DB join. localhost resolves to the default (Aspire) org, so
      // we assert a non-empty org id rather than a specific value.
      expect(typeof pi.metadata?.organization_id).toBe("string");
      expect(pi.metadata.organization_id.length).toBeGreaterThan(0);
    },
  );
});
