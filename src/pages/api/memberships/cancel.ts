/**
 * POST /api/memberships/cancel
 *
 * Marks the authenticated user's active membership to cancel at period
 * end. The actual `status = 'cancelled'` flip happens via the Connect
 * webhook on `customer.subscription.deleted` (or `subscription.updated`
 * with `cancel_at_period_end: true` for the interim state).
 */
import type { APIRoute } from "astro";
import { getActiveMembershipForOrg } from "@/lib/memberships/get-active-membership";
import { cancelSubscriptionAtPeriodEnd } from "@/lib/memberships/stripe";
import { stripe } from "@/lib/stripe/client";

export const prerender = false;

const json = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

export const POST: APIRoute = async ({ locals }) => {
  if (!locals.user) return json({ error: "Unauthorized" }, 401);
  if (!locals.organization) return json({ error: "No organization context" }, 400);
  if (!stripe) return json({ error: "Stripe not configured" }, 503);

  const membership = await getActiveMembershipForOrg(
    locals.user.id,
    locals.organization.id,
  );
  if (!membership || !membership.stripeSubscriptionId) {
    return json({ error: "No active membership" }, 404);
  }

  try {
    await cancelSubscriptionAtPeriodEnd(membership.stripeSubscriptionId);
  } catch (err) {
    console.error("[memberships/cancel] stripe cancel failed", err);
    return json({ error: "Could not cancel subscription" }, 502);
  }

  return json({ ok: true, cancelAtPeriodEnd: true }, 200);
};
