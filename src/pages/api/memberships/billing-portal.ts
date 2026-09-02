/**
 * POST /api/memberships/billing-portal
 *
 * Hands the signed-in parent a Stripe Customer Portal URL so they can fix a
 * failed card themselves (the `past_due` dead-end this feature exists to
 * remove) or self-cancel at period end. Body: `{ returnPath? }`, restricted
 * to the dashboard allow-list in `@/lib/memberships/billing-portal`.
 *
 * Customer resolution: the NEWEST `memberships` row for the caller that
 * carries a `stripeCustomerId`, with an explicit `orderBy(desc(createdAt))`
 * — one Stripe customer covers a parent's adult membership AND every
 * per-child subscription, and an unordered "pick a row" would drift on the
 * shared CI/staging DB (the standing multi-tenant query hazard).
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
import { desc, and, eq, isNotNull } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { memberships } from "@/lib/db/schema/memberships";
import { env } from "@/lib/env";
import {
  createBillingPortalSession,
  isBillingReturnPath,
  BILLING_RETURN_PATHS,
} from "@/lib/memberships/billing-portal";
import { originForBrand } from "@/lib/organization/soccerone-routing";
import { stripe } from "@/lib/stripe/client";

export const prerender = false;

const json = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

export const POST: APIRoute = async ({ request, locals }) => {
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

  const [row] = await getDb()
    .select({ stripeCustomerId: memberships.stripeCustomerId })
    .from(memberships)
    .where(
      and(
        eq(memberships.userId, locals.user.id),
        isNotNull(memberships.stripeCustomerId),
      ),
    )
    .orderBy(desc(memberships.createdAt))
    .limit(1);

  if (!row?.stripeCustomerId) {
    return json(
      {
        error: "no_billing_account",
        message: "No billing account found — subscribe first or contact us.",
      },
      404,
    );
  }

  if (!stripe) return json({ error: "Stripe not configured" }, 503);

  // Env-aware origin, never a hardcoded host: SoccerOne resolves to its
  // canonical origin, every other brand falls through to PUBLIC_APP_URL
  // (localhost in dev, the staging host on staging).
  const origin = originForBrand(locals.brandId) ?? env.PUBLIC_APP_URL;

  try {
    const { url } = await createBillingPortalSession({
      customerId: row.stripeCustomerId,
      returnPath,
      origin,
    });
    return json({ url }, 200);
  } catch (err) {
    console.error("[memberships/billing-portal] session create failed", err);
    return json({ error: "Could not open the billing portal" }, 502);
  }
};
