/**
 * POST /api/memberships/billing-portal
 *
 * Hands the signed-in parent a Stripe Customer Portal URL so they can fix a
 * failed card themselves (the `past_due` dead-end this feature exists to
 * remove) or self-cancel at period end. Body: `{ returnPath? }`, restricted
 * to the dashboard allow-list in `@/lib/memberships/billing-portal`.
 *
 * Customer resolution is `resolveBillingPortalCustomerId`
 * (src/lib/memberships/customer.ts): the newest `past_due` membership's
 * customer if there is one; else the newest customer among LIVE-status rows
 * (active/paused/past_due/incomplete); else the newest customer on any row.
 * Preferring past_due, then live-over-dead, is not cosmetic — historical
 * rows fan out across several Stripe customers (the 24h idempotency-key
 * window on `getOrCreateStripeCustomer` meant a second child subscribed a
 * day later got a new customer), so the NEWEST row's customer may be an
 * unrelated `cancelled` row and would drop the parent into a portal showing
 * nothing to fix — the exact dead-end this endpoint exists to remove. New
 * purchases converge on one customer per parent via
 * `findMembershipStripeCustomerId`, but old divergence stays.
 *
 * Ordering matters here:
 *   1. auth → 401
 *   2. returnPath allow-list → 422 (pure input validation; must not depend
 *      on Stripe being configured)
 *   3. customer lookup → 404 `no_billing_account`
 *   4. Stripe-configured check → 503
 * Steps 2 and 3 run BEFORE the Stripe check for the same reason
 * `/api/memberships/cancel` orders its lookup first: on an environment with
 * no STRIPE_SECRET_KEY, a 503 would mask the real answer.
 */
import type { APIRoute } from "astro";
import {
  createBillingPortalSession,
  isBillingReturnPath,
  BILLING_RETURN_PATHS,
} from "@/lib/memberships/billing-portal";
import { resolveBillingPortalCustomerId } from "@/lib/memberships/customer";
import { stripe } from "@/lib/stripe/client";

export const prerender = false;

const json = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

export const POST: APIRoute = async ({ request, url, locals }) => {
  if (!locals.user) return json({ error: "Unauthorized" }, 401);

  let body: unknown = {};
  try {
    const text = await request.text();
    if (text.trim()) body = JSON.parse(text);
  } catch {
    return json({ error: "Invalid JSON body" }, 422);
  }
  const rawReturnPath = (body as { returnPath?: unknown } | null)?.returnPath;
  const returnPath = rawReturnPath ?? BILLING_RETURN_PATHS[0];
  if (!isBillingReturnPath(returnPath)) {
    return json({ error: "Unsupported returnPath" }, 422);
  }

  const customerId = await resolveBillingPortalCustomerId(locals.user.id);

  if (!customerId) {
    return json(
      {
        error: "no_billing_account",
        message: "No billing account found — subscribe first or contact us.",
      },
      404,
    );
  }

  if (!stripe) return json({ error: "Stripe not configured" }, 503);

  // REQUEST origin, exactly like the Checkout redirects in
  // memberships/subscribe.ts: the parent must come back to the host they
  // left from. A brand-mapped canonical origin would bounce a dev or e2e
  // SoccerOne-host session out to production; PUBLIC_APP_URL would strand a
  // SoccerOne customer on the Aspire host. The PATH is still allow-listed,
  // so nothing here is client-controlled.
  const origin = url.origin;

  try {
    const session = await createBillingPortalSession({
      customerId,
      returnPath,
      origin,
    });
    return json({ url: session.url }, 200);
  } catch (err) {
    console.error("[memberships/billing-portal] session create failed", err);
    return json({ error: "Could not open the billing portal" }, 502);
  }
};
