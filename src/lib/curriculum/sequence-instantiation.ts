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
 *
 * Distribution skill-linkage fix: `prescribedStructure` (the generation-time
 * snapshot, see `DraftSessionPlan` below) is no longer just the template's
 * `structure` copied verbatim — it also carries `resolvedActivityId` per
 * position when the caller passes an `activityIdByName` map (built by the
 * attach endpoint from the template's free-text `activitySuggestions`).
 * `segments` gets the same resolution (`activityId`/`activityName`), which
 * is what makes downstream skill-matched prompts and curated glow chips
 * possible on a prescribed session — before this fix, generated segments
 * carried suggestion NAMES only, never a real activity id, so skill
 * derivation from segments starved to generics on every distributed
 * session. Still no DB access here: this module only does the lookup
 * against a map the caller already resolved.
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

/**
 * Inverse of `zonedDateTimeToUtc`'s date half: the zone-local calendar date
 * ("YYYY-MM-DD") a UTC instant falls on. Used by the attach-preview
 * conflict check (review I3) to compare two session instants "same day in
 * this org's timezone" rather than "the exact same instant" — a same-day,
 * different-time existing session is still a real scheduling conflict for
 * a group, not just an exact double-booking. Same Intl-`formatToParts`
 * approach as `tzOffsetMs` above, no tz library.
 */
export function utcInstantToZonedDateString(instant: Date, timeZone: string): string {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const parts: Record<string, string> = {};
  for (const p of dtf.formatToParts(instant)) parts[p.type] = p.value;
  return `${parts.year}-${parts.month}-${parts.day}`;
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
  /** Defaults to "draft" — the original (Phase 3) manual-attach behavior.
   * The distribution engine (Program Blueprint T4) passes "planned": once
   * the safety re-check has cleared, generated sessions arrive prescribed,
   * not silent drafts. */
  status?: "draft" | "planned";
  /** Lineage FK to sequence_attachments — set by the distribution engine so
   * a generated session is distinguishable from "coach happened to pick the
   * same template." Defaults to null (unset) for callers that don't pass one. */
  sequenceAttachmentId?: string | null;
  /** Distribution skill-linkage fix: resolves a template segment's free-text
   * `activitySuggestions` (candidate names) to a real activity row. Keyed by
   * activity name EXACTLY as it appears in a suggestion — the caller (the
   * attach endpoint) owns matching/case normalization and org/sport scoping
   * when building this map; this module stays DB-free and just does the
   * lookup. Optional — omitted entirely, segments/snapshot are generated
   * exactly as before (back-compat for any caller that hasn't wired
   * resolution yet, and for templates with no suggestions at all). */
  activityIdByName?: Map<string, { id: string; name: string }>;
}

/**
 * Snapshot shape of `session_plans.prescribedStructure` — the template's
 * `structure` copied verbatim (see `prescribedStructure` below), PLUS
 * `resolvedActivityId` per position when the distribution skill-linkage fix
 * resolved that position's `activitySuggestions` to a real activity at
 * generation time. Kept distinct from `TemplateSegment` (the template's own
 * shape, which never carries a resolved id) so a template row itself never
 * looks like it has been resolved — only a session's frozen snapshot of it
 * can.
 */
export interface PrescribedSegmentSnapshot extends TemplateSegment {
  resolvedActivityId?: string;
}

/** Shape matches session_plans insert columns exactly. */
export interface DraftSessionPlan {
  teamId: string;
  templateId: string;
  coachUserId: string;
  title: string;
  scheduledDate: Date;
  durationMinutes: number;
  status: "draft" | "planned";
  segments: {
    order: number;
    name: string;
    type: string;
    durationMinutes: number;
    activityId?: string;
    activityName?: string;
    notes?: string;
  }[];
  focusSkillIds: string[] | null;
  objectives: string[] | null;
  equipmentNeeded: string[] | null;
  preSessionNotes: string | null;
  sequenceAttachmentId: string | null;
  // Program Blueprint (T9/T10 review fix): the exact template.structure
  // this session was generated from, copied verbatim — not re-derived from
  // `segments` above, which strips `activitySuggestions`/`coachingScript`
  // and only carries what a session needs. This is what adapted-detection
  // (adapted.ts) compares completed sessions against, so a later edit to
  // the LIVE template row can never retroactively relabel history. Null
  // only when the template itself has no structure at generation time.
  //
  // Distribution skill-linkage fix: also carries `resolvedActivityId` per
  // position — the generation-TIME resolution of that position's
  // `activitySuggestions`, frozen alongside the rest of the snapshot for
  // the same reason (a later template edit or activity rename must not
  // retroactively change what this session was actually generated with).
  prescribedStructure: PrescribedSegmentSnapshot[] | null;
}

/** First activitySuggestion (in order) that resolves via the map, or
 * undefined when none do / there's no map / no suggestions at all. */
function resolveSegmentActivity(
  suggestions: string[] | undefined,
  activityIdByName: Map<string, { id: string; name: string }> | undefined,
): { id: string; name: string } | undefined {
  if (!activityIdByName || !suggestions) return undefined;
  for (const name of suggestions) {
    const resolved = activityIdByName.get(name);
    if (resolved) return resolved;
  }
  return undefined;
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
      status: input.status ?? "draft",
      segments: (template.structure ?? []).map((s, idx) => {
        const resolved = resolveSegmentActivity(s.activitySuggestions, input.activityIdByName);
        return {
          order: idx + 1,
          name: s.name,
          type: s.type,
          durationMinutes: s.durationMinutes,
          ...(s.description ? { notes: s.description } : {}),
          ...(resolved ? { activityId: resolved.id, activityName: resolved.name } : {}),
        };
      }),
      focusSkillIds: template.focusSkillIds,
      objectives: entry.objectives,
      equipmentNeeded: template.equipmentNeeded,
      preSessionNotes: entry.notes,
      sequenceAttachmentId: input.sequenceAttachmentId ?? null,
      prescribedStructure: template.structure
        ? template.structure.map((s) => {
            const resolved = resolveSegmentActivity(s.activitySuggestions, input.activityIdByName);
            return {
              ...s,
              ...(resolved ? { resolvedActivityId: resolved.id } : {}),
            };
          })
        : null,
    });
  }
  return plans;
}

// ---------------------------------------------------------------------------
// Coach-facing progress derivation ("Week 3 of 8"). Generated drafts are
// ordinary session_plans rows with no sequence marker (by design), so
// membership is inferred: a team plan counts toward the sequence when its
// templateId is one of the sequence's entry templates.

export interface TeamPlanForProgress {
  id: string;
  title: string;
  templateId: string | null;
  scheduledDate: Date;
  status: string;
}

export interface SequenceProgress {
  totalWeeks: number;
  /** Sequence-derived plans that are completed or already in the past. */
  completedWeeks: number;
  /** 1-based, clamped to totalWeeks. */
  currentWeek: number;
  /** Earliest upcoming, non-cancelled, non-completed sequence plan. */
  nextPlan: { id: string; title: string; scheduledDate: Date } | null;
}

export function computeSequenceProgress(
  sequenceTemplateIds: string[],
  teamPlans: TeamPlanForProgress[],
  now: Date,
): SequenceProgress {
  const totalWeeks = sequenceTemplateIds.length;
  const templateSet = new Set(sequenceTemplateIds);
  const matching = teamPlans.filter(
    (p) => p.templateId !== null && templateSet.has(p.templateId),
  );
  const completedWeeks = Math.min(
    matching.filter(
      (p) => p.status === "completed" || p.scheduledDate.getTime() < now.getTime(),
    ).length,
    totalWeeks,
  );
  const upcoming = matching
    .filter(
      (p) =>
        p.scheduledDate.getTime() >= now.getTime() &&
        p.status !== "completed" &&
        p.status !== "cancelled",
    )
    .sort((a, b) => a.scheduledDate.getTime() - b.scheduledDate.getTime());
  return {
    totalWeeks,
    completedWeeks,
    currentWeek: totalWeeks === 0 ? 0 : Math.min(completedWeeks + 1, totalWeeks),
    nextPlan: upcoming[0]
      ? {
          id: upcoming[0].id,
          title: upcoming[0].title,
          scheduledDate: upcoming[0].scheduledDate,
        }
      : null,
  };
}
