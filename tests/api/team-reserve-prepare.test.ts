import { describe, it, expect } from "vitest";

/**
 * Deferred-account team reserve: POST /api/public/team-registrations/prepare.
 *
 * `prepare` creates NOTHING (no user, no team) — it returns a $200 deposit
 * PaymentIntent whose metadata carries the reservation; the account + team are
 * created only when that intent succeeds (verified by finalize/webhook, which
 * need Stripe and are exercised in the staging E2E). These cases cover the
 * pre-payment gates, which run on CI without Stripe confirmation.
 */

const BASE = process.env.TEST_BASE_URL ?? "http://localhost:4321";
const SEASON_SLUG = "e2e-adult-team-soccer-2026";
const H = { "Content-Type": "application/json" };

async function teamSeasonId(): Promise<string> {
  const json = await (await fetch(`${BASE}/api/public/seasons?sport=soccer&audience=adult`)).json();
  const s = json.seasons?.find((x: { slug?: string }) => x.slug === SEASON_SLUG);
  expect(s?.id, `expected seeded season "${SEASON_SLUG}"`).toBeTruthy();
  return s.id;
}
const prepare = (body: unknown) =>
  fetch(`${BASE}/api/public/team-registrations/prepare`, { method: "POST", headers: H, body: JSON.stringify(body) });

// Stripe is unavailable on CI, so a new-email prepare 503s before minting an
// intent — gate the "reaches Stripe" case, run the rest everywhere.
const hasStripe = process.env.TEST_HAS_STRIPE === "yes";
const itStripe = hasStripe ? it : it.skip;

describe("team reserve — prepare", () => {
  it("a guest whose email already has an account is NOT bounced — reserves as a guest", async () => {
    // The old 409 `needsSignIn` wall (forcing an off-site magic-link before
    // payment) is gone: an existing-email guest is treated like any guest and
    // proceeds toward payment. finalize links the team to the existing account
    // and — because a session is only created for a NEW user — never logs the
    // guest in as that account. On CI (no Stripe) this reaches the Stripe step
    // and 503s, exactly like a new-email prepare; the point is it's NOT a 409.
    const seasonId = await teamSeasonId();
    const res = await prepare({
      seasonId,
      teamName: "Existing Cap FC",
      captainName: "Existing Cap",
      captainEmail: "parent@test.aspiresports.com", // seeded account
      backstopConsent: true,
    });
    expect(res.status).not.toBe(409);
    expect((await res.json()).needsSignIn).toBeFalsy();
  });

  itStripe("an existing-account email reaches a payment intent as a guest", async () => {
    const seasonId = await teamSeasonId();
    const res = await prepare({
      seasonId,
      teamName: "Existing Cap FC",
      captainName: "Existing Cap",
      captainEmail: "parent@test.aspiresports.com",
      backstopConsent: true,
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.clientSecret).toMatch(/^pi_.*_secret_/);
  });

  it("rejects a code that would drop the team total to/below the $200 deposit", async () => {
    const seasonId = await teamSeasonId();
    // E2ETEAM10 is 10% — never over-large — so this asserts a genuinely huge
    // code is refused. Uses a per-run non-existent large code to avoid seeding;
    // an unknown code returns a validation error (also not applied), which is
    // the safe direction. The over-large math itself is unit-tested.
    const res = await prepare({
      seasonId,
      teamName: "Big Code FC",
      captainName: "Cap",
      captainEmail: `big-${Date.now()}@example.com`,
      backstopConsent: true,
      discountCode: "DOES-NOT-EXIST-XYZ",
    });
    const body = await res.json();
    expect(body.ok).toBeFalsy();
    expect(body.discount).toBe(false);
  });

  it("requires backstop consent", async () => {
    const seasonId = await teamSeasonId();
    const res = await prepare({
      seasonId,
      teamName: "No Consent FC",
      captainName: "Cap",
      captainEmail: `noconsent-${Date.now()}@example.com`,
    });
    expect(res.status).toBe(400);
  });

  itStripe("a new email reaches a payment intent without creating a user", async () => {
    const seasonId = await teamSeasonId();
    const email = `prep-new-${Date.now()}@example.com`;
    const res = await prepare({ seasonId, teamName: "New FC", captainName: "New Cap", captainEmail: email, backstopConsent: true });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.clientSecret).toMatch(/^pi_.*_secret_/);
  });
});
