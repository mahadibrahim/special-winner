/**
 * GET /api/dropin/sessions/:id
 *
 * Detail endpoint for the session detail page. Returns:
 *   - the session row
 *   - venue name + venue id
 *   - confirmed count + waitlist count
 *   - rate-card defaults (cancel window, promo window, default rates)
 *   - per-user resolved price IF the request is authenticated
 *
 * The per-user resolved price is what the BookButton displays. Anonymous
 * visitors see the public session rate.
 */
import type { APIRoute } from "astro";
import { and, eq, sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import {
  dropInSessions,
  dropInBookings,
  dropInRateCard,
} from "@/lib/db/schema/drop-in";
import { venues } from "@/lib/db/schema/teams";
import { resolveRate } from "@/lib/dropin/pricing";
import { getActiveMembershipForUser } from "@/lib/dropin/booking";

export const prerender = false;

const json = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

export const GET: APIRoute = async ({ params, locals }) => {
  const sessionId = params.id;
  if (!sessionId) return json({ error: "session id required" }, 400);

  const db = getDb();
  const [row] = await db
    .select({
      session: dropInSessions,
      venueName: venues.name,
    })
    .from(dropInSessions)
    .leftJoin(venues, eq(venues.id, dropInSessions.venueId))
    .where(eq(dropInSessions.id, sessionId))
    .limit(1);

  if (!row) return json({ error: "Session not found" }, 404);

  // Multi-tenant guard.
  if (locals.organization && row.session.organizationId !== locals.organization.id) {
    return json({ error: "Forbidden" }, 403);
  }

  const [counts] = await db
    .select({
      confirmedCount: sql<number>`COUNT(*) FILTER (WHERE status = 'confirmed')::int`,
      waitlistCount: sql<number>`COUNT(*) FILTER (WHERE status IN ('waitlisted', 'pending_claim'))::int`,
    })
    .from(dropInBookings)
    .where(eq(dropInBookings.sessionId, sessionId));

  const [rateCard] = await db
    .select()
    .from(dropInRateCard)
    .where(eq(dropInRateCard.organizationId, row.session.organizationId))
    .limit(1);

  // Resolve per-user rate when authenticated.
  let resolvedAmountCents: number | null = null;
  let resolvedPaymentMethod: string | null = null;
  let alreadyBookedStatus: string | null = null;
  if (locals.user && rateCard) {
    const membership = await getActiveMembershipForUser(
      locals.user.id,
      row.session.organizationId,
    );
    const rate = resolveRate(row.session, locals.user, membership, rateCard);
    resolvedAmountCents = rate.amountCents;
    resolvedPaymentMethod = rate.paymentMethod;

    // Active booking lookup so the UI can switch the CTA from "Book" to
    // "View / Cancel".
    const [existing] = await db
      .select({ status: dropInBookings.status })
      .from(dropInBookings)
      .where(
        and(
          eq(dropInBookings.sessionId, sessionId),
          eq(dropInBookings.userId, locals.user.id),
        ),
      )
      .orderBy(dropInBookings.createdAt)
      .limit(1);
    if (
      existing &&
      ["confirmed", "waitlisted", "pending_claim"].includes(existing.status)
    ) {
      alreadyBookedStatus = existing.status;
    }
  }

  return json(
    {
      session: row.session,
      venueName: row.venueName,
      confirmedCount: counts?.confirmedCount ?? 0,
      waitlistCount: counts?.waitlistCount ?? 0,
      rateCard,
      resolvedAmountCents,
      resolvedPaymentMethod,
      alreadyBookedStatus,
    },
    200,
  );
};
