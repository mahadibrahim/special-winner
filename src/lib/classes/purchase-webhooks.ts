/**
 * Webhook fulfillment for class-credit PURCHASES — packs (floating credits)
 * and blocks (credits PINNED to one weekly slot, plus the standing
 * enrollment in it).
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
import {
  classBlocks,
  classCreditGrants,
  classEnrollments,
  classPackProducts,
  classSlotTemplates,
} from "@/lib/db/schema/classes";
import { organizations } from "@/lib/db/schema/organizations";
import { blockExpiryInstant } from "./block-occurrences";
import { ORG_DEFAULT_TIMEZONE } from "@/lib/time/zoned-day";
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
 * Money moved and nothing was granted. The console line alone dies in the
 * function log, so every such branch also reaches error tracking — and every
 * one of them RETURNS rather than throwing: a throw releases the
 * stripe_events claim and makes Stripe redeliver forever, which is the wrong
 * response to a session we simply can't fulfill (bad metadata, deleted
 * pack/block). The error log is the signal.
 */
function reportUnfulfillable(
  message: string,
  logLine: string,
  metadata: Record<string, unknown>,
): void {
  console.error(logLine);
  void captureServerException(new Error(message), {
    component: "classes/purchase-webhooks",
    metadata,
  });
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
    reportUnfulfillable(
      "class_pack_purchase session missing required metadata",
      `[classes/pack-purchase] missing metadata on session ${session.id}`,
      {
        checkout_session_id: session.id,
        organization_id: organizationId ?? null,
        user_id: userId ?? null,
        family_member_id: familyMemberId ?? null,
        pack_product_id: packProductId ?? null,
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
    reportUnfulfillable(
      "class_pack_purchase pack not resolvable at fulfillment",
      `[classes/pack-purchase] pack ${packProductId} not found in org ${organizationId} for session ${session.id}`,
      {
        checkout_session_id: session.id,
        organization_id: organizationId,
        pack_product_id: packProductId,
        family_member_id: familyMemberId,
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

/**
 * `checkout.session.completed` for `mode === 'payment'` with
 * `metadata.type === 'class_block_purchase'` (stamped by
 * POST /api/classes/blocks/purchase). Two rows, one transaction:
 *
 *  1. a `class_credit_grants` row PINNED to the purchased slot
 *     (`source: 'block'`, `slotTemplateId` set), holding the prorated
 *     session count the customer paid for and expiring at the end of the
 *     block window (`blockExpiryInstant`);
 *  2. the credit-backed `class_enrollments` row that makes it a standing
 *     weekly seat — `membershipId: null`, `creditGrantId` pointing at (1).
 *
 * Deliberately does NOT book any sessions: no guardian waiver exists at this
 * point. The success page captures the waiver and books this week; the daily
 * materialize cron books the rest.
 *
 * Capacity is NOT re-checked here — the customer has paid, and refusing the
 * seat afterwards is worse than the accepted worst case of overselling by one
 * under a race. The ops ping is how that surfaces.
 *
 * Idempotent on two independent keys: the UNIQUE index on
 * `class_credit_grants.stripe_checkout_session_id` (a redelivery no-ops and
 * returns before the enrollment insert) and the partial unique index
 * `class_enrollments_one_active_per_child_template` (which also absorbs the
 * genuine case of a child who already holds this slot on a membership).
 */
export async function handleClassBlockPurchaseComplete(
  session: Stripe.Checkout.Session,
): Promise<void> {
  if (session.mode !== "payment") return;
  if (session.metadata?.type !== "class_block_purchase") return;

  const md = session.metadata;
  const organizationId = md.organization_id;
  const userId = md.user_id;
  const familyMemberId = md.family_member_id;
  const blockId = md.block_id;
  const slotTemplateId = md.slot_template_id;
  const sessionsGranted = Number(md.sessions_granted);
  if (
    !organizationId ||
    !userId ||
    !familyMemberId ||
    !blockId ||
    !slotTemplateId ||
    !Number.isInteger(sessionsGranted) ||
    sessionsGranted <= 0
  ) {
    reportUnfulfillable(
      "class_block_purchase session missing required metadata",
      `[classes/block-purchase] missing/invalid metadata on session ${session.id}`,
      {
        checkout_session_id: session.id,
        organization_id: organizationId ?? null,
        user_id: userId ?? null,
        family_member_id: familyMemberId ?? null,
        block_id: blockId ?? null,
        slot_template_id: slotTemplateId ?? null,
        sessions_granted: md.sessions_granted ?? null,
      },
    );
    return;
  }

  const db = getDb();

  // Tenant-pinned block read, joined to the org for its TIMEZONE — the grant's
  // expiry is a wall-clock instant (end of day on the block's last date) and
  // the webhook has no `locals.organization` to read the zone off. Same join
  // shape as the materialize cron.
  const [block] = await db
    .select({
      id: classBlocks.id,
      name: classBlocks.name,
      endDate: classBlocks.endDate,
      timeZone: organizations.timezone,
    })
    .from(classBlocks)
    .innerJoin(organizations, eq(organizations.id, classBlocks.organizationId))
    .where(and(eq(classBlocks.id, blockId), eq(classBlocks.organizationId, organizationId)))
    .limit(1); // primary-key lookup — at most one row
  if (!block) {
    reportUnfulfillable(
      "class_block_purchase block not resolvable at fulfillment",
      `[classes/block-purchase] block ${blockId} not found in org ${organizationId} for session ${session.id}`,
      {
        checkout_session_id: session.id,
        organization_id: organizationId,
        block_id: blockId,
        family_member_id: familyMemberId,
      },
    );
    return;
  }

  // Same tenant pin on the slot: a tampered/stale metadata pairing must never
  // enroll a child into another tenant's class.
  const [template] = await db
    .select({
      id: classSlotTemplates.id,
      name: classSlotTemplates.name,
      active: classSlotTemplates.active,
      sessionRateCents: classSlotTemplates.sessionRateCents,
      blockRateCents: classSlotTemplates.blockRateCents,
    })
    .from(classSlotTemplates)
    .where(
      and(
        eq(classSlotTemplates.id, slotTemplateId),
        eq(classSlotTemplates.organizationId, organizationId),
      ),
    )
    .limit(1); // primary-key lookup — at most one row
  if (!template) {
    reportUnfulfillable(
      "class_block_purchase slot template not resolvable at fulfillment",
      `[classes/block-purchase] template ${slotTemplateId} not found in org ${organizationId} for session ${session.id}`,
      {
        checkout_session_id: session.id,
        organization_id: organizationId,
        slot_template_id: slotTemplateId,
        block_id: blockId,
        family_member_id: familyMemberId,
      },
    );
    return;
  }

  // The endpoint refuses an inactive template, so this can only happen when
  // an admin retires the class between checkout and the webhook landing. The
  // money is taken, so we FULFILL anyway — but loudly: the materialize cron
  // skips inactive templates, so the family would otherwise sit on a paid
  // enrollment that silently never books, with nothing anywhere saying so.
  // A distinct error-tracking signal (not the generic unfulfillable one, which
  // means "nothing was written") is what makes it actionable.
  if (!template.active) {
    console.error(
      `[classes/block-purchase] template ${template.id} is INACTIVE but was paid for on session ${session.id} — fulfilling; the cron will not book this seat`,
    );
    void captureServerException(
      new Error("class_block_purchase fulfilled against a retired slot template"),
      {
        component: "classes/purchase-webhooks",
        metadata: {
          checkout_session_id: session.id,
          organization_id: organizationId,
          slot_template_id: template.id,
          block_id: block.id,
          family_member_id: familyMemberId,
        },
      },
    );
  }

  // `blockExpiryInstant` throws on a malformed date string. A `date` column
  // read can't produce one, but a permanent failure here must not become an
  // infinite Stripe retry loop — capture and stop, same as every other
  // unfulfillable branch.
  let expiresAt: Date;
  try {
    expiresAt = blockExpiryInstant(block.endDate, block.timeZone ?? ORG_DEFAULT_TIMEZONE);
  } catch (err) {
    reportUnfulfillable(
      "class_block_purchase could not resolve block expiry",
      `[classes/block-purchase] bad endDate ${block.endDate} on block ${blockId} for session ${session.id}`,
      {
        checkout_session_id: session.id,
        organization_id: organizationId,
        block_id: blockId,
        end_date: block.endDate,
        cause: err instanceof Error ? err.message : String(err),
      },
    );
    return;
  }

  // What was actually charged, not the quote — a Stripe-side coupon or a rate
  // edit between checkout and fulfillment must not be misrecorded. The rate
  // fallback only matters for a session that somehow carries no total.
  const rateCents = template.blockRateCents ?? template.sessionRateCents ?? 0;
  const amountCents = session.amount_total ?? sessionsGranted * rateCents;

  // Both rows or neither: an enrollment without its grant would violate the
  // membership-xor-grant CHECK, and a grant without its enrollment would leave
  // a paid-for family with credits but no standing seat.
  const grantId = await db.transaction(async (tx) => {
    const inserted = await tx
      .insert(classCreditGrants)
      .values({
        organizationId,
        familyMemberId,
        source: "block",
        packProductId: null,
        blockId: block.id,
        // Pinned: block credits only ever spend on their own weekly slot.
        slotTemplateId: template.id,
        sessionsGranted,
        pricePaidCents: amountCents,
        expiresAt,
        stripeCheckoutSessionId: session.id,
      })
      .onConflictDoNothing({ target: classCreditGrants.stripeCheckoutSessionId })
      .returning({ id: classCreditGrants.id });
    // Replay: the grant (and therefore the enrollment) already exist.
    if (inserted.length === 0) return null;

    await tx
      .insert(classEnrollments)
      .values({
        slotTemplateId: template.id,
        familyMemberId,
        // The nullable-membership column exists for exactly this: the seat is
        // paid for by the grant, not by a subscription.
        membershipId: null,
        creditGrantId: inserted[0].id,
        status: "active",
      })
      // The partial unique index absorbs both a concurrent duplicate and the
      // legitimate case of a child who already holds this slot (e.g. on a
      // membership) buying the block for it. The credits still land.
      .onConflictDoNothing();

    return inserted[0].id;
  });

  // Only fire revenue analytics + ad conversions on the genuine first insert,
  // never on a redelivery that hit the ON CONFLICT no-op.
  if (!grantId) return;

  const brand = normalizeBrand(md.brand);
  const buyerLabel = session.customer_details?.email ?? session.customer_email ?? userId;
  const sessionsLabel = sessionsGranted === 1 ? "session" : "sessions";

  await sendOpsPing(organizationId, {
    kind: "class_block_purchased",
    brand,
    eventId: grantId,
    label: `${buyerLabel} · ${template.name} — ${block.name} (${sessionsGranted} ${sessionsLabel})`,
    amountCents,
  });

  capturePaymentCompleted({
    distinctId: userId,
    clientDistinctId: md.ph_distinct_id,
    sessionId: md.ph_session_id,
    kind: "class_block",
    amountCents,
    brand,
    organizationId,
    metadata: {
      grant_id: grantId,
      block_id: block.id,
      slot_template_id: template.id,
      family_member_id: familyMemberId,
      sessions_granted: sessionsGranted,
      checkout_session_id: session.id,
    },
  });

  // Ad-attributable online purchase. Same rule as the pack handler: the
  // Checkout Session id is the shared dedup key with the success page's
  // browser pixel, and a hashed email alone is a sufficient Meta match key.
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
        {
          id: template.id,
          name: `${template.name} — ${block.name}`,
          category: "Class block",
          priceCents: amountCents,
        },
      ],
      ga4PaymentType: "full",
      contentIds: [template.id],
      contentName: `${template.name} — ${block.name}`,
      contentCategory: "class_block",
    });
  }
}
