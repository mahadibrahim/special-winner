/**
 * Weekly class-session materialization + allotment-aware auto-booking.
 *
 * The class-slot machinery (classSlotTemplates / classEnrollments, see
 * src/lib/db/schema/classes.ts) stores a STANDING weekly slot, not concrete
 * calendar sessions. This module is the cron that turns that standing slot
 * into real `drop_in_sessions` (kind='class') rows for the next
 * `HORIZON_DAYS` days, then auto-books every child with an ACTIVE enrollment
 * into every scheduled session of that template inside the horizon — while
 * their monthly class allotment lasts.
 *
 * TWO SEPARATE PASSES, deliberately decoupled:
 *
 *  1. Materialize — insert a `drop_in_sessions` row for each occurrence in
 *     [now, horizonEnd], idempotent via `onConflictDoNothing` against the
 *     partial unique index `drop_in_sessions_one_per_template_start` on
 *     (class_slot_template_id, starts_at). Re-running the cron never
 *     duplicates a session.
 *
 *  2. Auto-book — sweep EVERY `scheduled` session of the template inside the
 *     horizon, whether it was inserted THIS run or already existed from a
 *     prior run, and attempt a booking for every active enrollment against
 *     every such session. This is deliberately NOT limited to
 *     newly-inserted sessions: this week's session is typically already
 *     materialized by the time a family enrolls mid-week (the whole point
 *     of an 8-day horizon), and if auto-booking only ever looked at rows
 *     inserted this run, a newly-enrolled child would silently miss every
 *     already-materialized session until the NEXT time that occurrence gets
 *     freshly inserted — up to ~2 weeks with no seat, the worst possible
 *     first experience.
 *
 *     Re-booking safety instead comes from an explicit per-pair existence
 *     check: before attempting a booking, look for ANY `drop_in_bookings`
 *     row for (session, family_member) in ANY status — including
 *     `cancelled`. A cancelled row means the family explicitly opted out of
 *     that specific week and must not be silently re-booked by the next
 *     run; a confirmed/waitlisted/pending row means it's already handled.
 *     Only a family with NO booking row at all for that session (a fresh
 *     enrollment, or a session that postdates their enrollment) gets a
 *     booking attempt. This is a stronger, run-independent guarantee than
 *     the previous "only touch sessions this run inserted" rule.
 *
 * Timezone: `classSlotTemplates.weekday` (0=Sun..6=Sat, matches
 * `Date#getUTCDay`) and `.startTime` ("HH:MM:SS") are WALL-CLOCK values in
 * the template's organization's timezone (`organizations.timezone`,
 * DB-defaults to "America/New_York" — same fallback used across the repo,
 * see src/lib/time/zoned-day.ts's `ORG_DEFAULT_TIMEZONE`). Resolving a wall
 * clock + weekday to a UTC instant needs to be DST-safe, so this reuses the
 * same guess-and-correct convergence already established in
 * src/lib/dropin/week-schedule.ts's `zonedMidnightUtc` (format the guessed
 * instant back through `Intl.DateTimeFormat` in the target zone, compare to
 * the intended wall clock, correct by the delta) — no new date library
 * needed, and no naive per-line offset math that would drift across a DST
 * boundary.
 *
 * Transaction shape: each session insert is its own statement (atomic on
 * its own — no multi-step work to wrap). Each session's auto-booking sweep
 * runs in ONE small transaction (lookup active enrollments + attempt each
 * booking via `createChildClassBooking({ dbOrTx: tx })`), with every
 * enrollment's booking attempt wrapped in its own try/catch (the
 * charge-unpaid-team-shares isolation pattern; see
 * src/pages/api/cron/charge-unpaid-team-shares.ts) so one child's unexpected
 * failure doesn't roll back the rest of that session's bookings. If a
 * session's insert or booking-sweep transaction throws (e.g. a DB blip),
 * that one occurrence/session is counted as `failed` and the batch
 * continues with the next occurrence, session, or template.
 *
 * Post-commit side effects — DELIBERATELY SKIPPED for v1: `createChildClassBooking`
 * with `dbOrTx` set never dispatches a confirmation email; per its CALLER
 * CONTRACT, the caller owns that. This cron intentionally does not send one
 * per auto-booking either. Auto-enrollment bookings are expected weekly
 * occurrences a parent already opted into (via `enrollChild`), not a
 * one-off purchase that needs a receipt — a per-week "you're booked again"
 * email would just be noise. A weekly digest (batching a family's upcoming
 * auto-booked sessions into one message) is Plan 3 territory, not this
 * cron.
 */
import { and, eq, gt, lte, sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { classSlotTemplates, classEnrollments } from "@/lib/db/schema/classes";
import { dropInSessions, dropInBookings } from "@/lib/db/schema/drop-in";
import { familyMembers } from "@/lib/db/schema/registrations";
import { organizations } from "@/lib/db/schema/organizations";
import { ORG_DEFAULT_TIMEZONE } from "@/lib/time/zoned-day";
import { createChildClassBooking } from "./book-child";
import type { DropInTx } from "@/lib/dropin/booking";
import { captureServerException } from "@/lib/observability/server-error";

/** Materialize sessions for the next N days (today inclusive). */
export const HORIZON_DAYS = 8;

const DAY_MS = 86_400_000;
const WEEKDAY_ABBR = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

interface CivilDate {
  y: number;
  m: number; // 1-12
  day: number;
}

/** Civil date (and JS-style 0=Sun..6=Sat weekday) of `d` as observed in `timeZone`. */
function civilPartsInTz(d: Date, timeZone: string): CivilDate & { weekday: number } {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "numeric",
    day: "numeric",
    weekday: "short",
  });
  const parts = Object.fromEntries(fmt.formatToParts(d).map((p) => [p.type, p.value]));
  return {
    y: Number(parts.year),
    m: Number(parts.month),
    day: Number(parts.day),
    weekday: WEEKDAY_ABBR.indexOf(parts.weekday),
  };
}

/** Add `delta` calendar days to a civil date via UTC-anchored overflow normalization — pure calendar arithmetic, never touches wall-clock time, so it can't drift across a DST transition. */
function civilAddDays(civ: CivilDate, delta: number): CivilDate {
  const d = new Date(Date.UTC(civ.y, civ.m - 1, civ.day + delta));
  return { y: d.getUTCFullYear(), m: d.getUTCMonth() + 1, day: d.getUTCDate() };
}

/**
 * The UTC instant of wall-clock `hh:mm:ss` on civil date `civ`, in `timeZone`.
 *
 * Guess-and-correct convergence (same shape as `zonedMidnightUtc` in
 * src/lib/dropin/week-schedule.ts): interpret the target wall clock as if it
 * were already UTC (the first guess), format that guess back through
 * `timeZone`, and shift the guess by the observed delta. For an EXISTING
 * wall-clock time this converges to an exact answer in at most a couple
 * iterations for any real-world zone/DST rule — offsets are always well
 * under 24h, so 3 iterations is generous headroom.
 *
 * For a wall-clock time that does NOT exist (the spring-forward gap, e.g.
 * "02:30:00" on a US DST-start day when clocks jump 02:00→03:00) there is no
 * instant whose formatted wall clock equals the target, so `deltaMs` never
 * hits exactly 0 and the loop does not "converge" in the usual sense — it
 * runs the full 3 iterations and returns whatever the last guess landed on.
 * In practice ICU resolves a gap instant by rolling it forward past the
 * transition, so this deterministically returns the gap-forward instant
 * (equivalent to `hh:mm:ss` interpreted at the POST-transition offset) —
 * never an infinite loop or a thrown error, just a defined answer for an
 * edge case that is nonsensical to begin with (a class literally cannot
 * start at a wall-clock time that never happened that day).
 */
export function zonedWallClockUtc(
  civ: CivilDate,
  hh: number,
  mm: number,
  ss: number,
  timeZone: string,
): Date {
  const targetUtcMs = Date.UTC(civ.y, civ.m - 1, civ.day, hh, mm, ss);
  let guess = new Date(targetUtcMs);
  for (let i = 0; i < 3; i++) {
    const fmt = new Intl.DateTimeFormat("en-US", {
      timeZone,
      year: "numeric",
      month: "numeric",
      day: "numeric",
      hour: "numeric",
      minute: "numeric",
      second: "numeric",
      hourCycle: "h23",
    });
    const p = Object.fromEntries(fmt.formatToParts(guess).map((x) => [x.type, x.value]));
    const observedMs = Date.UTC(
      Number(p.year),
      Number(p.month) - 1,
      Number(p.day),
      // "24" can appear for midnight under hour12:false/h23 in some ICU versions.
      p.hour === "24" ? 0 : Number(p.hour),
      Number(p.minute),
      Number(p.second),
    );
    const deltaMs = observedMs - targetUtcMs;
    if (deltaMs === 0) return guess;
    guess = new Date(guess.getTime() - deltaMs);
  }
  return guess;
}

/** Parse a Postgres `time` string ("HH:MM:SS" or "HH:MM:SS.sss") into [h, m, s]. */
function parseWallTime(startTime: string): [number, number, number] {
  const [h, m, s] = startTime.split(":");
  return [Number(h), Number(m), Number(s ?? 0)];
}

/**
 * Every UTC instant at which `weekday`/`startTime` (wall clock, `timeZone`)
 * occurs strictly after `now` and at or before `horizonEnd`.
 *
 * Walks civil dates from `now`'s local day through `horizonEnd`'s local day
 * (inclusive) rather than dividing by a week in milliseconds, so a template
 * whose weekday occurs twice within an 8-day window (the window is longer
 * than a week) yields both occurrences, and DST transitions inside the
 * window never shift which civil dates get checked.
 */
export function occurrenceInstants(
  weekday: number,
  startTime: string,
  timeZone: string,
  now: Date,
  horizonEnd: Date,
): Date[] {
  const [hh, mm, ss] = parseWallTime(startTime);
  const startCiv = civilPartsInTz(now, timeZone);
  const endCiv = civilPartsInTz(horizonEnd, timeZone);
  // Inclusive day-span between the two civil dates, via UTC-anchored day math.
  const spanDays = Math.round(
    (Date.UTC(endCiv.y, endCiv.m - 1, endCiv.day) - Date.UTC(startCiv.y, startCiv.m - 1, startCiv.day)) /
      DAY_MS,
  );

  const out: Date[] = [];
  for (let i = 0; i <= spanDays; i++) {
    const civ = civilAddDays(startCiv, i);
    // civilAddDays is pure calendar arithmetic (UTC-anchored), so deriving
    // weekday from JS's Date#getUTCDay on the same UTC-anchored construction
    // stays consistent with civilPartsInTz's Intl-derived weekday.
    const asUtc = new Date(Date.UTC(civ.y, civ.m - 1, civ.day));
    if (asUtc.getUTCDay() !== weekday) continue;
    const instant = zonedWallClockUtc(civ, hh, mm, ss, timeZone);
    if (instant > now && instant <= horizonEnd) out.push(instant);
  }
  return out;
}

export interface MaterializeResult {
  sessionsCreated: number;
  autoBooked: number;
  skippedExhausted: number;
  skippedPastDue: number;
  failed: number;
  /** Credit-backed enrollments ended by pass 0 because their grant expired. */
  enrollmentsEnded: number;
}

/**
 * For each active class-slot template: (1) materialize `drop_in_sessions`
 * rows for every occurrence in [now, now + HORIZON_DAYS days], then (2)
 * sweep EVERY `scheduled` session of that template inside the horizon —
 * created this run or already existing — and attempt a booking for every
 * active enrollment against every such session, skipping (without penalty)
 * any (enrollment, session) pair that already has a booking row in any
 * status. See the module header for why the sweep must not be limited to
 * sessions inserted this run.
 */
export async function materializeClassSessions(now: Date): Promise<MaterializeResult> {
  const db = getDb();
  const counters: MaterializeResult = {
    sessionsCreated: 0,
    autoBooked: 0,
    skippedExhausted: 0,
    skippedPastDue: 0,
    failed: 0,
    enrollmentsEnded: 0,
  };

  // ---- Pass 0: end credit-backed enrollments whose grant has expired ----
  // A block enrollment holds its template seat only through the block
  // window (grant.expiresAt = block end). Membership-backed enrollments
  // are ended by handleSubscriptionDeleted, never here.
  const ended = await db
    .update(classEnrollments)
    .set({ status: "ended", endedAt: now })
    .where(
      and(
        eq(classEnrollments.status, "active"),
        sql`${classEnrollments.creditGrantId} IN (
          SELECT id FROM class_credit_grants WHERE expires_at <= ${now}
        )`,
      ),
    )
    .returning({ id: classEnrollments.id });
  counters.enrollmentsEnded = ended.length;

  const horizonEnd = new Date(now.getTime() + HORIZON_DAYS * DAY_MS);

  const templates = await db
    .select({ template: classSlotTemplates, orgTimezone: organizations.timezone })
    .from(classSlotTemplates)
    .innerJoin(organizations, eq(organizations.id, classSlotTemplates.organizationId))
    .where(eq(classSlotTemplates.active, true));

  for (const { template, orgTimezone } of templates) {
    const timezone = orgTimezone ?? ORG_DEFAULT_TIMEZONE;

    let occurrences: Date[];
    try {
      occurrences = occurrenceInstants(
        template.weekday,
        template.startTime,
        timezone,
        now,
        horizonEnd,
      );
    } catch (err) {
      console.error(
        `[classes] occurrence math failed for template ${template.id}:`,
        err,
      );
      void captureServerException(err, {
        component: "classes/materialize",
        metadata: { template_id: template.id, phase: "occurrence-math" },
      });
      counters.failed += 1;
      continue;
    }

    // ---- Pass 1: materialize sessions ----
    // A plain insert is already atomic on its own; no transaction needed
    // just to wrap one statement.
    for (const startsAt of occurrences) {
      try {
        const endsAt = new Date(startsAt.getTime() + template.durationMins * 60_000);
        const [inserted] = await db
          .insert(dropInSessions)
          .values({
            organizationId: template.organizationId,
            venueId: template.venueId,
            bookableResourceId: null,
            kind: "class",
            sportOrClassLabel: template.sportLabel,
            formatLabel: template.name,
            startsAt,
            endsAt,
            capacity: template.capacity,
            audience: "youth",
            status: "scheduled",
            // Class rates travel from the template onto the session, so the
            // paid make-up path (POST /api/dropin/bookings with
            // familyMemberId) and the 402 quote from POST /api/classes/book
            // both read a CLASS price off the session row — same shape
            // pickup already uses. Null here (template left them unset)
            // falls through to the org's drop_in_rate_card defaults at the
            // booking endpoints, which is the adult pickup card, hence the
            // strong preference for setting them on the template.
            sessionRateCents: template.sessionRateCents,
            memberRateCents: template.memberRateCents,
            classSlotTemplateId: template.id,
          })
          .onConflictDoNothing({
            target: [dropInSessions.classSlotTemplateId, dropInSessions.startsAt],
            where: sql`class_slot_template_id IS NOT NULL`,
          })
          .returning({ id: dropInSessions.id });

        if (inserted) counters.sessionsCreated += 1;
      } catch (err) {
        console.error(
          `[classes] session insert failed for template ${template.id} at ${startsAt.toISOString()}:`,
          err,
        );
        void captureServerException(err, {
          component: "classes/materialize",
          metadata: {
            template_id: template.id,
            starts_at: startsAt.toISOString(),
            phase: "session-insert",
          },
        });
        counters.failed += 1;
      }
    }

    // ---- Pass 2: auto-book sweep ----
    // ALL scheduled sessions of this template inside the horizon — not just
    // ones inserted above — so a family that enrolls after this week's
    // session was already materialized (any prior run) still gets booked.
    let sessions: Array<{ id: string }>;
    try {
      sessions = await db
        .select({ id: dropInSessions.id })
        .from(dropInSessions)
        .where(
          and(
            eq(dropInSessions.classSlotTemplateId, template.id),
            eq(dropInSessions.status, "scheduled"),
            gt(dropInSessions.startsAt, now),
            lte(dropInSessions.startsAt, horizonEnd),
          ),
        );
    } catch (err) {
      console.error(
        `[classes] session sweep query failed for template ${template.id}:`,
        err,
      );
      void captureServerException(err, {
        component: "classes/materialize",
        metadata: { template_id: template.id, phase: "sweep-query" },
      });
      counters.failed += 1;
      continue;
    }

    for (const session of sessions) {
      try {
        const txResult = await db.transaction(async (tx: DropInTx) => {
          const enrollments = await tx
            .select({
              familyMemberId: classEnrollments.familyMemberId,
              parentUserId: familyMembers.parentUserId,
            })
            .from(classEnrollments)
            .innerJoin(familyMembers, eq(familyMembers.id, classEnrollments.familyMemberId))
            .where(
              and(
                eq(classEnrollments.slotTemplateId, template.id),
                eq(classEnrollments.status, "active"),
              ),
            );

          let autoBooked = 0;
          let skippedExhausted = 0;
          let skippedPastDue = 0;
          let failed = 0;

          for (const enr of enrollments) {
            // Every class_enrollments row is keyed to a CHILD (COPPA path,
            // family_members.parentUserId set) — classes have no adult
            // self-enrollment path (see enrollment.ts's header). A null
            // parentUserId here would mean a self-path family_members row
            // somehow got enrolled; skip defensively rather than pass a
            // null parentUserId into createChildClassBooking's ownership
            // check (which would just report "child not found" anyway).
            if (!enr.parentUserId) {
              failed += 1;
              continue;
            }

            // Any-status existence check — the re-booking safety guarantee
            // (see module header). A cancelled row means the family opted
            // out of THIS session and must not be resurrected; any other
            // row means it's already handled. Either way, skip silently:
            // not a failure, not a fresh booking.
            const [existingBooking] = await tx
              .select({ id: dropInBookings.id })
              .from(dropInBookings)
              .where(
                and(
                  eq(dropInBookings.sessionId, session.id),
                  eq(dropInBookings.familyMemberId, enr.familyMemberId),
                ),
              )
              .limit(1);
            if (existingBooking) continue;

            try {
              const result = await createChildClassBooking({
                sessionId: session.id,
                parentUserId: enr.parentUserId,
                familyMemberId: enr.familyMemberId,
                kind: "member",
                source: "auto_enrollment",
                dbOrTx: tx,
              });
              if (result.ok) {
                autoBooked += 1;
              } else if (result.error.code === "allotment_exhausted") {
                skippedExhausted += 1;
              } else if (result.error.code === "no_membership") {
                // Covers a lapsed/paused/past_due membership at auto-booking
                // time — the enrollment row itself may still be "active"
                // (ended only by handleSubscriptionDeleted on cancellation),
                // but createChildClassBooking requires status === 'active'.
                // A credit-backed enrollment whose grant is EXHAUSTED but not
                // yet expired also reports no_membership and lands in this
                // bucket — imprecise labeling, not a distinct failure mode.
                skippedPastDue += 1;
              } else {
                // session_full / waiver_required / age_ineligible / etc. —
                // unexpected for an auto-booking path (no waiver prompt, no
                // manual double-booking — already_booked is pre-empted by
                // the existence check above) but isolated per-enrollment
                // rather than failing the whole session.
                failed += 1;
              }
            } catch (bookErr) {
              console.error(
                `[classes] auto-booking failed for enrollment (child ${enr.familyMemberId}, session ${session.id}):`,
                bookErr,
              );
              void captureServerException(bookErr, {
                component: "classes/materialize",
                metadata: {
                  template_id: template.id,
                  session_id: session.id,
                  family_member_id: enr.familyMemberId,
                  phase: "auto-booking",
                },
              });
              failed += 1;
            }
          }

          return { autoBooked, skippedExhausted, skippedPastDue, failed };
        });

        counters.autoBooked += txResult.autoBooked;
        counters.skippedExhausted += txResult.skippedExhausted;
        counters.skippedPastDue += txResult.skippedPastDue;
        counters.failed += txResult.failed;
      } catch (txErr) {
        console.error(
          `[classes] auto-booking sweep tx failed for template ${template.id}, session ${session.id}:`,
          txErr,
        );
        void captureServerException(txErr, {
          component: "classes/materialize",
          metadata: {
            template_id: template.id,
            session_id: session.id,
            phase: "sweep-tx",
          },
        });
        counters.failed += 1;
      }
    }
  }

  return counters;
}
