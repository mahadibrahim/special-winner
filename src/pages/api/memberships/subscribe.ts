/**
 * POST /api/memberships/subscribe
 *
 * Body: { tierId: string; billingInterval: "month" | "year"; familyMemberId?: string }
 *
 * Resolves the tier (must belong to the resolved org), gets-or-creates a
 * Stripe Customer for the user, creates a Stripe Checkout Session in
 * subscription mode (Connect-aware), and returns the URL. The `memberships`
 * row is inserted on `checkout.session.completed` in the Connect webhook —
 * mirrors the drop-in pattern, no orphan rows on abandonment.
 *
 * `familyMemberId` is optional — youth per-child memberships pass the
 * subscribing child's `family_members.id` (must be the caller's dependent,
 * enforced below). When present, the tier's one-time annual fee price (if
 * configured) rides along as a second Checkout line item, and a second
 * child of the same parent gets the sibling discount applied automatically.
 *
 * Returns 409 when the target (child, or the caller for the adult/self
 * path) already has a live membership in this org — a second Checkout
 * Session would create a second real Stripe subscription that the
 * one-active-per-child/user partial unique index can't record.
 */
import type { APIRoute } from "astro";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { membershipTiers } from "@/lib/db/schema/memberships";
import { organizations } from "@/lib/db/schema/organizations";
import { users } from "@/lib/db/schema/users";
import { familyMembers } from "@/lib/db/schema/registrations";
import {
  getOrCreateStripeCustomer,
  createSubscriptionCheckoutSession,
} from "@/lib/memberships/stripe";
import { getSiblingCouponId } from "@/lib/memberships/sibling-discount";
import { getActiveChildMembership } from "@/lib/memberships/get-child-membership";
import { getActiveMembershipForOrg } from "@/lib/memberships/get-active-membership";
import { stripe } from "@/lib/stripe/client";
import { brandFromHost } from "@/lib/organization/soccerone-routing";
import { collectAdAttribution } from "@/lib/analytics/parse-cookies";

export const prerender = false;

const UUID_RX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const json = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

export const POST: APIRoute = async ({ request, locals, url }) => {
  if (!locals.user) return json({ error: "Unauthorized" }, 401);
  if (!locals.organization)
    return json({ error: "No organization context" }, 400);

  let body: {
    tierId?: unknown;
    billingInterval?: unknown;
    familyMemberId?: unknown;
  };
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
  // A malformed uuid literal makes Postgres throw ("invalid input syntax for
  // type uuid") on the lookup below, which would surface as a 500 instead of
  // the same "not found" a well-formed-but-nonexistent id gets — mirrors the
  // familyMemberId guard above.
  if (!UUID_RX.test(tierId)) {
    return json({ error: "Tier not found" }, 404);
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

  // Optional child (family_members row) this subscription is for — youth
  // per-child memberships. Validate ownership before anything else: the
  // child must be the caller's dependent, or return 404 (never leak whether
  // the id exists under another user).
  let familyMemberId: string | null = null;
  if (typeof body.familyMemberId === "string") {
    // Reject malformed ids before they hit the DB — an invalid uuid
    // literal makes Postgres throw ("invalid input syntax for type
    // uuid"), which would surface as a 500 instead of a clean 4xx.
    if (!UUID_RX.test(body.familyMemberId)) {
      return json({ error: "Invalid familyMemberId" }, 422);
    }
    const [child] = await db
      .select({ id: familyMembers.id })
      .from(familyMembers)
      .where(
        and(
          eq(familyMembers.id, body.familyMemberId),
          eq(familyMembers.parentUserId, locals.user.id),
        ),
      )
      .limit(1);
    if (!child) return json({ error: "Family member not found" }, 404);
    familyMemberId = child.id;
  }

  // Block a double subscribe. Without this, a second Checkout Session
  // creates a second REAL Stripe subscription — the webhook insert then
  // collides with the one-active-per-child/user partial unique index and
  // silently no-ops (onConflictDoNothing), so the app never records it and
  // the family gets charged monthly for a subscription it can't see or
  // manage. Checked for both the child path and the adult/self path.
  if (familyMemberId) {
    const existingChildMembership = await getActiveChildMembership(
      familyMemberId,
      locals.organization.id,
    );
    if (existingChildMembership) {
      return json(
        { error: "This child already has an active membership" },
        409,
      );
    }
  } else {
    const existingSelfMembership = await getActiveMembershipForOrg(
      locals.user.id,
      locals.organization.id,
    );
    if (existingSelfMembership) {
      return json({ error: "You already have an active membership" }, 409);
    }
  }

  if (!stripe) return json({ error: "Stripe not configured" }, 503);

  // A missing sibling discount must never block a subscribe: on any
  // failure (Stripe unconfigured, coupon create error, rate limit) we
  // degrade to no discount rather than surfacing a 500 for an unrelated
  // checkout. The discount can be applied manually in Stripe after the
  // fact if it ever drops this way.
  let couponId: string | null = null;
  if (familyMemberId) {
    try {
      couponId = await getSiblingCouponId(
        locals.organization.id,
        locals.user.id,
        familyMemberId,
        tier.monthlyPriceCents,
      );
    } catch (err) {
      console.error("[memberships/subscribe] sibling coupon lookup failed", err);
      couponId = null;
    }
  }

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

  // Request origin, not PUBLIC_APP_URL — Stripe success/cancel redirects
  // must return to the domain the customer subscribed from (brand host).
  const appUrl = url.origin;
  // Child (youth per-class) subscriptions land on the post-checkout
  // home-slot picker so the new member can enroll and capture the guardian
  // waiver in one motion — the adult/self path is byte-identical to before.
  const successUrl = familyMemberId
    ? `${appUrl}/dashboard/family/choose-slot?child=${familyMemberId}&membership=success`
    : `${appUrl}/dashboard/play?membership=success`;
  const cancelUrl = familyMemberId
    ? `${appUrl}/youth/classes?membership=cancelled`
    : `${appUrl}/memberships?membership=cancelled`;
  try {
    const result = await createSubscriptionCheckoutSession({
      customerId,
      priceId,
      userId: locals.user.id,
      organizationId: locals.organization.id,
      tierId: tier.id,
      billingInterval,
      partnerStripeAccountId,
      successUrl,
      cancelUrl,
      // Storefront brand — host-derived, since both brands share one org.
      brand: brandFromHost(request.headers.get("host") ?? ""),
      tierName: tier.name,
      adAttribution: collectAdAttribution(url, request.headers.get("cookie")),
      // The fee only attaches to child memberships; adult SoccerOne tiers
      // have no fee configured, so this is belt-and-braces.
      familyMemberId: familyMemberId ?? undefined,
      feePriceId: familyMemberId ? tier.stripePriceIdFee : null,
      couponId,
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
