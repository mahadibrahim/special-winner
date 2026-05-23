/**
 * POST /api/memberships/pause
 *
 * Body: { resumesAt?: string (ISO 8601) }
 *
 * Pauses billing via Stripe's `pause_collection`. Optional resumesAt sets
 * a definite resume date; omitted means indefinite. The Connect webhook
 * flips `memberships.status` to `paused` on `subscription.updated`.
 */
import type { APIRoute } from "astro";
import { getActiveMembershipForOrg } from "@/lib/memberships/get-active-membership";
import { pauseSubscription } from "@/lib/memberships/stripe";
import { stripe } from "@/lib/stripe/client";

export const prerender = false;

const json = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

export const POST: APIRoute = async ({ request, locals }) => {
  if (!locals.user) return json({ error: "Unauthorized" }, 401);
  if (!locals.organization) return json({ error: "No organization context" }, 400);

  let body: { resumesAt?: unknown };
  try {
    body = await request.json();
  } catch {
    body = {};
  }

  // Validate the body BEFORE membership lookup so a malformed payload gets
  // a stable 422 (not gated on whether the user has a membership or whether
  // Stripe is configured).
  let resumesAt: Date | null = null;
  if (body.resumesAt !== undefined && body.resumesAt !== null) {
    if (typeof body.resumesAt !== "string") {
      return json({ error: "resumesAt must be an ISO 8601 string" }, 422);
    }
    const parsed = new Date(body.resumesAt);
    if (Number.isNaN(parsed.getTime())) {
      return json({ error: "resumesAt is not a valid ISO 8601 timestamp" }, 422);
    }
    resumesAt = parsed;
  }

  // Lookup BEFORE the Stripe-configured check — see cancel.ts for the same
  // ordering rationale (CI without STRIPE_SECRET_KEY should still surface
  // 404 for membership-less users instead of masking with 503).
  const membership = await getActiveMembershipForOrg(
    locals.user.id,
    locals.organization.id,
  );
  if (!membership || !membership.stripeSubscriptionId) {
    return json({ error: "No active membership" }, 404);
  }

  if (!stripe) return json({ error: "Stripe not configured" }, 503);

  try {
    await pauseSubscription(membership.stripeSubscriptionId, { resumesAt });
  } catch (err) {
    console.error("[memberships/pause] stripe pause failed", err);
    return json({ error: "Could not pause subscription" }, 502);
  }

  return json({ ok: true, resumesAt: resumesAt?.toISOString() ?? null }, 200);
};
