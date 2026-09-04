/**
 * Keeps a membership's Stripe subscription add-on item ("technical training
 * supplement") in step with reality: quantity = the child's count of ACTIVE
 * technical enrollments backed by that membership.
 *
 * BEST-EFFORT BY DESIGN: called post-commit after enrollment mutations. A
 * Stripe failure must never undo a seat the family already holds — it logs,
 * captures, and leaves the next mutation (or a manual fix) to reconcile.
 * Proration uses Stripe's default (create_prorations) so mid-cycle changes
 * bill fairly without extra machinery.
 */
import { and, count, eq } from "drizzle-orm";
import type Stripe from "stripe";
import { getDb } from "@/lib/db";
import { classEnrollments, classSlotTemplates } from "@/lib/db/schema/classes";
import { memberships, membershipTiers } from "@/lib/db/schema/memberships";
import { membershipsStripe } from "./stripe";
import { captureServerException } from "@/lib/observability/server-error";

/** Metadata key stamped on every technical-supplement Price by
 *  `createTechnicalPrice` (admin-stripe.ts) — the durable identifier for
 *  "this subscription item is the technical add-on" across a $ edit, which
 *  replaces the Price id underneath it. */
export const TECHNICAL_SUPPLEMENT_KIND = "technical_supplement";

/**
 * Finds the subscription item backing the technical-training supplement,
 * independent of which Price id it currently points at. Matches primarily
 * by the `technical_supplement` metadata stamp; falls back to a same-id
 * match against `currentPriceId` for items created before the stamp
 * existed (metadata is nullable/undefined on old Prices). Pure — no Stripe
 * calls — so it's unit-testable against plain fixture objects.
 */
export function findTechnicalAddonItem(
  items: Stripe.SubscriptionItem[],
  currentPriceId: string | null,
): Stripe.SubscriptionItem | undefined {
  return items.find(
    (i) =>
      i.price.metadata?.kind === TECHNICAL_SUPPLEMENT_KIND ||
      (currentPriceId != null && i.price.id === currentPriceId),
  );
}

export async function syncTechnicalAddonQuantity(membershipId: string): Promise<void> {
  try {
    const db = getDb();
    const [row] = await db
      .select({
        stripeSubscriptionId: memberships.stripeSubscriptionId,
        technicalPriceId: membershipTiers.stripePriceIdTechnical,
        benefits: membershipTiers.benefits,
      })
      .from(memberships)
      .innerJoin(membershipTiers, eq(membershipTiers.id, memberships.tierId))
      .where(eq(memberships.id, membershipId))
      .limit(1);
    // Nothing to sync: no subscription (shouldn't happen for live rows).
    if (!row?.stripeSubscriptionId) return;

    const s = membershipsStripe();

    // The tier no longer configures a technical supplement (removed by an
    // admin edit) — there is no current price to sync toward, but a
    // lingering subscription item from before the removal must still be
    // stripped, or the family keeps being billed for an add-on the tier no
    // longer offers.
    if (!row.technicalPriceId) {
      const items = await s.subscriptionItems.list({
        subscription: row.stripeSubscriptionId,
        limit: 100,
      });
      const existing = findTechnicalAddonItem(items.data, null);
      if (existing) await s.subscriptionItems.del(existing.id);
      return;
    }

    const benefits = (row.benefits ?? {}) as Record<string, unknown>;
    if (benefits.unlimited_classes === true) return;

    const [cnt] = await db
      .select({ c: count() })
      .from(classEnrollments)
      .innerJoin(
        classSlotTemplates,
        eq(classSlotTemplates.id, classEnrollments.slotTemplateId),
      )
      .where(
        and(
          eq(classEnrollments.membershipId, membershipId),
          eq(classEnrollments.status, "active"),
          eq(classSlotTemplates.isTechnical, true),
        ),
      );
    const quantity = cnt?.c ?? 0;

    const items = await s.subscriptionItems.list({
      subscription: row.stripeSubscriptionId,
      limit: 100,
    });
    const existing = findTechnicalAddonItem(items.data, row.technicalPriceId);

    if (existing && quantity === 0) {
      await s.subscriptionItems.del(existing.id);
    } else if (existing && existing.price.id !== row.technicalPriceId) {
      // The tier's price was replaced (a $ edit archives the old Price and
      // mints a new one) since this item was created/last synced. Move the
      // item onto the CURRENT price — leaving it pinned to the archived
      // price would make the next sync think no technical item exists and
      // create a second one, double-billing the family.
      await s.subscriptionItems.update(existing.id, {
        price: row.technicalPriceId,
        quantity,
      });
    } else if (existing && existing.quantity !== quantity) {
      await s.subscriptionItems.update(existing.id, { quantity });
    } else if (!existing && quantity > 0) {
      await s.subscriptionItems.create({
        subscription: row.stripeSubscriptionId,
        price: row.technicalPriceId,
        quantity,
      });
    }
  } catch (err) {
    console.error("[technical-addon] sync failed", { membershipId, err });
    await captureServerException(err, {
      component: "memberships/technical-addon-sync",
      metadata: { membershipId },
    });
  }
}
