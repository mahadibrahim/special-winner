/**
 * Webhook fulfillment for class-credit PURCHASES (packs today; blocks are
 * added alongside this in the block-purchase task).
 *
 * Same shape as src/lib/memberships/webhook-handlers.ts: the checkout
 * endpoint creates nothing in our DB, and the `class_credit_grants` row is
 * written here on `checkout.session.completed`. Nothing is granted until
 * Stripe says the money moved, and an abandoned Checkout leaves no orphan.
 *
 * Idempotent: `class_credit_grants.stripe_checkout_session_id` carries a
 * UNIQUE index, so a redelivered webhook hits `ON CONFLICT DO NOTHING` and
 * no-ops instead of double-granting. The stripe_events ledger upstream is
 * the primary dedupe; this is the belt-and-braces second one, and the only
 * one that survives a ledger release-on-error retry.
 */
import type Stripe from "stripe";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { classCreditGrants, classPackProducts } from "@/lib/db/schema/classes";
import { normalizeBrand } from "@/lib/organization/soccerone-routing";
import { capturePaymentCompleted } from "@/lib/observability/payment-telemetry";
import { fireServerPurchaseConversions } from "@/lib/analytics/server-conversions";
import { captureServerException } from "@/lib/observability/server-error";
import { sendOpsPing } from "@/lib/ops/ping";

/**
 * Add `months` CALENDAR months to an instant, computed off its UTC parts.
 *
 * JS `Date.UTC` normalizes day overflow, so a purchase on Aug 31 with a
 * 6-month expiry lands on Mar 2 (or Mar 3 in a leap year) rather than a
 * non-existent Feb 31. That normalization is accepted: it always rolls
 * FORWARD, i.e. never shortens what the customer paid for, and the
 * alternative (clamping to the last day of the target month) would buy a
 * one-day difference for real complexity.
 */
function addCalendarMonthsUtc(from: Date, months: number): Date {
  return new Date(
    Date.UTC(
      from.getUTCFullYear(),
      from.getUTCMonth() + months,
      from.getUTCDate(),
      from.getUTCHours(),
      from.getUTCMinutes(),
      from.getUTCSeconds(),
      from.getUTCMilliseconds(),
    ),
  );
}

/**
 * `checkout.session.completed` for `mode === 'payment'` with
 * `metadata.type === 'class_pack_purchase'` (stamped by
 * POST /api/classes/packs/purchase). Grants the pack's sessions to the child
 * named in the metadata, expiring `expiryMonths` calendar months out.
 *
 * Every guard below returns silently rather than throwing: a throw releases
 * the stripe_events claim and makes Stripe redeliver forever, which is the
 * wrong response to a session we simply can't fulfill (bad metadata, deleted
 * pack). The error log is the signal.
 */
export async function handleClassPackPurchaseComplete(
  session: Stripe.Checkout.Session,
): Promise<void> {
  if (session.mode !== "payment") return;
  if (session.metadata?.type !== "class_pack_purchase") return;

  const md = session.metadata;
  const organizationId = md.organization_id;
  const userId = md.user_id;
  const familyMemberId = md.family_member_id;
  const packProductId = md.pack_product_id;
  if (!organizationId || !userId || !familyMemberId || !packProductId) {
    // Money moved and nothing was granted — the console line alone dies in
    // the function log, so this branch also needs to reach error tracking.
    console.error("[classes/pack-purchase] missing metadata on session", session.id);
    void captureServerException(
      new Error("class_pack_purchase session missing required metadata"),
      {
        component: "classes/purchase-webhooks",
        metadata: {
          checkout_session_id: session.id,
          organization_id: organizationId ?? null,
          user_id: userId ?? null,
          family_member_id: familyMemberId ?? null,
          pack_product_id: packProductId ?? null,
        },
      },
    );
    return;
  }

  const db = getDb();

  // Tenant-pinned pack read: the pack must belong to the org the session was
  // created under, so a tampered/stale metadata pairing can never mint
  // credits off another tenant's product. `expiryMonths` and `sessionCount`
  // are read HERE (not carried in metadata) so the grant reflects the
  // catalog as it stands at fulfillment.
  const [pack] = await db
    .select({
      id: classPackProducts.id,
      name: classPackProducts.name,
      sessionCount: classPackProducts.sessionCount,
      priceCents: classPackProducts.priceCents,
      expiryMonths: classPackProducts.expiryMonths,
    })
    .from(classPackProducts)
    .where(
      and(
        eq(classPackProducts.id, packProductId),
        eq(classPackProducts.organizationId, organizationId),
      ),
    )
    .limit(1); // primary-key lookup — at most one row
  if (!pack) {
    // Paid-for pack that no longer resolves (deleted, or metadata pointing
    // at another tenant's row): same money-moved-nothing-happened shape as
    // the metadata branch above, so it gets the same visibility.
    console.error(
      `[classes/pack-purchase] pack ${packProductId} not found in org ${organizationId} for session ${session.id}`,
    );
    void captureServerException(
      new Error("class_pack_purchase pack not resolvable at fulfillment"),
      {
        component: "classes/purchase-webhooks",
        metadata: {
          checkout_session_id: session.id,
          organization_id: organizationId,
          pack_product_id: packProductId,
          family_member_id: familyMemberId,
        },
      },
    );
    return;
  }

  // What was actually charged, not the list price — a Stripe-side coupon or
  // a price edit between checkout and fulfillment must not be misrecorded.
  const amountCents = session.amount_total ?? pack.priceCents;

  const inserted = await db
    .insert(classCreditGrants)
    .values({
      organizationId,
      familyMemberId,
      source: "pack",
      packProductId: pack.id,
      blockId: null,
      // Pack credits float: any class session, not pinned to a weekly slot.
      slotTemplateId: null,
      sessionsGranted: pack.sessionCount,
      pricePaidCents: amountCents,
      expiresAt: addCalendarMonthsUtc(new Date(), pack.expiryMonths),
      stripeCheckoutSessionId: session.id,
    })
    .onConflictDoNothing({ target: classCreditGrants.stripeCheckoutSessionId })
    .returning({ id: classCreditGrants.id });

  // Only fire revenue analytics + ad conversions on the genuine first insert,
  // never on a redelivery that hit the ON CONFLICT no-op.
  if (inserted.length === 0) return;

  const grantId = inserted[0].id;
  const brand = normalizeBrand(md.brand);
  const buyerLabel = session.customer_details?.email ?? session.customer_email ?? userId;

  await sendOpsPing(organizationId, {
    kind: "class_pack_purchased",
    brand,
    eventId: grantId,
    label: `${buyerLabel} · ${pack.name} (${pack.sessionCount} classes)`,
    amountCents,
  });

  capturePaymentCompleted({
    distinctId: userId,
    clientDistinctId: md.ph_distinct_id,
    sessionId: md.ph_session_id,
    kind: "class_pack",
    amountCents,
    brand,
    organizationId,
    metadata: {
      grant_id: grantId,
      pack_product_id: pack.id,
      family_member_id: familyMemberId,
      sessions_granted: pack.sessionCount,
      checkout_session_id: session.id,
    },
  });

  // Ad-attributable online purchase. Payment-mode sessions do have a
  // PaymentIntent, but the Checkout Session id is what the success page's
  // browser pixel can see, so it stays the shared dedup key. Hashed email
  // alone is a sufficient Meta match key, so fire even without click ids —
  // same rule as the membership handler.
  const customerEmail = session.customer_details?.email ?? session.customer_email ?? null;
  const hasConversionSignal =
    md.ga_client_id || md.fbclid || md._fbc || md._fbp || customerEmail;
  if (hasConversionSignal) {
    fireServerPurchaseConversions({
      metadata: md,
      eventId: session.id,
      valueCents: amountCents,
      brand,
      email: customerEmail,
      phone: session.customer_details?.phone ?? null,
      userId,
      ga4Items: [
        { id: pack.id, name: pack.name, category: "Class pack", priceCents: amountCents },
      ],
      ga4PaymentType: "full",
      contentIds: [pack.id],
      contentName: pack.name,
      contentCategory: "class_pack",
    });
  }
}
