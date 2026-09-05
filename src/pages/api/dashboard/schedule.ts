/**
 * GET /api/dashboard/schedule
 *
 * Authed parent endpoint — dated schedule events for every child of the
 * caller, for the family dashboard's schedule view. Two sources merged by
 * `buildClassScheduleEvents` (src/lib/dashboard/schedule-events.ts):
 *
 *  - Booked: confirmed, future `kind='class'` `drop_in_sessions` the child
 *    already holds a seat in. These only exist inside the materialization
 *    cron's `HORIZON_DAYS` window (8 days — src/lib/classes/materialize.ts),
 *    since that's the only mechanism that creates them.
 *  - Projected: the child's standing weekly enrollment recurrence, projected
 *    out to `horizonDays` (60, well beyond the booked horizon) from
 *    `weekday`/`startTime` in the org's timezone. Marked `projected: true`;
 *    `bookingId: null` since there's no seat to cancel yet.
 *
 * League games/practices are OUT OF SCOPE for this endpoint today — `type`
 * is always `"class"` for every event it emits. `FamilyScheduleEvent`'s
 * wider union exists so the client type already covers league events once a
 * later pass adds them; this endpoint must never fabricate them from season
 * start dates in the meantime.
 *
 * Query shape mirrors GET /api/classes/summary: children fetched once
 * (capped + most-recently-added-first, same MAX_CHILDREN rationale as that
 * endpoint), then booked/enrollment rows fetched as two batched queries
 * keyed by `inArray(childId, ...)` rather than per-child loops.
 */
import type { APIRoute } from "astro";
import { and, desc, eq, gt, inArray } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { familyMembers } from "@/lib/db/schema/registrations";
import { classEnrollments, classSlotTemplates } from "@/lib/db/schema/classes";
import { dropInBookings, dropInSessions } from "@/lib/db/schema/drop-in";
import { venues } from "@/lib/db/schema/teams";
import { ORG_DEFAULT_TIMEZONE } from "@/lib/time/zoned-day";
import { buildClassScheduleEvents } from "@/lib/dashboard/schedule-events";

export const prerender = false;

const json = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

/** Same bound and rationale as summary.ts's MAX_CHILDREN — families are
 *  small in practice; this keeps the query shape finite. */
const MAX_CHILDREN = 20;

/** Well beyond the 8-day materialization horizon, so most of what this
 *  endpoint returns is a projection, not a booked seat. */
const HORIZON_DAYS = 60;

export const GET: APIRoute = async ({ locals }) => {
  if (!locals.user) return json({ error: "Unauthorized" }, 401);
  if (!locals.organization) return json({ error: "No organization context" }, 400);

  const organizationId = locals.organization.id;
  const timezone = locals.organization.timezone ?? ORG_DEFAULT_TIMEZONE;
  const db = getDb();

  // Most-recently-added first — same MAX_CHILDREN + ordering rationale as
  // GET /api/classes/summary (see that file's doc comment): an oldest-first
  // cap would silently drop a freshly-added child for any account past the
  // bound.
  const children = await db
    .select({
      id: familyMembers.id,
      firstName: familyMembers.firstName,
      lastName: familyMembers.lastName,
    })
    .from(familyMembers)
    .where(eq(familyMembers.parentUserId, locals.user.id))
    .orderBy(desc(familyMembers.createdAt))
    .limit(MAX_CHILDREN);

  if (children.length === 0) {
    return json({ children: [], events: [] }, 200);
  }

  const childIds = children.map((c) => c.id);
  const childNameById = new Map(children.map((c) => [c.id, `${c.firstName} ${c.lastName}`]));

  const now = new Date();

  // Booked: confirmed, future class-session seats. Venue and duration come
  // straight off the session row (venueId is NOT NULL on drop_in_sessions,
  // and formatLabel is stamped with the template's name at materialization
  // time — see materialize.ts — so no template join is needed here, same
  // as summary.ts's next-session query).
  const bookedRows = await db
    .select({
      bookingId: dropInBookings.id,
      sessionId: dropInSessions.id,
      startsAt: dropInSessions.startsAt,
      endsAt: dropInSessions.endsAt,
      templateName: dropInSessions.formatLabel,
      templateId: dropInSessions.classSlotTemplateId,
      childId: dropInBookings.familyMemberId,
      venueName: venues.name,
      venueAddress: venues.address,
    })
    .from(dropInBookings)
    .innerJoin(dropInSessions, eq(dropInSessions.id, dropInBookings.sessionId))
    .innerJoin(venues, eq(venues.id, dropInSessions.venueId))
    .where(
      and(
        inArray(dropInBookings.familyMemberId, childIds),
        eq(dropInBookings.status, "confirmed"),
        eq(dropInSessions.kind, "class"),
        eq(dropInSessions.organizationId, organizationId),
        gt(dropInSessions.startsAt, now),
      ),
    );

  const bookedSessions = bookedRows
    .filter((r): r is typeof r & { childId: string } => r.childId !== null)
    .map((r) => ({
      bookingId: r.bookingId,
      sessionId: r.sessionId,
      startsAt: r.startsAt,
      durationMinutes: Math.round((r.endsAt.getTime() - r.startsAt.getTime()) / 60_000),
      // formatLabel is nullable in the schema (pickup sessions never set
      // it); every class-materialized session does, but fall back rather
      // than surface a blank title in the unlikely case one doesn't.
      templateName: r.templateName ?? "Class",
      templateId: r.templateId,
      childId: r.childId,
      childName: childNameById.get(r.childId) ?? "",
      venueName: r.venueName,
      venueAddress: r.venueAddress,
    }));

  // Enrollments: active standing weekly slots, same join shape as
  // summary.ts's enrollment query, plus durationMins and the venue for
  // display.
  const enrollmentRows = await db
    .select({
      enrollmentId: classEnrollments.id,
      childId: classEnrollments.familyMemberId,
      templateName: classSlotTemplates.name,
      templateId: classSlotTemplates.id,
      weekday: classSlotTemplates.weekday,
      startTime: classSlotTemplates.startTime,
      durationMins: classSlotTemplates.durationMins,
      venueName: venues.name,
      venueAddress: venues.address,
    })
    .from(classEnrollments)
    .innerJoin(classSlotTemplates, eq(classSlotTemplates.id, classEnrollments.slotTemplateId))
    .innerJoin(venues, eq(venues.id, classSlotTemplates.venueId))
    .where(
      and(
        inArray(classEnrollments.familyMemberId, childIds),
        eq(classEnrollments.status, "active"),
        eq(classSlotTemplates.organizationId, organizationId),
      ),
    );

  const enrollments = enrollmentRows.map((r) => ({
    enrollmentId: r.enrollmentId,
    childId: r.childId,
    childName: childNameById.get(r.childId) ?? "",
    templateName: r.templateName,
    templateId: r.templateId,
    weekday: r.weekday,
    startTime: r.startTime,
    durationMinutes: r.durationMins,
    timezone,
    venueName: r.venueName,
    venueAddress: r.venueAddress,
  }));

  const events = buildClassScheduleEvents({
    bookedSessions,
    enrollments,
    from: now,
    horizonDays: HORIZON_DAYS,
  });

  return json(
    {
      children: children.map((c) => ({ id: c.id, name: `${c.firstName} ${c.lastName}` })),
      events,
    },
    200,
  );
};
