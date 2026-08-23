/**
 * GET /api/public/class-schedule
 *
 * Anonymous, org-resolved (via `locals.organization`, set by domain
 * middleware) read endpoint feeding Plan 3's public class-browsing UI.
 * Two independent lists, both org-scoped:
 *
 * - `slots` — every ACTIVE `class_slot_templates` row, with `enrolledCount`
 *   (active `class_enrollments`) and derived `spotsLeft`. `locationName`
 *   resolves `venues.locationId → locations.name`; `venueName` is the
 *   venue's own name. Templates carry `venueId` (not `locationId` — see
 *   the doc comment on `classSlotTemplates`), so both names are surfaced
 *   and the caller chooses which to render.
 * - `sessions` — materialized `drop_in_sessions` rows (`kind='class'`,
 *   `status='scheduled'`) starting in the next 14 days, with `bookedCount`
 *   using the SAME seat-occupying status set as `checkSessionCapacityLocked`
 *   (src/lib/dropin/booking.ts): confirmed, pending_payment, pending_claim.
 *
 * Both counts are grouped queries (one round trip per count, keyed by the
 * ids already fetched) — never N+1 per row.
 */
import type { APIRoute } from "astro";
import { and, asc, count, eq, gte, inArray, lt } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { classSlotTemplates, classEnrollments } from "@/lib/db/schema/classes";
import { dropInSessions, dropInBookings } from "@/lib/db/schema/drop-in";
import { venues } from "@/lib/db/schema/teams";
import { locations } from "@/lib/db/schema/organizations";

export const prerender = false;

const json = (body: unknown, status: number, extraHeaders?: Record<string, string>) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...extraHeaders },
  });

/** Seat-occupying booking statuses — mirrors checkSessionCapacityLocked's
 *  gate exactly (src/lib/dropin/booking.ts): a seat is occupied by a
 *  confirmed booking, a walk-in mid-payment hold, or a waitlist promotion
 *  inside its claim window. Waitlisted itself does NOT occupy a seat. */
const SEAT_OCCUPYING_STATUS_LIST = ["confirmed", "pending_payment", "pending_claim"] as const;

export const GET: APIRoute = async ({ locals }) => {
  const organization = locals.organization;
  if (!organization) {
    return json({ error: "Organization context required" }, 400);
  }

  const db = getDb();

  // --- Slots: active templates + resolved venue/location names. ---
  const templates = await db
    .select({
      id: classSlotTemplates.id,
      name: classSlotTemplates.name,
      sportLabel: classSlotTemplates.sportLabel,
      weekday: classSlotTemplates.weekday,
      startTime: classSlotTemplates.startTime,
      durationMins: classSlotTemplates.durationMins,
      minAge: classSlotTemplates.minAge,
      maxAge: classSlotTemplates.maxAge,
      capacity: classSlotTemplates.capacity,
      venueName: venues.name,
      locationName: locations.name,
    })
    .from(classSlotTemplates)
    .innerJoin(venues, eq(venues.id, classSlotTemplates.venueId))
    .innerJoin(locations, eq(locations.id, venues.locationId))
    .where(
      and(
        eq(classSlotTemplates.organizationId, organization.id),
        eq(classSlotTemplates.active, true),
      ),
    )
    .orderBy(asc(classSlotTemplates.weekday), asc(classSlotTemplates.startTime));

  const templateIds = templates.map((t) => t.id);
  const enrolledCountRows = templateIds.length
    ? await db
        .select({ slotTemplateId: classEnrollments.slotTemplateId, n: count() })
        .from(classEnrollments)
        .where(
          and(
            inArray(classEnrollments.slotTemplateId, templateIds),
            eq(classEnrollments.status, "active"),
          ),
        )
        .groupBy(classEnrollments.slotTemplateId)
    : [];
  const enrolledCountMap = new Map(enrolledCountRows.map((r) => [r.slotTemplateId, r.n]));

  const slots = templates.map((t) => {
    const enrolledCount = enrolledCountMap.get(t.id) ?? 0;
    return {
      templateId: t.id,
      name: t.name,
      sportLabel: t.sportLabel,
      weekday: t.weekday,
      startTime: t.startTime,
      durationMins: t.durationMins,
      minAge: t.minAge,
      maxAge: t.maxAge,
      locationName: t.locationName,
      venueName: t.venueName,
      capacity: t.capacity,
      enrolledCount,
      spotsLeft: Math.max(t.capacity - enrolledCount, 0),
    };
  });

  // --- Sessions: next-14-days scheduled class sessions + booked counts. ---
  const now = new Date();
  const in14Days = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000);

  const sessionRows = await db
    .select({
      id: dropInSessions.id,
      templateId: dropInSessions.classSlotTemplateId,
      startsAt: dropInSessions.startsAt,
      endsAt: dropInSessions.endsAt,
      capacity: dropInSessions.capacity,
    })
    .from(dropInSessions)
    .where(
      and(
        eq(dropInSessions.organizationId, organization.id),
        eq(dropInSessions.kind, "class"),
        eq(dropInSessions.status, "scheduled"),
        gte(dropInSessions.startsAt, now),
        lt(dropInSessions.startsAt, in14Days),
      ),
    )
    .orderBy(asc(dropInSessions.startsAt));

  const sessionIds = sessionRows.map((s) => s.id);
  const bookedCountRows = sessionIds.length
    ? await db
        .select({ sessionId: dropInBookings.sessionId, n: count() })
        .from(dropInBookings)
        .where(
          and(
            inArray(dropInBookings.sessionId, sessionIds),
            inArray(dropInBookings.status, [...SEAT_OCCUPYING_STATUS_LIST]),
          ),
        )
        .groupBy(dropInBookings.sessionId)
    : [];
  const bookedCountMap = new Map(bookedCountRows.map((r) => [r.sessionId, r.n]));

  const sessions = sessionRows.map((s) => {
    const bookedCount = bookedCountMap.get(s.id) ?? 0;
    return {
      id: s.id,
      templateId: s.templateId,
      startsAt: s.startsAt,
      endsAt: s.endsAt,
      capacity: s.capacity,
      bookedCount,
      spotsLeft: Math.max(s.capacity - bookedCount, 0),
    };
  });

  return json({ slots, sessions }, 200, { "Cache-Control": "public, max-age=60" });
};
