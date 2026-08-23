/**
 * Weekly class-session materialization + allotment-aware auto-booking.
 *
 * The class-slot machinery (classSlotTemplates / classEnrollments, see
 * src/lib/db/schema/classes.ts) stores a STANDING weekly slot, not concrete
 * calendar sessions. This module is the cron that turns that standing slot
 * into real `drop_in_sessions` (kind='class') rows for the next
 * `HORIZON_DAYS` days, then auto-books every child with an ACTIVE enrollment
 * on that template into each newly-created session — while their monthly
 * class allotment lasts.
 *
 * Idempotency: the insert targets the partial unique index
 * `drop_in_sessions_one_per_template_start` on
 * (class_slot_template_id, starts_at) via `onConflictDoNothing`, so re-running
 * the cron (daily, or by hand) never duplicates a session. Auto-booking only
 * runs for sessions ACTUALLY inserted this run (`.returning()` on the insert
 * only yields rows that were newly created, never conflicted ones) —
 * re-running the cron against an already-materialized week must not
 * re-book a child who cancelled their seat on that specific occurrence.
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
 * Transaction shape: ONE small transaction per (template, occurrence) pair
 * — insert the session, then auto-book every active enrollment inside the
 * same tx via `createChildClassBooking({ dbOrTx: tx })`. Each enrollment's
 * booking attempt is wrapped in its own try/catch (the
 * charge-unpaid-team-shares isolation pattern; see
 * src/pages/api/cron/charge-unpaid-team-shares.ts) so one child's unexpected
 * failure doesn't roll back the session or block the rest of that session's
 * enrollments. If the transaction itself throws (e.g. a DB blip), that one
 * session's materialization+booking is rolled back entirely and counted as
 * `failed` — the batch continues with the next occurrence/template.
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
import { and, eq, sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { classSlotTemplates, classEnrollments } from "@/lib/db/schema/classes";
import { dropInSessions } from "@/lib/db/schema/drop-in";
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
 * `timeZone`, and shift the guess by the observed delta. Converges in at
 * most a couple iterations for any real-world zone/DST rule — offsets are
 * always well under 24h, so 3 iterations is generous headroom.
 */
function zonedWallClockUtc(
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
}

/**
 * For each active class-slot template: materialize `drop_in_sessions` rows
 * for every occurrence in [now, now + HORIZON_DAYS days], then auto-book
 * every child with an active enrollment on that template into each session
 * ACTUALLY created this run (never into a pre-existing one — re-running
 * the cron must not resurrect a booking a family cancelled).
 */
export async function materializeClassSessions(now: Date): Promise<MaterializeResult> {
  const db = getDb();
  const counters: MaterializeResult = {
    sessionsCreated: 0,
    autoBooked: 0,
    skippedExhausted: 0,
    skippedPastDue: 0,
    failed: 0,
  };

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

    for (const startsAt of occurrences) {
      try {
        const txResult = await db.transaction(async (tx: DropInTx) => {
          const endsAt = new Date(startsAt.getTime() + template.durationMins * 60_000);

          const [inserted] = await tx
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
              classSlotTemplateId: template.id,
            })
            .onConflictDoNothing({
              target: [dropInSessions.classSlotTemplateId, dropInSessions.startsAt],
              where: sql`class_slot_template_id IS NOT NULL`,
            })
            .returning({ id: dropInSessions.id });

          // Already materialized (a prior run, or a concurrent one) — never
          // re-book against a pre-existing session.
          if (!inserted) return null;

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
            try {
              const result = await createChildClassBooking({
                sessionId: inserted.id,
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
                skippedPastDue += 1;
              } else {
                // already_booked / session_full / waiver_required /
                // age_ineligible / etc. — unexpected for an auto-booking
                // path (no waiver prompt, no manual double-booking) but
                // isolated per-enrollment rather than failing the session.
                failed += 1;
              }
            } catch (bookErr) {
              console.error(
                `[classes] auto-booking failed for enrollment (child ${enr.familyMemberId}, session ${inserted.id}):`,
                bookErr,
              );
              void captureServerException(bookErr, {
                component: "classes/materialize",
                metadata: {
                  template_id: template.id,
                  session_id: inserted.id,
                  family_member_id: enr.familyMemberId,
                  phase: "auto-booking",
                },
              });
              failed += 1;
            }
          }

          return { autoBooked, skippedExhausted, skippedPastDue, failed };
        });

        if (txResult) {
          counters.sessionsCreated += 1;
          counters.autoBooked += txResult.autoBooked;
          counters.skippedExhausted += txResult.skippedExhausted;
          counters.skippedPastDue += txResult.skippedPastDue;
          counters.failed += txResult.failed;
        }
      } catch (txErr) {
        console.error(
          `[classes] materialization tx failed for template ${template.id} at ${startsAt.toISOString()}:`,
          txErr,
        );
        void captureServerException(txErr, {
          component: "classes/materialize",
          metadata: {
            template_id: template.id,
            starts_at: startsAt.toISOString(),
            phase: "session-tx",
          },
        });
        counters.failed += 1;
      }
    }
  }

  return counters;
}
