/**
 * POST /api/classes/packs/purchase
 *
 * Body: { packProductId: string; familyMemberId: string }
 * → 200 { url }  — a Stripe Checkout (payment mode) URL to redirect to.
 *
 * Buys a class pack (N floating session credits) for ONE child. Nothing is
 * written here: the `class_credit_grants` row is inserted by
 * `handleClassPackPurchaseComplete` on `checkout.session.completed`, so an
 * abandoned checkout leaves no orphan credits. Mirrors
 * /api/memberships/subscribe — tenant-scoped product lookup, child-ownership
 * check, get-or-create Stripe Customer, request-origin redirects, brand from
 * host, ad-attribution ids threaded through metadata for the webhook's
 * server-side conversions.
 */
import type { APIRoute } from "astro";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { classPackProducts } from "@/lib/db/schema/classes";
import { organizations } from "@/lib/db/schema/organizations";
import { users } from "@/lib/db/schema/users";
import { familyMembers } from "@/lib/db/schema/registrations";
import { getOrCreateStripeCustomer } from "@/lib/memberships/stripe";
import { stripe } from "@/lib/stripe/client";
import { brandFromHost } from "@/lib/organization/soccerone-routing";
import { collectAdAttribution } from "@/lib/analytics/parse-cookies";

export const prerender = false;

/** Platform cut on Connect-routed orgs — matches memberships/rentals. */
const PLATFORM_FEE_PCT = 10;

const UUID_RX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const json = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

export const POST: APIRoute = async ({ request, locals, url }) => {
  if (!locals.user) return json({ error: "Unauthorized" }, 401);
  if (!locals.organization) return json({ error: "No organization context" }, 400);

  let body: { packProductId?: unknown; familyMemberId?: unknown };
  try {
    body = await request.json();
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }

  const packProductId = typeof body.packProductId === "string" ? body.packProductId : null;
  const familyMemberId = typeof body.familyMemberId === "string" ? body.familyMemberId : null;
  if (!packProductId || !familyMemberId) {
    return json({ error: "packProductId and familyMemberId are required" }, 422);
  }
  // A malformed uuid literal makes Postgres throw ("invalid input syntax for
  // type uuid"), which would surface as a 500 instead of a clean 4xx.
  if (!UUID_RX.test(packProductId)) return json({ error: "Pack not found" }, 404);
  if (!UUID_RX.test(familyMemberId)) return json({ error: "Invalid familyMemberId" }, 422);

  const db = getDb();

  // Tenant-scoped pack lookup. A pack from another org (or a retired one)
  // returns 404 — never leak whether the id exists in some other tenant.
  const [pack] = await db
    .select()
    .from(classPackProducts)
    .where(
      and(
        eq(classPackProducts.id, packProductId),
        eq(classPackProducts.organizationId, locals.organization.id),
        eq(classPackProducts.active, true),
      ),
    )
    .limit(1); // primary-key lookup — at most one row
  if (!pack) return json({ error: "Pack not found" }, 404);

  // The child must be the caller's dependent. 404 (not 403) so the response
  // is identical whether the id is unknown or someone else's.
  const [child] = await db
    .select({ id: familyMembers.id })
    .from(familyMembers)
    .where(
      and(
        eq(familyMembers.id, familyMemberId),
        eq(familyMembers.parentUserId, locals.user.id),
      ),
    )
    .limit(1); // primary-key lookup — at most one row
  if (!child) return json({ error: "Family member not found" }, 404);

  // Nothing to charge — a half-configured catalog row, not a client error.
  // 409 rather than 500 so the UI can say "not available" instead of
  // surfacing a Stripe validation crash.
  if (pack.priceCents <= 0) {
    return json({ error: "Pack is not purchasable" }, 409);
  }

  if (!stripe) return json({ error: "Stripe not configured" }, 503);

  // Connect-aware, resolved at org level (packs are org-scoped, not
  // venue-scoped). Null falls through to a direct platform charge.
  const [org] = await db
    .select({ stripeAccountId: organizations.stripeAccountId })
    .from(organizations)
    .where(eq(organizations.id, locals.organization.id))
    .limit(1);
  const partnerStripeAccountId = org?.stripeAccountId ?? null;

  // DB email/name rather than locals.user — locals may be trimmed by the
  // session shape.
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
    console.error("[classes/packs/purchase] customer create failed", err);
    return json({ error: "Could not create Stripe customer" }, 502);
  }

  const phSessionId = request.headers.get("X-PostHog-Session-Id") || undefined;
  const metadata: Record<string, string> = {
    type: "class_pack_purchase",
    organization_id: locals.organization.id,
    user_id: locals.user.id,
    family_member_id: child.id,
    pack_product_id: pack.id,
    // Storefront brand — host-derived, since both brands share one org.
    brand: brandFromHost(request.headers.get("host") ?? ""),
    // ga_client_id / gclid / fbclid / _fbc / _fbp / ph_distinct_id — read
    // back by the webhook for server-side GA4 + Meta purchases and to join
    // the PostHog funnel the anonymous browsing session started.
    ...collectAdAttribution(url, request.headers.get("cookie")),
    ...(phSessionId ? { ph_session_id: phSessionId } : {}),
  };

  // Request origin, not PUBLIC_APP_URL — Stripe must return the customer to
  // the domain they bought from (brand host).
  const appUrl = url.origin;

  try {
    const session = await stripe.checkout.sessions.create(
      {
        mode: "payment",
        customer: customerId,
        // Deliberately `price_data` off the DB row, never the pack's stored
        // `stripePriceId`: a one-time payment needs no stored Price, and
        // charging one would let the Stripe-side amount drift from the
        // `priceCents` the Connect application fee below is computed from.
        // One source of truth for both. (`stripeProductId`/`stripePriceId`
        // stay on the row for catalog reconciliation/reporting.)
        line_items: [
          {
            quantity: 1,
            price_data: {
              currency: "usd",
              unit_amount: pack.priceCents,
              product_data: {
                name: pack.name,
                description: `${pack.sessionCount} class credits · expires in ${pack.expiryMonths} months`,
              },
            },
          },
        ],
        payment_intent_data: {
          description: `${pack.name} — ${pack.sessionCount} class credits`,
          ...(partnerStripeAccountId
            ? {
                application_fee_amount: Math.round(
                  (pack.priceCents * PLATFORM_FEE_PCT) / 100,
                ),
                transfer_data: { destination: partnerStripeAccountId },
              }
            : {}),
        },
        metadata,
        success_url: `${appUrl}/dashboard/family?pack=success&child=${child.id}`,
        cancel_url: `${appUrl}/youth/classes?pack=cancelled`,
      },
      {
        // A double-clicked "Buy" reuses the same Checkout Session inside
        // Stripe's 24h window instead of minting a second one. Fingerprints
        // the pack row's `updatedAt` too: Stripe rejects a reused key whose
        // params changed, and price is not the only pack field that reaches
        // the Checkout params — `pack.name` and `pack.sessionCount`/
        // `expiryMonths` all feed line_items/product_data above. Keying on
        // the row's mutation timestamp covers every one of them at once, so
        // ANY admin edit mid-window mints a fresh key instead of 502-ing a
        // legitimate retry.
        idempotencyKey: `${locals.user.id}:${child.id}:${pack.id}:${pack.priceCents}:${pack.updatedAt.getTime()}:class-pack-checkout:v1`,
      },
    );

    if (!session.url) {
      console.error("[classes/packs/purchase] Checkout Session has no URL", session.id);
      return json({ error: "Could not start checkout" }, 502);
    }
    return json({ url: session.url, checkoutSessionId: session.id }, 200);
  } catch (err) {
    console.error("[classes/packs/purchase] checkout create failed", err);
    return json({ error: "Could not start checkout" }, 502);
  }
};
