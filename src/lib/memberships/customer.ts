/**
 * Which Stripe customer belongs to a user — the two questions every
 * membership/class purchase path and the billing portal have to answer.
 *
 * WHY THIS EXISTS. `getOrCreateStripeCustomer` de-duplicates via a stable
 * idempotency key (`<userId>:stripe-customer:v1`), but Stripe expires
 * idempotency keys after 24 HOURS. So a parent who subscribes a second child
 * (or buys a pack) more than a day after the first got a brand-new Stripe
 * customer, and their subscriptions fanned out across several customers —
 * staging shows exactly that divergence. Callers must therefore pass
 * `existingCustomerId` from the DB; the 24h key only collapses double-clicks.
 *
 * Two distinct resolutions, deliberately not one function:
 *   - {@link findMembershipStripeCustomerId} — CONVERGENCE. What a purchase
 *     endpoint feeds to `getOrCreateStripeCustomer` so every future
 *     subscription lands on the customer the user already has.
 *   - {@link resolveBillingPortalCustomerId} — TARGETING. Which customer the
 *     billing portal should open. Prefers a `past_due` membership's customer
 *     over the newest-any, because the whole point of the portal is fixing
 *     the card that FAILED, and with historical fan-out the newest row's
 *     customer may hold no failing subscription at all.
 *
 * Both use an explicit `orderBy(desc(createdAt))` — the shared CI/staging DB
 * accumulates rows, and an unordered "pick a row" silently drifts.
 */
import { and, desc, eq, isNotNull } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { memberships } from "@/lib/db/schema/memberships";

/**
 * Newest Stripe customer id on any of the user's membership rows, or null.
 * Pass this as `existingCustomerId` to `getOrCreateStripeCustomer` so
 * subsequent purchases converge on one customer per parent.
 */
export async function findMembershipStripeCustomerId(
  userId: string,
): Promise<string | null> {
  const [row] = await getDb()
    .select({ stripeCustomerId: memberships.stripeCustomerId })
    .from(memberships)
    .where(
      and(eq(memberships.userId, userId), isNotNull(memberships.stripeCustomerId)),
    )
    .orderBy(desc(memberships.createdAt))
    .limit(1);
  return row?.stripeCustomerId ?? null;
}

/**
 * The customer whose billing portal the user should land in: the newest
 * `past_due` membership's customer if there is one, else the newest customer
 * on any row. See the module header for why past_due wins.
 */
export async function resolveBillingPortalCustomerId(
  userId: string,
): Promise<string | null> {
  const db = getDb();
  const [failing] = await db
    .select({ stripeCustomerId: memberships.stripeCustomerId })
    .from(memberships)
    .where(
      and(
        eq(memberships.userId, userId),
        eq(memberships.status, "past_due"),
        isNotNull(memberships.stripeCustomerId),
      ),
    )
    .orderBy(desc(memberships.createdAt))
    .limit(1);
  if (failing?.stripeCustomerId) return failing.stripeCustomerId;

  return findMembershipStripeCustomerId(userId);
}
