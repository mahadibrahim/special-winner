/**
 * Camp day-session materialization + registration-backed auto-booking.
 *
 * Camps (Phase 4 keystone decision 1): each weekday of a camp season becomes
 * a real `drop_in_sessions` row with `kind='camp'` and `campSeasonId` set —
 * the venue command center's already-wired camp branch just needs the rows.
 * This module is the camp half of the daily materialization cron
 * (POST /api/cron/materialize-class-sessions) and deliberately mirrors
 * src/lib/classes/materialize.ts's two-pass structure:
 *
 *  1. Materialize — one `drop_in_sessions` row per Monday–Friday calendar
 *     day of every eligible camp season inside [now, now + HORIZON_DAYS],
 *     idempotent via `onConflictDoNothing` against the partial unique index
 *     `drop_in_sessions_one_per_camp_day` on (camp_season_id, starts_at).
 *     In the SAME transaction as each fresh insert, staffing is propagated:
 *     the union of the season's pod coaches (`teams` rows under the camp
 *     season — coachUserId → 'lead', assistantCoachUserId → 'assistant',
 *     deduped with lead winning) is copied onto the session as
 *     `coaching_assignments` rows with `kind='class_session'` (keystone
 *     decision 3: day-session staffing reuses the class_session kind — the
 *     staffing endpoints, coach reach, and org checks all target
 *     drop_in_sessions generically). The atomicity is the classes invariant,
 *     copied: a session that survived a failed coach-copy would stay
 *     unstaffed forever, because a skipped (already-materialized) day never
 *     re-propagates staffing — per-day overrides belong to the admin
 *     session-staffing endpoint, not this cron.
 *
 *  2. Auto-book — sweep EVERY still-relevant `scheduled` camp session of the
 *     season inside the horizon (not just ones inserted this run) and book
 *     every `confirmed` registration of the season that has no booking row
 *     yet. Same rationale as classes: a family that registers after this
 *     week's sessions were materialized must still get seated. Re-booking
 *     safety is the same any-status existence check — a `cancelled` booking
 *     row means the family explicitly opted that child out of that specific
 *     day (sick day, vacation) and must NOT be silently resurrected.
 *     Cancelled registrations never book; capacity is NOT enforced here
 *     (the registration flow already gated it — an over-capacity day-session
 *     would mean registration itself oversold, not a cron bug).
 *
 * Booking rows carry `paymentMethod='registration'` (paid via the camp
 * registration, $0 at session level), `source='auto_enrollment'`,
 * `userId=registrations.registeredByUserId`, `waiverSigned=false` (the
 * registration's waiver lives on the registration; the booking-level flag is
 * only ever a derived copy and must not fake a dated signature).
 *
 * Timezone: identical mechanism to the classes materializer — the owning
 * organization's `organizations.timezone` (resolved seasons → programs →
 * locations → organizations), falling back to ORG_DEFAULT_TIMEZONE, fed
 * through the shared DST-safe `zonedWallClockUtc` convergence.
 *
 * Error isolation matches classes: every per-day insert tx and per-session
 * booking tx is try/caught into `failed` so one blip never aborts the batch.
 */
import { and, eq, gt, gte, inArray, lte, sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { dropInSessions, dropInBookings } from "@/lib/db/schema/drop-in";
import { coachingAssignments } from "@/lib/db/schema/coaching";
import { programs, seasons } from "@/lib/db/schema/programs";
import { registrations } from "@/lib/db/schema/registrations";
import { organizations, locations } from "@/lib/db/schema/organizations";
import { teams } from "@/lib/db/schema/teams";
import { ORG_DEFAULT_TIMEZONE } from "@/lib/time/zoned-day";
import {
  HORIZON_DAYS,
  zonedWallClockUtc,
  civilPartsInTz,
  civilAddDays,
  type CivilDate,
} from "@/lib/classes/materialize";
import type { DropInTx } from "@/lib/dropin/booking";
import { captureServerException } from "@/lib/observability/server-error";

const DAY_MS = 86_400_000;

/** Wall-clock defaults when the season doesn't specify times — the owner's
 *  standard camp day. */
const DEFAULT_START_TIME = "09:00:00";
const DEFAULT_END_TIME = "15:00:00";

export interface CampMaterializeResult {
  sessionsCreated: number;
  autoBooked: number;
  /** Camp season ids skipped because `venueId` is null — drop_in_sessions
   *  requires a venue, so these cannot materialize until an admin sets one.
   *  Surfaced by Task 8's attention feed. */
  skippedNoVenue: string[];
  failed: number;
}

/** Parse "YYYY-MM-DD" (a Postgres `date` column as drizzle returns it). */
function parseCivilDate(iso: string): CivilDate {
  const [y, m, day] = iso.split("-").map(Number);
  return { y, m, day };
}

/** Parse a Postgres `time` string ("HH:MM" / "HH:MM:SS[.sss]") into [h, m, s]. */
function parseWallTime(t: string): [number, number, number] {
  const [h, m, s] = t.split(":");
  return [Number(h), Number(m), Number(s ?? 0)];
}

function civilUtcMs(civ: CivilDate): number {
  return Date.UTC(civ.y, civ.m - 1, civ.day);
}

/**
 * Every Monday–Friday calendar day within [startDate, endDate] ∩ [from, to],
 * as concrete {startsAt, endsAt} UTC instants at the season's wall-clock
 * times (defaults 09:00–15:00) in `timezone`.
 *
 * The [from, to] clamp is CIVIL-DAY granular in the org's timezone (both
 * endpoints inclusive): the cron materializes whole camp days, and a day
 * whose 9am start already passed when the cron fires must still exist —
 * the check-in board needs today's session, not just tomorrow's. Weekday
 * classification uses the same UTC-anchored civil arithmetic as the classes
 * materializer, so DST transitions inside the window never shift which
 * days are checked or what "9am" resolves to.
 */
export function campDayInstants(
  season: {
    startDate: string;
    endDate: string;
    startTime: string | null;
    endTime: string | null;
  },
  timezone: string,
  from: Date,
  to: Date,
): Array<{ startsAt: Date; endsAt: Date }> {
  const [sh, sm, ss] = parseWallTime(season.startTime ?? DEFAULT_START_TIME);
  const [eh, em, es] = parseWallTime(season.endTime ?? DEFAULT_END_TIME);

  const seasonStart = parseCivilDate(season.startDate);
  const seasonEnd = parseCivilDate(season.endDate);
  const fromCiv = civilPartsInTz(from, timezone);
  const toCiv = civilPartsInTz(to, timezone);

  const loMs = Math.max(civilUtcMs(seasonStart), civilUtcMs(fromCiv));
  const hiMs = Math.min(civilUtcMs(seasonEnd), civilUtcMs(toCiv));
  if (loMs > hiMs) return [];

  const lo = { y: 0, m: 0, day: 0 };
  {
    const d = new Date(loMs);
    lo.y = d.getUTCFullYear();
    lo.m = d.getUTCMonth() + 1;
    lo.day = d.getUTCDate();
  }
  const spanDays = Math.round((hiMs - loMs) / DAY_MS);

  const out: Array<{ startsAt: Date; endsAt: Date }> = [];
  for (let i = 0; i <= spanDays; i++) {
    const civ = civilAddDays(lo, i);
    const dow = new Date(civilUtcMs(civ)).getUTCDay();
    if (dow === 0 || dow === 6) continue; // camps run Monday-Friday only
    out.push({
      startsAt: zonedWallClockUtc(civ, sh, sm, ss, timezone),
      endsAt: zonedWallClockUtc(civ, eh, em, es, timezone),
    });
  }
  return out;
}

/**
 * Copies the union of the camp season's pod coaches onto a
 * freshly-materialized day-session, in the SAME transaction as the session
 * insert (see module header for the atomicity contract). Pods are ordinary
 * `teams` rows under the camp season; `coachUserId` carries role 'lead' and
 * `assistantCoachUserId` role 'assistant'. The same user appearing on
 * multiple pods is deduped, and lead wins over assistant. `onConflictDoNothing`
 * on (coach_user_id, kind, target_id) is defense in depth only — the
 * only-on-fresh-insert call-site guard is the real idempotency guarantee,
 * exactly as in copyTemplateCoachesToSession for classes.
 */
async function copyPodCoachesToSession(
  tx: DropInTx,
  organizationId: string,
  campSeasonId: string,
  sessionId: string,
): Promise<void> {
  const pods = await tx
    .select({ coachUserId: teams.coachUserId, assistantCoachUserId: teams.assistantCoachUserId })
    .from(teams)
    .where(eq(teams.seasonId, campSeasonId));

  // userId -> role, lead wins on conflict.
  const roleByCoach = new Map<string, "lead" | "assistant">();
  for (const pod of pods) {
    if (pod.assistantCoachUserId && roleByCoach.get(pod.assistantCoachUserId) !== "lead") {
      roleByCoach.set(pod.assistantCoachUserId, "assistant");
    }
    if (pod.coachUserId) roleByCoach.set(pod.coachUserId, "lead");
  }
  if (roleByCoach.size === 0) return;

  await tx
    .insert(coachingAssignments)
    .values(
      [...roleByCoach.entries()].map(([coachUserId, role]) => ({
        organizationId,
        coachUserId,
        kind: "class_session" as const,
        targetId: sessionId,
        role,
        active: true,
        createdByUserId: null,
      })),
    )
    .onConflictDoNothing({
      target: [coachingAssignments.coachUserId, coachingAssignments.kind, coachingAssignments.targetId],
    });
}

/**
 * For each eligible camp season (program_type='camp', status forming/open/
 * active, date range intersecting the horizon, venue set): (1) materialize a
 * `drop_in_sessions` row for every Mon–Fri camp day inside
 * [now, now + HORIZON_DAYS], each insert + its pod-coach staffing copy in one
 * transaction; then (2) sweep every still-relevant scheduled camp session of
 * the season in the horizon and auto-book every confirmed registration that
 * has no booking row for it yet. See the module header for the full contract.
 */
export async function materializeCampSessions(now: Date): Promise<CampMaterializeResult> {
  const db = getDb();
  const counters: CampMaterializeResult = {
    sessionsCreated: 0,
    autoBooked: 0,
    skippedNoVenue: [],
    failed: 0,
  };

  const horizonEnd = new Date(now.getTime() + HORIZON_DAYS * DAY_MS);

  // Candidate filter in SQL, widened by one day on each side: startDate/
  // endDate are CIVIL dates in the org's timezone, while these bounds come
  // from UTC instants — the ±1 day slack guarantees no boundary season is
  // missed regardless of zone offset. campDayInstants then clamps precisely
  // (and a season whose precise intersection is empty just yields no days).
  const loDateStr = new Date(now.getTime() - DAY_MS).toISOString().slice(0, 10);
  const hiDateStr = new Date(horizonEnd.getTime() + DAY_MS).toISOString().slice(0, 10);

  const campSeasons = await db
    .select({
      season: seasons,
      programName: programs.name,
      organizationId: locations.organizationId,
      orgTimezone: organizations.timezone,
    })
    .from(seasons)
    .innerJoin(programs, eq(programs.id, seasons.programId))
    .innerJoin(locations, eq(locations.id, programs.locationId))
    .innerJoin(organizations, eq(organizations.id, locations.organizationId))
    .where(
      and(
        eq(programs.programType, "camp"),
        inArray(seasons.status, ["forming", "open", "active"]),
        lte(seasons.startDate, hiDateStr),
        gte(seasons.endDate, loDateStr),
      ),
    );

  for (const { season, programName, organizationId, orgTimezone } of campSeasons) {
    const timezone = orgTimezone ?? ORG_DEFAULT_TIMEZONE;

    let days: Array<{ startsAt: Date; endsAt: Date }>;
    try {
      // campDayInstants clamps at civil-DAY granularity, so "today" is
      // included even when 9am already passed — a camp day in progress must
      // still materialize (the check-in board needs today's session). But a
      // day whose session already ENDED is dropped here: Pass 2 only books
      // sessions with endsAt > now, so materializing an already-over day
      // would mint a permanently unbookable ghost row. (In steady state this
      // never fires — the 8-day horizon materializes each day ~a week ahead;
      // it only matters for a season created mid-/late-day on day one.)
      days = campDayInstants(season, timezone, now, horizonEnd).filter((d) => d.endsAt > now);
    } catch (err) {
      console.error(`[camps] day-instant math failed for season ${season.id}:`, err);
      void captureServerException(err, {
        component: "camps/materialize",
        metadata: { season_id: season.id, phase: "day-math" },
      });
      counters.failed += 1;
      continue;
    }
    // Precise clamp says no camp days in the window (the SQL filter is
    // deliberately loose) — nothing to do, and not a "skip" worth reporting.
    if (days.length === 0) continue;

    if (!season.venueId) {
      // drop_in_sessions.venueId is NOT NULL — cannot materialize until an
      // admin assigns a venue. Reported for Task 8's attention feed.
      counters.skippedNoVenue.push(season.id);
      continue;
    }
    const venueId = season.venueId;

    // ---- Pass 1: materialize day-sessions (+ staffing, same tx) ----
    for (const { startsAt, endsAt } of days) {
      try {
        const insertedId: string | null = await db.transaction(async (tx) => {
          const [inserted] = await tx
            .insert(dropInSessions)
            .values({
              organizationId,
              venueId,
              bookableResourceId: null,
              kind: "camp",
              sportOrClassLabel: programName,
              formatLabel: season.name,
              startsAt,
              endsAt,
              capacity: season.maxParticipants ?? 200,
              audience: "youth",
              status: "scheduled",
              createdByUserId: null,
              campSeasonId: season.id,
            })
            .onConflictDoNothing({
              target: [dropInSessions.campSeasonId, dropInSessions.startsAt],
              where: sql`camp_season_id IS NOT NULL`,
            })
            .returning({ id: dropInSessions.id });

          if (inserted) {
            // Pod-coach staffing propagation — only on a session ACTUALLY
            // just created; a throw here rolls back the insert too (the
            // session+staffing atomicity invariant, see module header).
            await copyPodCoachesToSession(tx, organizationId, season.id, inserted.id);
          }
          return inserted?.id ?? null;
        });

        if (insertedId) counters.sessionsCreated += 1;
      } catch (err) {
        console.error(
          `[camps] day-session insert failed for season ${season.id} at ${startsAt.toISOString()}:`,
          err,
        );
        void captureServerException(err, {
          component: "camps/materialize",
          metadata: { season_id: season.id, starts_at: startsAt.toISOString(), phase: "session-insert" },
        });
        counters.failed += 1;
      }
    }

    // ---- Pass 2: auto-book sweep ----
    // ALL scheduled camp sessions of this season in the horizon — created
    // this run or by any prior run — so a family that registers after a day
    // was materialized still gets seated. `endsAt > now` (not `startsAt >
    // now`, which classes uses) because a camp day already underway when the
    // cron fires must still receive bookings: the check-in board needs
    // today's roster, not just tomorrow's.
    let sessionRows: Array<{ id: string }>;
    try {
      sessionRows = await db
        .select({ id: dropInSessions.id })
        .from(dropInSessions)
        .where(
          and(
            eq(dropInSessions.campSeasonId, season.id),
            eq(dropInSessions.status, "scheduled"),
            gt(dropInSessions.endsAt, now),
            lte(dropInSessions.startsAt, horizonEnd),
          ),
        );
    } catch (err) {
      console.error(`[camps] session sweep query failed for season ${season.id}:`, err);
      void captureServerException(err, {
        component: "camps/materialize",
        metadata: { season_id: season.id, phase: "sweep-query" },
      });
      counters.failed += 1;
      continue;
    }

    for (const session of sessionRows) {
      try {
        const booked = await db.transaction(async (tx) => {
          const confirmed = await tx
            .select({
              familyMemberId: registrations.familyMemberId,
              registeredByUserId: registrations.registeredByUserId,
            })
            .from(registrations)
            .where(
              and(eq(registrations.seasonId, season.id), eq(registrations.status, "confirmed")),
            );

          let autoBooked = 0;
          for (const reg of confirmed) {
            // Any-status existence check (mirrors classes): a cancelled
            // booking row means the family opted this child out of THIS
            // camp day and must not be resurrected; any other row means
            // it's already handled. orderBy per the shared-CI-DB rule.
            const [existing] = await tx
              .select({ id: dropInBookings.id })
              .from(dropInBookings)
              .where(
                and(
                  eq(dropInBookings.sessionId, session.id),
                  eq(dropInBookings.familyMemberId, reg.familyMemberId),
                ),
              )
              .orderBy(dropInBookings.createdAt)
              .limit(1);
            if (existing) continue;

            const inserted = await tx
              .insert(dropInBookings)
              .values({
                sessionId: session.id,
                userId: reg.registeredByUserId,
                familyMemberId: reg.familyMemberId,
                status: "confirmed",
                source: "auto_enrollment",
                paymentMethod: "registration",
                amountPaidCents: 0,
                brand: "aspire",
                waiverSigned: false,
              })
              // Defense in depth against a same-instant race on the
              // participant-per-session unique
              // (drop_in_bookings_one_active_per_participant_session_v3).
              // Targetless because that index is an expression + partial
              // index drizzle's column-typed `target` can't name — and it is
              // the ONLY unique this insert can collide with (the pk is
              // defaultRandom), so the bare form is exactly equivalent.
              .onConflictDoNothing()
              .returning({ id: dropInBookings.id });
            if (inserted.length > 0) autoBooked += 1;
          }
          return autoBooked;
        });

        counters.autoBooked += booked;
      } catch (err) {
        console.error(
          `[camps] auto-booking sweep tx failed for season ${season.id}, session ${session.id}:`,
          err,
        );
        void captureServerException(err, {
          component: "camps/materialize",
          metadata: { season_id: season.id, session_id: session.id, phase: "sweep-tx" },
        });
        counters.failed += 1;
      }
    }
  }

  return counters;
}
