/**
 * Pure projection helper for the family (parent dashboard) schedule.
 *
 * Booked class sessions only exist ~8 days out — `HORIZON_DAYS` in
 * src/lib/classes/materialize.ts, the cron that turns a standing weekly
 * `class_slot_templates` slot into concrete `drop_in_sessions` rows. The
 * dashboard schedule needs a much longer runway than that (the endpoint
 * passes `horizonDays: 60`), so beyond the materialized/booked horizon this
 * projects the enrollment's weekly recurrence forward from `weekday` +
 * `startTime`, marked `projected: true`.
 *
 * No DB access here — every input is already resolved by the caller
 * (`src/pages/api/dashboard/schedule.ts`). `from` is a parameter, never
 * `Date.now()`, so this stays deterministic and unit-testable.
 *
 * Timezone math reuses `zonedWallClockUtc` from materialize.ts (the same
 * guess-and-correct DST convergence already established there — see that
 * function's doc comment) rather than reimplementing it. The small
 * surrounding civil-date bookkeeping (`civilPartsInTz` / `civilAddDays`,
 * walking calendar days in the enrollment's own timezone) is NOT exported
 * from materialize.ts, so it's duplicated here at module-private scope —
 * the same shape week-schedule.ts's `zonedMidnightUtc` already duplicates
 * independently. This is deliberate: these are tiny, self-contained
 * calendar-arithmetic helpers, not the DST-convergence logic itself.
 */
import { zonedWallClockUtc } from "@/lib/classes/materialize";

export interface FamilyScheduleEvent {
  id: string; // booking id, or `proj-<enrollmentId>-<yyyy-mm-dd>`
  type: "class" | "game" | "practice" | "tournament";
  title: string; // template/program name
  startsAt: string; // ISO
  endsAt: string | null;
  childId: string;
  childName: string;
  location: string | null;
  address: string | null;
  projected: boolean; // true = from enrollment recurrence, not a booked seat
  bookingId: string | null; // cancelable only when non-null
  status?: "scheduled" | "in_progress" | "completed" | "postponed" | "cancelled";
}

interface BookedSessionInput {
  bookingId: string;
  sessionId: string;
  startsAt: Date;
  durationMinutes: number | null;
  templateName: string;
  // Nullable: pickup/one-off sessions never set this, and legacy sessions
  // materialized before this column existed won't have it either — those
  // fall back to name-keyed suppression (see nameKey/idKey below).
  templateId: string | null;
  childId: string;
  childName: string;
  venueName: string | null;
  venueAddress: string | null;
}

interface EnrollmentInput {
  enrollmentId: string;
  childId: string;
  childName: string;
  templateName: string;
  // Nullable for symmetry with BookedSessionInput's fallback — in practice
  // the endpoint always supplies this (classSlotTemplates.id via an inner
  // join, never null), but keeping the type nullable here means a caller
  // without an id still gets legacy name-based matching on both sides
  // rather than a silent, permanent mismatch against id-keyed booked rows.
  templateId: string | null;
  weekday: number;
  startTime: string;
  durationMinutes: number | null;
  timezone: string;
  venueName: string | null;
  venueAddress: string | null;
}

const DAY_MS = 86_400_000;

/** A suppressed projection is one that lands within this many ms of a real
 *  booked session for the same child+template — the booked seat is the
 *  truth (see module header + the brief's rule). */
const SUPPRESSION_WINDOW_MS = DAY_MS;

interface CivilDate {
  y: number;
  m: number; // 1-12
  day: number;
}

/** Civil date of `d` as observed in `timeZone` (no weekday — callers derive
 *  weekday from a UTC-anchored reconstruction of the same civil date, same
 *  approach as materialize.ts's `occurrenceInstants`, so it never drifts
 *  from the Intl-derived date itself). */
function civilPartsInTz(d: Date, timeZone: string): CivilDate {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "numeric",
    day: "numeric",
  });
  const parts = Object.fromEntries(fmt.formatToParts(d).map((p) => [p.type, p.value]));
  return { y: Number(parts.year), m: Number(parts.month), day: Number(parts.day) };
}

/** Add `delta` calendar days to a civil date via UTC-anchored overflow
 *  normalization — pure calendar arithmetic, never touches wall-clock time. */
function civilAddDays(civ: CivilDate, delta: number): CivilDate {
  const d = new Date(Date.UTC(civ.y, civ.m - 1, civ.day + delta));
  return { y: d.getUTCFullYear(), m: d.getUTCMonth() + 1, day: d.getUTCDate() };
}

/** Parse "HH:MM" or "HH:MM:SS" (Postgres `time` columns render the latter;
 *  fixtures/tests may pass the former) into [h, m, s]. */
function parseWallTime(startTime: string): [number, number, number] {
  const [h, m, s] = startTime.split(":");
  return [Number(h), Number(m ?? 0), Number(s ?? 0)];
}

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

function civilDateId(civ: CivilDate): string {
  return `${civ.y}-${pad2(civ.m)}-${pad2(civ.day)}`;
}

export function buildClassScheduleEvents(input: {
  bookedSessions: BookedSessionInput[];
  enrollments: EnrollmentInput[];
  from: Date;
  horizonDays: number;
}): FamilyScheduleEvent[] {
  const { bookedSessions, enrollments, from, horizonDays } = input;
  const horizonEnd = new Date(from.getTime() + horizonDays * DAY_MS);

  const bookedEvents: FamilyScheduleEvent[] = bookedSessions.map((s) => ({
    id: s.bookingId,
    type: "class",
    title: s.templateName,
    startsAt: s.startsAt.toISOString(),
    endsAt:
      s.durationMinutes != null
        ? new Date(s.startsAt.getTime() + s.durationMinutes * 60_000).toISOString()
        : null,
    childId: s.childId,
    childName: s.childName,
    location: s.venueName,
    address: s.venueAddress,
    projected: false,
    bookingId: s.bookingId,
  }));

  // Suppression keys: each side (booked/enrollment) is independently keyed
  // by whichever identifiers it actually has, so a row that's missing a
  // templateId still matches its counterpart by name.
  //
  // The endpoint's two legs are NOT symmetric: enrollment rows always carry
  // a templateId (an inner join to class_slot_templates — see
  // src/pages/api/dashboard/schedule.ts), but booked-session rows read
  // `drop_in_sessions.classSlotTemplateId`, which is nullable and goes to
  // null on template deletion (ON DELETE SET NULL) or was never set at all
  // (one-off admin-created sessions). An id-only key on both sides would
  // mean a null-templateId booked row (indexed by name) is never found by
  // an id-keyed enrollment lookup — a silent duplicate booked+projected
  // pair. So the lookup probes BOTH an id key and a name key.
  //
  // But indexing is NOT symmetric with lookup: a booked row that HAS a
  // templateId is indexed under its id key ONLY, never also under a name
  // key. Two distinct templates can coincidentally share a display name —
  // indexing an id-bearing row by name too would let it wrongly suppress an
  // unrelated template's projection just because the names match. Only rows
  // with a null templateId (which have no id to be precise with) fall back
  // to the name key.
  function nameKey(childId: string, templateName: string): string {
    return `${childId}::name::${templateName}`;
  }
  function idKey(childId: string, templateId: string | null): string | null {
    return templateId != null ? `${childId}::id::${templateId}` : null;
  }

  // Suppression index: key -> sorted booked instants (ms). The booked seat is
  // the truth — this also honestly swallows the materialized-but-cancelled
  // case (a cancelled booking never reaches this list in the first place,
  // since the caller only passes confirmed ones).
  const bookedByKey = new Map<string, number[]>();
  function indexBookedInstant(key: string, instantMs: number): void {
    const arr = bookedByKey.get(key) ?? [];
    arr.push(instantMs);
    bookedByKey.set(key, arr);
  }
  for (const s of bookedSessions) {
    const ik = idKey(s.childId, s.templateId);
    if (ik) {
      indexBookedInstant(ik, s.startsAt.getTime());
    } else {
      indexBookedInstant(nameKey(s.childId, s.templateName), s.startsAt.getTime());
    }
  }
  for (const arr of bookedByKey.values()) arr.sort((a, b) => a - b);

  function isSuppressed(
    childId: string,
    templateId: string | null,
    templateName: string,
    instantMs: number,
  ): boolean {
    const keys = [nameKey(childId, templateName)];
    const ik = idKey(childId, templateId);
    if (ik) keys.push(ik);
    return keys.some((key) => {
      const arr = bookedByKey.get(key);
      return arr != null && arr.some((t) => Math.abs(t - instantMs) <= SUPPRESSION_WINDOW_MS);
    });
  }

  const projectedEvents: FamilyScheduleEvent[] = [];
  for (const enr of enrollments) {
    const [hh, mm, ss] = parseWallTime(enr.startTime);
    const startCiv = civilPartsInTz(from, enr.timezone);
    const endCiv = civilPartsInTz(horizonEnd, enr.timezone);
    // Inclusive day-span between the two civil dates, via UTC-anchored day
    // math — same shape as materialize.ts's `occurrenceInstants`.
    const spanDays = Math.round(
      (Date.UTC(endCiv.y, endCiv.m - 1, endCiv.day) - Date.UTC(startCiv.y, startCiv.m - 1, startCiv.day)) /
        DAY_MS,
    );

    for (let i = 0; i <= spanDays; i++) {
      const civ = civilAddDays(startCiv, i);
      // Pure UTC-anchored construction, consistent with civilAddDays.
      const asUtc = new Date(Date.UTC(civ.y, civ.m - 1, civ.day));
      if (asUtc.getUTCDay() !== enr.weekday) continue;

      const instant = zonedWallClockUtc(civ, hh, mm, ss, enr.timezone);
      if (!(instant > from && instant <= horizonEnd)) continue;
      if (isSuppressed(enr.childId, enr.templateId, enr.templateName, instant.getTime())) continue;

      projectedEvents.push({
        id: `proj-${enr.enrollmentId}-${civilDateId(civ)}`,
        type: "class",
        title: enr.templateName,
        startsAt: instant.toISOString(),
        endsAt:
          enr.durationMinutes != null
            ? new Date(instant.getTime() + enr.durationMinutes * 60_000).toISOString()
            : null,
        childId: enr.childId,
        childName: enr.childName,
        location: enr.venueName,
        address: enr.venueAddress,
        projected: true,
        bookingId: null,
      });
    }
  }

  return [...bookedEvents, ...projectedEvents].sort((a, b) => a.startsAt.localeCompare(b.startsAt));
}

interface LeagueGameInput {
  gameId: string;
  scheduledAt: Date;
  durationMinutes: number | null;
  status: "scheduled" | "in_progress" | "completed" | "postponed" | "cancelled";
  fieldNumber: string | null;
  childId: string;
  childName: string;
  teamName: string; // the child's team
  opponentName: string | null; // null = TBD fixture
  venueName: string | null;
  venueAddress: string | null;
}

/**
 * Pure mapper from league game rows to family-schedule events — one event
 * per rostered child on the game (so a game where two of a family's
 * children both play produces two events, each addressable/cancelable
 * independently in principle, though games are never cancelable — see
 * `bookingId: null`).
 *
 * Deliberately a separate exported function rather than threaded through
 * `buildClassScheduleEvents`: games have no projection/suppression concept
 * (there's no "recurring game" to project forward, every game is a
 * concrete scheduled row), so folding them into the class merge logic
 * would just be dead branches on this input shape.
 */
export function buildLeagueGameEvents(input: { games: LeagueGameInput[] }): FamilyScheduleEvent[] {
  const events: FamilyScheduleEvent[] = input.games.map((g) => ({
    id: `game-${g.gameId}-${g.childId}`,
    type: "game",
    title: g.opponentName ? `${g.teamName} vs ${g.opponentName}` : `${g.teamName} — opponent TBD`,
    startsAt: g.scheduledAt.toISOString(),
    endsAt:
      g.durationMinutes != null
        ? new Date(g.scheduledAt.getTime() + g.durationMinutes * 60_000).toISOString()
        : null,
    childId: g.childId,
    childName: g.childName,
    location: g.venueName ? (g.fieldNumber ? `${g.venueName} · Field ${g.fieldNumber}` : g.venueName) : null,
    address: g.venueAddress,
    projected: false,
    bookingId: null,
    status: g.status,
  }));

  return events.sort((a, b) => a.startsAt.localeCompare(b.startsAt));
}
