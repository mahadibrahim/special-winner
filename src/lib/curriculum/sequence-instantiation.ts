/**
 * Pure functions for instantiating a curriculum sequence into dated draft
 * session_plans (Phase 3). No DB access anywhere in this module — the thin
 * attach endpoint (api/admin/curriculum/sequences/[id]/attach.ts) queries
 * rows and feeds them in, which is what makes this unit-testable.
 *
 * Timezone handling: practice times are org-local wall-clock times
 * ("Saturdays 9am") but session_plans.scheduledDate stores UTC instants.
 * Weekly repetition must repeat the WALL TIME, not the UTC instant —
 * naive `+7 * 24h` drifts by an hour across DST boundaries. We resolve
 * each local date+time to UTC individually via Intl (no tz library needed).
 */

export interface RecurrenceInput {
  /** "YYYY-MM-DD", org-local. First candidate date; advanced forward to
   * `weekday` when it doesn't already fall on it. */
  startDate: string;
  /** 0 (Sunday) … 6 (Saturday) — matches JS Date#getUTCDay. */
  weekday: number;
  /** Requested number of practices. Callers cap it at the sequence's entry
   * count before calling (the attach endpoint does `Math.min(count, entries.length)`). */
  count: number;
  /** "HH:MM" 24-hour, org-local wall time. */
  timeOfDay: string;
  /** IANA zone, e.g. "America/New_York" (organizations.timezone). */
  timezone: string;
}

export interface GeneratedDates {
  /** UTC instants, ascending, one per practice. */
  dates: Date[];
  /** true when seasonEndDate cut generation short of `count`. */
  truncatedBySeasonEnd: boolean;
}

/** Offset of `timeZone` from UTC at `instant`, in milliseconds. */
function tzOffsetMs(instant: Date, timeZone: string): number {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const parts: Record<string, string> = {};
  for (const p of dtf.formatToParts(instant)) parts[p.type] = p.value;
  const asUtc = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour) % 24, // some ICU builds emit "24" for midnight
    Number(parts.minute),
    Number(parts.second),
  );
  return asUtc - instant.getTime();
}

/** Resolve a zone-local calendar date + wall time to a UTC instant. */
export function zonedDateTimeToUtc(
  dateISO: string,
  timeHHMM: string,
  timeZone: string,
): Date {
  const [y, m, d] = dateISO.split("-").map(Number);
  const [hh, mm] = timeHHMM.split(":").map(Number);
  const naiveUtc = Date.UTC(y, m - 1, d, hh, mm, 0);
  // Two-pass offset resolution: guess with the offset at the naive instant,
  // then re-resolve at the corrected instant — handles DST-boundary days.
  const guessOffset = tzOffsetMs(new Date(naiveUtc), timeZone);
  const finalOffset = tzOffsetMs(new Date(naiveUtc - guessOffset), timeZone);
  return new Date(naiveUtc - finalOffset);
}

export function generatePracticeDates(
  recurrence: RecurrenceInput,
  /** "YYYY-MM-DD" — no practices are generated after this local date (inclusive allowed). */
  seasonEndDate?: string,
): GeneratedDates {
  const [y, m, d] = recurrence.startDate.split("-").map(Number);
  // Calendar-day arithmetic in UTC space — immune to the host machine's zone.
  const cursor = new Date(Date.UTC(y, m - 1, d));
  const advance = (recurrence.weekday - cursor.getUTCDay() + 7) % 7;
  cursor.setUTCDate(cursor.getUTCDate() + advance);

  const dates: Date[] = [];
  let truncatedBySeasonEnd = false;
  for (let i = 0; i < recurrence.count; i++) {
    const dateISO = cursor.toISOString().slice(0, 10);
    if (seasonEndDate && dateISO > seasonEndDate) {
      // ISO date strings compare correctly lexicographically.
      truncatedBySeasonEnd = true;
      break;
    }
    dates.push(
      zonedDateTimeToUtc(dateISO, recurrence.timeOfDay, recurrence.timezone),
    );
    cursor.setUTCDate(cursor.getUTCDate() + 7);
  }
  return { dates, truncatedBySeasonEnd };
}

// ---------------------------------------------------------------------------
// Draft building — entry N of the sequence → the Nth generated practice date.

export interface TemplateSegment {
  name: string;
  type: string;
  durationMinutes: number;
  description?: string;
  activitySuggestions?: string[];
  coachingScript?: string;
}

export interface SequenceEntryForBuild {
  position: number; // 1..N
  templateId: string;
  objectives: string[] | null;
  notes: string | null;
}

export interface TemplateForBuild {
  id: string;
  name: string;
  totalDurationMinutes: number;
  structure: TemplateSegment[] | null;
  equipmentNeeded: string[] | null;
  focusSkillIds: string[] | null;
}

export interface BuildDraftsInput {
  teamId: string;
  coachUserId: string;
  /** Entries in any order — sorted by `position` internally. */
  entries: SequenceEntryForBuild[];
  templatesById: Map<string, TemplateForBuild>;
  /** From generatePracticeDates. Sorted entry k → dates[k]; extra entries
   * beyond dates.length are dropped (season-end truncation). */
  dates: Date[];
}

/** Shape matches session_plans insert columns exactly (status always "draft"). */
export interface DraftSessionPlan {
  teamId: string;
  templateId: string;
  coachUserId: string;
  title: string;
  scheduledDate: Date;
  durationMinutes: number;
  status: "draft";
  segments: {
    order: number;
    name: string;
    type: string;
    durationMinutes: number;
    notes?: string;
  }[];
  focusSkillIds: string[] | null;
  objectives: string[] | null;
  equipmentNeeded: string[] | null;
  preSessionNotes: string | null;
}

export function buildDraftSessionPlans(
  input: BuildDraftsInput,
): DraftSessionPlan[] {
  const sorted = [...input.entries].sort((a, b) => a.position - b.position);
  const total = sorted.length;
  const n = Math.min(total, input.dates.length);
  const plans: DraftSessionPlan[] = [];
  for (let i = 0; i < n; i++) {
    const entry = sorted[i];
    const template = input.templatesById.get(entry.templateId);
    if (!template) {
      throw new Error(
        `Sequence entry at position ${entry.position} references unknown template ${entry.templateId}`,
      );
    }
    plans.push({
      teamId: input.teamId,
      templateId: template.id,
      coachUserId: input.coachUserId,
      // "Week i of total" over sorted index, not entry.position — positions
      // are 1..N by construction, but the index is what pairs with dates.
      title: `Week ${i + 1} of ${total} — ${template.name}`,
      scheduledDate: input.dates[i],
      durationMinutes: template.totalDurationMinutes,
      status: "draft",
      segments: (template.structure ?? []).map((s, idx) => ({
        order: idx + 1,
        name: s.name,
        type: s.type,
        durationMinutes: s.durationMinutes,
        ...(s.description ? { notes: s.description } : {}),
      })),
      focusSkillIds: template.focusSkillIds,
      objectives: entry.objectives,
      equipmentNeeded: template.equipmentNeeded,
      preSessionNotes: entry.notes,
    });
  }
  return plans;
}
