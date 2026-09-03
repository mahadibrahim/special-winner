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
import { getDb } from "@/lib/db";
import { classEnrollments, classSlotTemplates } from "@/lib/db/schema/classes";
import { memberships, membershipTiers } from "@/lib/db/schema/memberships";
import { membershipsStripe } from "./stripe";
import { captureServerException } from "@/lib/observability/server-error";

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
    // Nothing to sync: no subscription (shouldn't happen for live rows), no
    // configured supplement price, or an unlimited tier (premium included).
    if (!row?.stripeSubscriptionId || !row.technicalPriceId) return;
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

    const s = membershipsStripe();
    const items = await s.subscriptionItems.list({
      subscription: row.stripeSubscriptionId,
      limit: 100,
    });
    const existing = items.data.find(
      (i) => i.price.id === row.technicalPriceId,
    );

    if (existing && quantity === 0) {
      await s.subscriptionItems.del(existing.id);
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
