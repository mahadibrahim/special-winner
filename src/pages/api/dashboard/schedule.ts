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
 * A third leg (Task 3) adds league games for children rostered on a team:
 * children → confirmed(-or-otherwise; no status filter, see below)
 * `registrations` → `rosters` → `games` where either side is a rostered
 * team, org-scoped via `games.seasonId → seasons → programs →
 * locations.organizationId`. ALL game statuses are included — a cancelled
 * or postponed game still surfaces (with its `status`) rather than being
 * silently dropped; the client renders the status chip. `type` is `"game"`
 * for these; `FamilyScheduleEvent`'s wider union (`"practice"` /
 * `"tournament"`) remains unused until a later pass.
 *
 * Query shape mirrors GET /api/classes/summary: children fetched once
 * (capped + most-recently-added-first, same MAX_CHILDREN rationale as that
 * endpoint), then booked/enrollment/roster/game rows fetched as batched
 * queries keyed by `inArray(...)` rather than per-child loops.
 */
import type { APIRoute } from "astro";
import { and, desc, eq, gt, inArray, or } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { familyMembers, registrations } from "@/lib/db/schema/registrations";
import { classEnrollments, classSlotTemplates } from "@/lib/db/schema/classes";
import { dropInBookings, dropInSessions } from "@/lib/db/schema/drop-in";
import { games, rosters, teams, venues } from "@/lib/db/schema/teams";
import { programs, seasons } from "@/lib/db/schema/programs";
import { locations } from "@/lib/db/schema/organizations";
import { ORG_DEFAULT_TIMEZONE } from "@/lib/time/zoned-day";
import { buildClassScheduleEvents, buildLeagueGameEvents } from "@/lib/dashboard/schedule-events";

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

  const classEvents = buildClassScheduleEvents({
    bookedSessions,
    enrollments,
    from: now,
    horizonDays: HORIZON_DAYS,
  });

  // League games: children -> registrations -> rosters -> teams. NO
  // roster-status filter, matching the adult path (play-teams.ts) — v1
  // shows all rostered teams regardless of roster status.
  const regRows = await db
    .select({ id: registrations.id, childId: registrations.familyMemberId })
    .from(registrations)
    .where(inArray(registrations.familyMemberId, childIds));
  const childIdByRegId = new Map(regRows.map((r) => [r.id, r.childId]));
  const regIds = regRows.map((r) => r.id);

  const rosterRows =
    regIds.length > 0
      ? await db
          .select({ teamId: rosters.teamId, registrationId: rosters.registrationId })
          .from(rosters)
          .where(inArray(rosters.registrationId, regIds))
      : [];

  // Which of the caller's children sit on each rostered team — a team can
  // map to more than one child when siblings share a team.
  const childIdsByTeamId = new Map<string, Set<string>>();
  for (const r of rosterRows) {
    const childId = childIdByRegId.get(r.registrationId);
    if (!childId) continue;
    const set = childIdsByTeamId.get(r.teamId) ?? new Set<string>();
    set.add(childId);
    childIdsByTeamId.set(r.teamId, set);
  }
  const rosteredTeamIds = [...childIdsByTeamId.keys()];

  // Future games on any rostered team, org-scoped via
  // seasons -> programs -> locations. ALL statuses included — cancelled and
  // postponed games still surface with their status (see module doc).
  const gameRows =
    rosteredTeamIds.length > 0
      ? await db
          .select({
            id: games.id,
            homeTeamId: games.homeTeamId,
            awayTeamId: games.awayTeamId,
            venueId: games.venueId,
            fieldNumber: games.fieldNumber,
            scheduledAt: games.scheduledAt,
            durationMinutes: games.durationMinutes,
            status: games.status,
          })
          .from(games)
          .innerJoin(seasons, eq(games.seasonId, seasons.id))
          .innerJoin(programs, eq(seasons.programId, programs.id))
          .innerJoin(locations, eq(programs.locationId, locations.id))
          .where(
            and(
              eq(locations.organizationId, organizationId),
              gt(games.scheduledAt, now),
              or(inArray(games.homeTeamId, rosteredTeamIds), inArray(games.awayTeamId, rosteredTeamIds)),
            ),
          )
      : [];

  // Batched lookups: team names (both sides, so a rostered team's own name
  // and its opponent's are both resolved in one query) and venue name/address.
  const allTeamIds = [
    ...new Set(
      gameRows.flatMap((g) => [g.homeTeamId, g.awayTeamId]).filter((id): id is string => id !== null),
    ),
  ];
  const teamNameById = new Map<string, string>();
  if (allTeamIds.length > 0) {
    const teamRows = await db.select({ id: teams.id, name: teams.name }).from(teams).where(inArray(teams.id, allTeamIds));
    for (const t of teamRows) teamNameById.set(t.id, t.name);
  }

  const gameVenueIds = [...new Set(gameRows.map((g) => g.venueId).filter((id): id is string => id !== null))];
  const gameVenueById = new Map<string, { name: string; address: string | null }>();
  if (gameVenueIds.length > 0) {
    const venueRows = await db
      .select({ id: venues.id, name: venues.name, address: venues.address })
      .from(venues)
      .where(inArray(venues.id, gameVenueIds));
    for (const v of venueRows) gameVenueById.set(v.id, { name: v.name, address: v.address });
  }

  // One event per (game, rostered child) — a game where both teams carry a
  // caller's child (rare intra-family matchup) emits once per child, each
  // with their own team as `teamName`.
  const leagueGameInputs = gameRows.flatMap((g) => {
    const sides = [
      { teamId: g.homeTeamId, opponentId: g.awayTeamId },
      { teamId: g.awayTeamId, opponentId: g.homeTeamId },
    ];
    const venue = g.venueId ? gameVenueById.get(g.venueId) : undefined;
    return sides.flatMap(({ teamId, opponentId }) => {
      if (!teamId) return [];
      const rosteredChildIds = childIdsByTeamId.get(teamId);
      if (!rosteredChildIds) return [];
      const teamName = teamNameById.get(teamId) ?? "Team";
      const opponentName = opponentId ? (teamNameById.get(opponentId) ?? null) : null;
      return [...rosteredChildIds].map((childId) => ({
        gameId: g.id,
        scheduledAt: g.scheduledAt,
        durationMinutes: g.durationMinutes,
        status: g.status,
        fieldNumber: g.fieldNumber,
        childId,
        childName: childNameById.get(childId) ?? "",
        teamName,
        opponentName,
        venueName: venue?.name ?? null,
        venueAddress: venue?.address ?? null,
      }));
    });
  });

  const gameEvents = buildLeagueGameEvents({ games: leagueGameInputs });

  const events = [...classEvents, ...gameEvents].sort((a, b) => a.startsAt.localeCompare(b.startsAt));

  return json(
    {
      children: children.map((c) => ({ id: c.id, name: `${c.firstName} ${c.lastName}` })),
      events,
    },
    200,
  );
};
