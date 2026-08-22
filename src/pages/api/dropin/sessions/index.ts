/**
 * GET /api/dropin/sessions
 *
 * Customer-facing list endpoint for the browse page. Returns scheduled
 * sessions for the current host org over a window of upcoming days, with
 * optional filters (date, sport, skill, venue, audience).
 *
 * Confirmed-count is computed inline so the UI can render a capacity meter
 * without a follow-up call. Pricing is NOT applied per-user here — the UI
 * shows the public default rate from the rate card, and the per-user rate
 * is resolved on the detail page (where we know the auth context).
 *
 * Multi-tenant: scoped to `locals.organization.id` set by the host
 * resolver in middleware. No org context → 400.
 */
import type { APIRoute } from "astro";
import { and, asc, eq, gte, lte, sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import {
  dropInSessions,
  dropInBookings,
  dropInRateCard,
} from "@/lib/db/schema/drop-in";
import { venues } from "@/lib/db/schema/teams";
import { locations } from "@/lib/db/schema/organizations";

export const prerender = false;

const json = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

const DEFAULT_WINDOW_DAYS = 14;

export const GET: APIRoute = async ({ url, locals }) => {
  const orgId = locals.organization?.id;
  if (!orgId) return json({ error: "No organization context" }, 400);

  const db = getDb();

  // Filters from querystring.
  const sport = url.searchParams.get("sport");
  const skill = url.searchParams.get("skill");
  const venueId = url.searchParams.get("venue");
  // Filter to sessions whose venue belongs to this location slug (e.g.
  // 'worthington' | 'downtown'). Backs the pickup-page facility tabs.
  const location = url.searchParams.get("location");
  const audience = url.searchParams.get("audience");
  const fromIso = url.searchParams.get("from");
  const toIso = url.searchParams.get("to");

  const now = new Date();
  const fromDate = fromIso ? new Date(fromIso) : now;
  const toDate = toIso
    ? new Date(toIso)
    : new Date(now.getTime() + DEFAULT_WINDOW_DAYS * 24 * 60 * 60 * 1000);

  const conds = [
    eq(dropInSessions.organizationId, orgId),
    eq(dropInSessions.status, "scheduled"),
    gte(dropInSessions.startsAt, fromDate),
    lte(dropInSessions.startsAt, toDate),
  ];
  if (sport) conds.push(eq(dropInSessions.sportOrClassLabel, sport));
  if (skill) conds.push(sql`${dropInSessions.skillLevel}::text = ${skill}`);
  if (venueId) conds.push(eq(dropInSessions.venueId, venueId));
  if (location) conds.push(eq(locations.slug, location));
  if (audience) conds.push(sql`${dropInSessions.audience}::text = ${audience}`);

  const rows = await db
    .select({
      id: dropInSessions.id,
      kind: dropInSessions.kind,
      sportOrClassLabel: dropInSessions.sportOrClassLabel,
      formatLabel: dropInSessions.formatLabel,
      startsAt: dropInSessions.startsAt,
      endsAt: dropInSessions.endsAt,
      capacity: dropInSessions.capacity,
      skillLevel: dropInSessions.skillLevel,
      audience: dropInSessions.audience,
      membersOnly: dropInSessions.membersOnly,
      sessionRateCents: dropInSessions.sessionRateCents,
      memberRateCents: dropInSessions.memberRateCents,
      venueId: dropInSessions.venueId,
      venueName: venues.name,
      // #456: the pickup card's VenueLink renders a real link the moment a
      // slug arrives — this was the missing piece (the locations join was
      // already here for the ?location filter).
      locationSlug: locations.slug,
      // Includes pending_payment (walk-in holds) and pending_claim (promoted
      // waitlisters) — both occupy a real seat until the expiry sweep
      // releases them, so the browse list's capacity meter/badge would
      // otherwise show open spots that aren't really open. Mirrors the
      // same fix in dropin/sessions/[id].ts.
      confirmedCount: sql<number>`(
        SELECT COUNT(*)::int
        FROM ${dropInBookings}
        WHERE ${dropInBookings.sessionId} = ${dropInSessions.id}
          AND ${dropInBookings.status} IN ('confirmed', 'pending_payment', 'pending_claim')
      )`,
    })
    .from(dropInSessions)
    .leftJoin(venues, eq(venues.id, dropInSessions.venueId))
    .leftJoin(locations, eq(locations.id, venues.locationId))
    .where(and(...conds))
    .orderBy(asc(dropInSessions.startsAt));

  // Default rate card values for the public price chip.
  const [rateCard] = await db
    .select({
      defaultSessionRateCents: dropInRateCard.defaultSessionRateCents,
      defaultMemberRateCents: dropInRateCard.defaultMemberRateCents,
      fillAlertThresholdPct: dropInRateCard.fillAlertThresholdPct,
      fillAlertWindowHours: dropInRateCard.fillAlertWindowHours,
    })
    .from(dropInRateCard)
    .where(eq(dropInRateCard.organizationId, orgId))
    .limit(1);

  return json(
    {
      sessions: rows,
      defaults: rateCard ?? null,
    },
    200,
  );
};
