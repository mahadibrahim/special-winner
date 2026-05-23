/**
 * POST /api/memberships/subscribe
 *
 * Body: { tierId: string; billingInterval: "month" | "year" }
 *
 * Resolves the tier (must belong to the resolved org), gets-or-creates a
 * Stripe Customer for the user, creates a Stripe Checkout Session in
 * subscription mode (Connect-aware), and returns the URL. The `memberships`
 * row is inserted on `checkout.session.completed` in the Connect webhook —
 * mirrors the drop-in pattern, no orphan rows on abandonment.
 */
import type { APIRoute } from "astro";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { membershipTiers } from "@/lib/db/schema/memberships";
import { organizations } from "@/lib/db/schema/organizations";
import { users } from "@/lib/db/schema/users";
import {
  getOrCreateStripeCustomer,
  createSubscriptionCheckoutSession,
} from "@/lib/memberships/stripe";
import { stripe } from "@/lib/stripe/client";

export const prerender = false;

const json = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

export const POST: APIRoute = async ({ request, locals }) => {
  if (!locals.user) return json({ error: "Unauthorized" }, 401);
  if (!locals.organization)
    return json({ error: "No organization context" }, 400);

  let body: { tierId?: unknown; billingInterval?: unknown };
  try {
    body = await request.json();
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }

  const tierId = typeof body.tierId === "string" ? body.tierId : null;
  const billingInterval =
    body.billingInterval === "month" || body.billingInterval === "year"
      ? body.billingInterval
      : null;
  if (!tierId || !billingInterval) {
    return json({ error: "tierId and billingInterval are required" }, 422);
  }

  const db = getDb();

  // Tenant-scoped tier lookup. A tier from another org returns 404 —
  // do not leak whether the id exists in some other tenant.
  const [tier] = await db
    .select()
    .from(membershipTiers)
    .where(
      and(
        eq(membershipTiers.id, tierId),
        eq(membershipTiers.organizationId, locals.organization.id),
        eq(membershipTiers.isActive, true),
      ),
    )
    .limit(1);
  if (!tier) return json({ error: "Tier not found" }, 404);

  const priceId =
    billingInterval === "month"
      ? tier.stripePriceIdMonthly
      : tier.stripePriceIdAnnual;
  if (!priceId) {
    return json(
      { error: `Tier does not offer ${billingInterval}ly billing` },
      422,
    );
  }

  if (!stripe) return json({ error: "Stripe not configured" }, 503);

  // Resolve the partner Stripe account at org level (memberships are
  // org-scoped, not venue-scoped). Falls back to direct charge.
  const [org] = await db
    .select({ stripeAccountId: organizations.stripeAccountId })
    .from(organizations)
    .where(eq(organizations.id, locals.organization.id))
    .limit(1);
  const partnerStripeAccountId = org?.stripeAccountId ?? null;

  // Get-or-create Stripe Customer. Use the DB email/name rather than
  // locals.user — locals may be trimmed by the session shape.
  const [userRow] = await db
    .select({ email: users.email, firstName: users.firstName })
    .from(users)
    .where(eq(users.id, locals.user.id))
    .limit(1);
  if (!userRow) return json({ error: "User not found" }, 404);

  let customerId: string;
  try {
    customerId = await getOrCreateStripeCustomer({
      userId: locals.user.id,
      email: userRow.email,
      name: userRow.firstName,
    });
  } catch (err) {
    console.error("[memberships/subscribe] customer create failed", err);
    return json({ error: "Could not create Stripe customer" }, 502);
  }

  const appUrl = import.meta.env.PUBLIC_APP_URL ?? "http://localhost:4321";
  try {
    const result = await createSubscriptionCheckoutSession({
      customerId,
      priceId,
      userId: locals.user.id,
      organizationId: locals.organization.id,
      tierId: tier.id,
      billingInterval,
      partnerStripeAccountId,
      successUrl: `${appUrl}/dashboard/play?membership=success`,
      cancelUrl: `${appUrl}/memberships?membership=cancelled`,
    });
    return json(
      { checkoutUrl: result.url, checkoutSessionId: result.sessionId },
      200,
    );
  } catch (err) {
    console.error("[memberships/subscribe] checkout create failed", err);
    return json({ error: "Could not start checkout" }, 502);
  }
};
