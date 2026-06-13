/**
 * POST /api/drop/cancel
 *
 * Body: { dropSubscriptionId: string }
 *
 * Loads the dropSubscriptions row (must be owned by the authenticated user and
 * belong to the resolved org). Calls cancelSubscriptionAtPeriodEnd on Stripe,
 * then marks cancelAtPeriodEnd = true in the DB. Status transitions to
 * "cancelled" via the webhook when the period actually ends.
 */
import type { APIRoute } from "astro";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { dropSubscriptions } from "@/lib/db/schema/drop-league";
import { cancelSubscriptionAtPeriodEnd } from "@/lib/memberships/stripe";

export const prerender = false;

const json = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

export const POST: APIRoute = async ({ request, locals }) => {
  if (!locals.user) return json({ error: "Unauthorized" }, 401);
  if (!locals.organization)
    return json({ error: "No organization context" }, 400);

  let body: { dropSubscriptionId?: unknown };
  try {
    body = await request.json();
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }

  const dropSubscriptionId =
    typeof body.dropSubscriptionId === "string"
      ? body.dropSubscriptionId
      : null;
  if (!dropSubscriptionId) {
    return json({ error: "dropSubscriptionId is required" }, 422);
  }

  const db = getDb();

  // Tenant + ownership scoped lookup. Another user's sub, or a sub from
  // another org, both return 404 — do not leak existence.
  const [sub] = await db
    .select()
    .from(dropSubscriptions)
    .where(
      and(
        eq(dropSubscriptions.id, dropSubscriptionId),
        eq(dropSubscriptions.userId, locals.user.id),
        eq(dropSubscriptions.organizationId, locals.organization.id),
      ),
    )
    .limit(1);
  if (!sub) return json({ error: "Subscription not found" }, 404);

  if (sub.stripeSubscriptionId) {
    try {
      await cancelSubscriptionAtPeriodEnd(sub.stripeSubscriptionId);
    } catch (err) {
      console.error("[drop/cancel] Stripe cancel failed", err);
      return json({ error: "Could not cancel subscription" }, 502);
    }
  }

  await db
    .update(dropSubscriptions)
    .set({
      cancelAtPeriodEnd: true,
      updatedAt: new Date(),
    })
    .where(eq(dropSubscriptions.id, dropSubscriptionId));

  return json({ ok: true }, 200);
};
