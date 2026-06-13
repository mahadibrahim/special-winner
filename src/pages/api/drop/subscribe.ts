/**
 * POST /api/drop/subscribe
 *
 * Body: { dropPlayerId: string }
 *
 * Resolves the dropPlayers row (tenant-scoped), links the authenticated user
 * to the player row if not already linked, gets-or-creates a Stripe Customer,
 * and creates a Drop League Checkout Session (subscription mode with a
 * one-time registration fee). Returns { url } — the caller redirects to it.
 *
 * The dropSubscriptions row is inserted on checkout.session.completed in the
 * webhook — no orphan rows on abandonment (mirrors the memberships pattern).
 */
import type { APIRoute } from "astro";
import { and, desc, eq, inArray } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { dropPlayers, dropSubscriptions } from "@/lib/db/schema/drop-league";
import { users } from "@/lib/db/schema/users";
import {
  createDropCheckoutSession,
  getOrCreateStripeCustomer,
} from "@/lib/drop-league/stripe";

export const prerender = false;

const json = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

export const POST: APIRoute = async ({ request, locals, url }) => {
  if (!locals.user) return json({ error: "Unauthorized" }, 401);
  if (!locals.organization)
    return json({ error: "No organization context" }, 400);

  let body: { dropPlayerId?: unknown };
  try {
    body = await request.json();
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }

  const dropPlayerId =
    typeof body.dropPlayerId === "string" ? body.dropPlayerId : null;
  if (!dropPlayerId) {
    return json({ error: "dropPlayerId is required" }, 422);
  }

  const db = getDb();

  // Tenant-scoped player lookup. A player from another org returns 404 —
  // do not leak whether the id exists in some other tenant.
  const [player] = await db
    .select()
    .from(dropPlayers)
    .where(
      and(
        eq(dropPlayers.id, dropPlayerId),
        eq(dropPlayers.organizationId, locals.organization.id),
      ),
    )
    .limit(1);
  if (!player) return json({ error: "Player not found" }, 404);

  // Ownership: if the player row is already claimed by a different user, refuse
  // — otherwise user B could pay to subscribe into user A's registration.
  if (player.userId && player.userId !== locals.user.id) {
    return json({ error: "Forbidden" }, 403);
  }

  // Double-subscribe guard: never start a second checkout while a live
  // subscription exists for this player — Stripe's idempotency key only covers
  // a 24h window, so a later re-click would otherwise bill a second $99 + $25.
  const [liveSub] = await db
    .select({ id: dropSubscriptions.id })
    .from(dropSubscriptions)
    .where(
      and(
        eq(dropSubscriptions.dropPlayerId, player.id),
        inArray(dropSubscriptions.status, ["active", "paused", "past_due"]),
      ),
    )
    .limit(1);
  if (liveSub) {
    return json({ error: "Player already has an active subscription" }, 409);
  }

  // Link the authenticated user to the player row if not already set.
  if (!player.userId) {
    await db
      .update(dropPlayers)
      .set({ userId: locals.user.id })
      .where(eq(dropPlayers.id, dropPlayerId));
  }

  // Fetch full user record for email/name — locals.user may be trimmed.
  const [userRow] = await db
    .select({ email: users.email, firstName: users.firstName })
    .from(users)
    .where(eq(users.id, locals.user.id))
    .limit(1);
  if (!userRow) return json({ error: "User not found" }, 404);

  // Look for an existing Stripe customer id on a prior drop subscription for
  // this user — reuse it to avoid creating duplicate Stripe customers.
  const [existingSub] = await db
    .select({ stripeCustomerId: dropSubscriptions.stripeCustomerId })
    .from(dropSubscriptions)
    .where(eq(dropSubscriptions.userId, locals.user.id))
    .orderBy(desc(dropSubscriptions.createdAt))
    .limit(1);
  const existingCustomerId = existingSub?.stripeCustomerId ?? null;

  let customerId: string;
  try {
    customerId = await getOrCreateStripeCustomer({
      userId: locals.user.id,
      email: userRow.email,
      name: userRow.firstName,
      existingCustomerId,
    });
  } catch (err) {
    console.error("[drop/subscribe] customer create failed", err);
    return json({ error: "Could not create Stripe customer" }, 502);
  }

  // Use request origin so Stripe redirects land on the brand host the customer
  // subscribed from (mirrors memberships/subscribe.ts pattern).
  const appUrl = url.origin;

  try {
    const session = await createDropCheckoutSession({
      customerId,
      dropPlayerId: player.id,
      dropSeasonId: player.dropSeasonId,
      organizationId: player.organizationId,
      userId: locals.user.id,
      successUrl: `${appUrl}/drop-league/welcome`,
      cancelUrl: `${appUrl}/drop-league/register`,
    });
    return json({ url: session.url }, 200);
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Could not start checkout";
    const isConfig = message.includes("price IDs are not configured");
    console.error("[drop/subscribe] checkout create failed", err);
    return json({ error: isConfig ? message : "Could not start checkout" }, isConfig ? 400 : 502);
  }
};
