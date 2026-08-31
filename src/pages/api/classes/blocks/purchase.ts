/**
 * POST /api/classes/blocks/purchase
 *
 * Body: { blockId, slotTemplateId, familyMemberId }
 * → 200 { url, remainingSessions, totalCents } — a Stripe Checkout (payment
 *   mode) URL to redirect to, plus the quote it was created from.
 *
 * Buys ONE child into ONE weekly slot for the remainder of a fixed-term
 * block. The price is PRORATED: a family joining mid-term pays only for the
 * sessions still to come (`remaining × rate`), computed here from the block
 * window and the slot's weekday/wall-clock in the org timezone — never from
 * anything the client sent.
 *
 * Nothing is written here. The `class_credit_grants` row (pinned to this
 * slot, expiring at the block's end) and the credit-backed
 * `class_enrollments` row are both inserted by
 * `handleClassBlockPurchaseComplete` on `checkout.session.completed`, so an
 * abandoned checkout leaves no orphan seat. Same shape as
 * /api/classes/packs/purchase — tenant-scoped lookups, child-ownership
 * check, get-or-create Stripe Customer, request-origin redirects, brand from
 * host, ad-attribution ids threaded through metadata.
 *
 * The success page (/dashboard/family/choose-slot) is where the guardian
 * waiver is captured and this week's session booked; the daily materialize
 * cron books the rest. The webhook deliberately books nothing — no waiver
 * exists at fulfillment time.
 */
import type { APIRoute } from "astro";
import { and, count, eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { classBlocks, classEnrollments, classSlotTemplates } from "@/lib/db/schema/classes";
import { organizations } from "@/lib/db/schema/organizations";
import { users } from "@/lib/db/schema/users";
import { familyMembers } from "@/lib/db/schema/registrations";
import { blockOccurrenceInstants } from "@/lib/classes/block-occurrences";
import { getOrCreateStripeCustomer } from "@/lib/memberships/stripe";
import { stripe } from "@/lib/stripe/client";
import { brandFromHost } from "@/lib/organization/soccerone-routing";
import { collectAdAttribution } from "@/lib/analytics/parse-cookies";
import { dateInTimeZone } from "@/lib/time/format-date";
import { ORG_DEFAULT_TIMEZONE } from "@/lib/time/zoned-day";

export const prerender = false;

/** Platform cut on Connect-routed orgs — matches memberships/rentals/packs. */
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

  let body: { blockId?: unknown; slotTemplateId?: unknown; familyMemberId?: unknown };
  try {
    body = await request.json();
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }

  const blockId = typeof body.blockId === "string" ? body.blockId : null;
  const slotTemplateId = typeof body.slotTemplateId === "string" ? body.slotTemplateId : null;
  const familyMemberId = typeof body.familyMemberId === "string" ? body.familyMemberId : null;
  if (!blockId || !slotTemplateId || !familyMemberId) {
    return json(
      { error: "blockId, slotTemplateId and familyMemberId are required" },
      422,
    );
  }
  // A malformed uuid literal makes Postgres throw ("invalid input syntax for
  // type uuid"), which would surface as a 500 instead of a clean 4xx.
  if (!UUID_RX.test(blockId)) return json({ error: "Block not found" }, 404);
  if (!UUID_RX.test(slotTemplateId)) return json({ error: "Class not found" }, 404);
  if (!UUID_RX.test(familyMemberId)) return json({ error: "Invalid familyMemberId" }, 422);

  const db = getDb();

  // `locals.organization` is the full `organizations` row (see env.d.ts), so
  // the zone is already in hand — no join needed here (the WEBHOOK, which has
  // no locals, does have to join for it).
  const timeZone = locals.organization.timezone ?? ORG_DEFAULT_TIMEZONE;
  const today = dateInTimeZone(timeZone);

  // Tenant-scoped block lookup. Inactive, ended, or another tenant's block all
  // collapse to 404 — never leak whether an id exists elsewhere.
  const [block] = await db
    .select({
      id: classBlocks.id,
      name: classBlocks.name,
      startDate: classBlocks.startDate,
      endDate: classBlocks.endDate,
    })
    .from(classBlocks)
    .where(
      and(
        eq(classBlocks.id, blockId),
        eq(classBlocks.organizationId, locals.organization.id),
        eq(classBlocks.active, true),
      ),
    )
    .limit(1); // primary-key lookup — at most one row
  // Civil dates, both "YYYY-MM-DD" — lexical order is chronological.
  if (!block || block.endDate < today) return json({ error: "Block not found" }, 404);

  const [template] = await db
    .select({
      id: classSlotTemplates.id,
      name: classSlotTemplates.name,
      weekday: classSlotTemplates.weekday,
      startTime: classSlotTemplates.startTime,
      capacity: classSlotTemplates.capacity,
      sessionRateCents: classSlotTemplates.sessionRateCents,
      blockRateCents: classSlotTemplates.blockRateCents,
    })
    .from(classSlotTemplates)
    .where(
      and(
        eq(classSlotTemplates.id, slotTemplateId),
        eq(classSlotTemplates.organizationId, locals.organization.id),
        eq(classSlotTemplates.active, true),
      ),
    )
    .limit(1); // primary-key lookup — at most one row
  if (!template) return json({ error: "Class not found" }, 404);

  // The child must be the caller's dependent. 404 (not 403) so the response
  // is identical whether the id is unknown or someone else's.
  const [child] = await db
    .select({ id: familyMembers.id })
    .from(familyMembers)
    .where(
      and(eq(familyMembers.id, familyMemberId), eq(familyMembers.parentUserId, locals.user.id)),
    )
    .limit(1); // primary-key lookup — at most one row
  if (!child) return json({ error: "Family member not found" }, 404);

  // Block rate first, per-session rate as the fallback (same precedence the
  // public catalog quotes with). Both null = half-configured catalog row: the
  // only remaining fallback is the ADULT pickup rate card, and quoting that
  // for a kids' block is exactly the failure this code refuses to ship.
  const rateCents = template.blockRateCents ?? template.sessionRateCents;
  if (rateCents === null || rateCents <= 0) {
    return json(
      {
        error: "class_rate_not_configured",
        message: "This class has no block price configured yet",
      },
      409,
    );
  }

  // Proration. `blockOccurrenceInstants` walks civil days through `Intl` in
  // the org zone, so a window straddling a DST transition counts correctly.
  // It throws only on a malformed date string; `class_blocks.startDate/endDate`
  // are Postgres `date` columns, so that cannot happen from a clean read.
  const remainingSessions = blockOccurrenceInstants({
    weekday: template.weekday,
    startTime: template.startTime,
    timeZone,
    startDate: block.startDate,
    endDate: block.endDate,
    after: new Date(),
  }).length;
  // A block can still be RUNNING (`endDate >= today`) while this slot's last
  // occurrence has already passed — the public catalog lists that state so the
  // UI can explain it, and the purchase endpoint refuses it. Never trust the
  // client's quote; nothing is left to sell.
  if (remainingSessions === 0) {
    return json(
      { error: "block_over", message: "This class has no sessions left in the current block" },
      409,
    );
  }

  // Capacity — enrollment is a standing SEAT, so the gate is the same active-
  // enrollment count `enrollChild` and the catalog's `spotsLeft` use. Checked
  // here (pre-payment) as the honest answer to the customer; the webhook does
  // NOT re-check it, because refusing a seat after the money moved is worse
  // than overselling by one under a race.
  const [seatRow] = await db
    .select({ c: count() })
    .from(classEnrollments)
    .where(
      and(
        eq(classEnrollments.slotTemplateId, template.id),
        eq(classEnrollments.status, "active"),
      ),
    );
  if ((seatRow?.c ?? 0) >= template.capacity) {
    return json({ error: "template_full", message: "This class is full" }, 409);
  }

  const [existing] = await db
    .select({ id: classEnrollments.id })
    .from(classEnrollments)
    .where(
      and(
        eq(classEnrollments.slotTemplateId, template.id),
        eq(classEnrollments.familyMemberId, child.id),
        eq(classEnrollments.status, "active"),
      ),
    )
    .limit(1);
  if (existing) {
    return json(
      { error: "already_enrolled", message: "This child already has a seat in this class" },
      409,
    );
  }

  const totalCents = remainingSessions * rateCents;

  if (!stripe) return json({ error: "Stripe not configured" }, 503);

  // Connect-aware, resolved at org level (blocks are org-scoped terms). Null
  // falls through to a direct platform charge.
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
    console.error("[classes/blocks/purchase] customer create failed", err);
    return json({ error: "Could not create Stripe customer" }, 502);
  }

  const phSessionId = request.headers.get("X-PostHog-Session-Id") || undefined;
  const metadata: Record<string, string> = {
    type: "class_block_purchase",
    organization_id: locals.organization.id,
    user_id: locals.user.id,
    family_member_id: child.id,
    block_id: block.id,
    slot_template_id: template.id,
    // The COUNT is carried (the price is not): the webhook must grant exactly
    // what was paid for, and re-deriving the count at fulfillment time would
    // quietly shrink the grant every time a session passed between checkout
    // and the webhook landing.
    sessions_granted: String(remainingSessions),
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

  const sessionsLabel = remainingSessions === 1 ? "session" : "sessions";

  try {
    const session = await stripe.checkout.sessions.create(
      {
        mode: "payment",
        customer: customerId,
        // `price_data` off the server-computed total, never a stored Price:
        // the amount is a function of `now` (proration), and it must be the
        // one source of truth the Connect application fee below is derived
        // from too.
        line_items: [
          {
            quantity: 1,
            price_data: {
              currency: "usd",
              unit_amount: totalCents,
              product_data: {
                name: `${template.name} — ${block.name} (${remainingSessions} ${sessionsLabel})`,
                description: `Weekly seat through ${block.endDate} · $${(rateCents / 100).toFixed(2)} per session`,
              },
            },
          },
        ],
        payment_intent_data: {
          description: `${template.name} — ${block.name} (${remainingSessions} ${sessionsLabel})`,
          ...(partnerStripeAccountId
            ? {
                application_fee_amount: Math.round((totalCents * PLATFORM_FEE_PCT) / 100),
                transfer_data: { destination: partnerStripeAccountId },
              }
            : {}),
        },
        metadata,
        success_url: `${appUrl}/dashboard/family/choose-slot?child=${child.id}&block=success&slot=${template.id}`,
        cancel_url: `${appUrl}/youth/classes?block=cancelled`,
      },
      {
        // A double-clicked "Buy" reuses the same Checkout Session inside
        // Stripe's 24h window instead of minting a second one. The total is
        // part of the fingerprint, so once a session passes and the price
        // legitimately drops, the next attempt gets a fresh key rather than
        // Stripe rejecting the changed params.
        idempotencyKey: `${locals.user.id}:${child.id}:${block.id}:${template.id}:${totalCents}:class-block-checkout:v1`,
      },
    );

    if (!session.url) {
      console.error("[classes/blocks/purchase] Checkout Session has no URL", session.id);
      return json({ error: "Could not start checkout" }, 502);
    }
    return json(
      {
        url: session.url,
        checkoutSessionId: session.id,
        remainingSessions,
        totalCents,
      },
      200,
    );
  } catch (err) {
    console.error("[classes/blocks/purchase] checkout create failed", err);
    return json({ error: "Could not start checkout" }, 502);
  }
};
