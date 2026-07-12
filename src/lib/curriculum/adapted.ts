/**
 * Adapted-state pure function (Program Blueprint T9; T9/T10 review fix
 * revised the source of truth, mechanics unchanged; distribution
 * skill-linkage fix revised the activityId comparison, see below). See
 * "The coach seam" in docs/superpowers/specs/2026-07-10-program-blueprint-design.md:
 *
 *   "Adapted state: computed, not coach-managed — a prescribed session
 *   whose segments differ from its template's structure counts as
 *   adapted. No new coach UI beyond the badge."
 *
 * --- Source of truth (read before touching this) ---
 * The second argument is `session_plans.prescribedStructure` — the
 * generation-time SNAPSHOT of the template's structure (copied verbatim by
 * buildDraftSessionPlans, sequence-instantiation.ts), never the LIVE
 * `practice_templates.structure` row. The original implementation compared
 * against the live row, which meant editing a template after distribution
 * retroactively flipped already-completed, unchanged sessions from
 * "delivered" to "adapted" — a session that never changed shouldn't change
 * status because someone edited an unrelated template later. Comparing
 * against the immutable snapshot instead makes "adapted" mean what it's
 * supposed to mean: THIS session's segments differ from what THIS session
 * was actually generated to run.
 *
 * No DB access — callers (the delivery endpoint, today; distribution safety
 * later if ever needed) fetch the session's segments and its own
 * prescribedStructure snapshot and pass them in, same pattern as
 * sequence-instantiation.ts.
 *
 * --- Shape decision (read before touching the comparison) ---
 * `session_plans.segments` (practice-planning.ts) carries
 * `{ order, name, type, durationMinutes, activityId?, activityName?,
 * notes? }` per entry. `session_plans.prescribedStructure` (same file,
 * shape matches `practice_templates.structure` at the moment it was copied)
 * carries `{ name, type, durationMinutes, description?,
 * activitySuggestions?, coachingScript?, resolvedActivityId? }` per entry.
 *
 * Two things fall out of comparing those shapes honestly:
 *
 * 1. HISTORY, revised by the distribution skill-linkage fix: templates
 *    themselves still never carry a resolved `activityId` — only free-text
 *    `activitySuggestions` (candidate names). That part is unchanged. What
 *    changed is that a session's own SNAPSHOT (`prescribedStructure`,
 *    frozen at generation time) now CAN carry a `resolvedActivityId`, when
 *    the distribution engine resolved one of a position's suggestions to a
 *    real activity at generation time (sequence-instantiation.ts). Before
 *    this fix, "does this position's activityId differ from the
 *    template's" always compared against "no activity", so ANY concrete
 *    activityId on the session counted as a divergence — even one the
 *    distribution engine itself put there. That made every
 *    skill-resolved, freshly-generated session read as "adapted" on
 *    arrival, which is wrong: the plan said "here is specifically which
 *    one" (via resolution), and the delivered session ran exactly that.
 *    The comparison is now per-position: `session[i].activityId` vs.
 *    `prescribed[i].resolvedActivityId` (both normalized to `null` when
 *    absent) — they must differ to count as adapted. A segment where the
 *    coach picked a concrete activity the template only suggested in the
 *    abstract (no resolution happened, or the coach picked something
 *    other than what was resolved) still counts as a real divergence,
 *    exactly as before. Legacy snapshots (generated pre-fix, no
 *    `resolvedActivityId` on any position) preserve the OLD behavior
 *    exactly: `prescribed[i].resolvedActivityId` is `undefined` →
 *    normalized to `null`, so any concrete session `activityId` still
 *    diverges from "no activity" — old sessions are not retroactively
 *    reclassified.
 *
 * 2. `name` is intentionally EXCLUDED from the comparison, even though
 *    both shapes carry one and a freshly-generated prescribed session's
 *    segment names start out identical to the template's (copied
 *    verbatim by buildDraftSessionPlans). session-timeline.tsx lets a
 *    coach freely retype a segment's name ("Warmup" -> "Ball mastery
 *    warmup") with zero change to its actual instructional content
 *    (duration, chosen activity) — that is exactly the kind of cosmetic
 *    edit the spec's "coaches edit exactly as their own sessions" line
 *    protects. Segment `type` is excluded for the same reason. Only
 *    `durationMinutes` and `activityId` are structural.
 *
 * Materially differs (returns true) when:
 *   - segment counts differ (a segment was added or removed), OR
 *   - any position (by array order, see below) differs in
 *     `durationMinutes`, OR
 *   - any position's session `activityId` differs from that position's
 *     prescribed `resolvedActivityId` (both normalized to `null` when
 *     absent/falsy).
 *
 * Segments are compared by their position in the array, sorted by each
 * segment's own `order` field first — `order` is `idx + 1` at generation
 * time (sequence-instantiation.ts) and the PUT that lets a coach reorder
 * segments (api/coach/sessions/[id].ts) writes back whatever `order`
 * values the client sends, so re-sorting by `order` rather than trusting
 * array-as-stored is the more defensive read. A reorder that swaps two
 * segments with different durations is caught by the per-position
 * duration check above without needing any extra "position identity" —
 * there is nothing else to key a positional match on since segments
 * carry no stable id of their own.
 */

export interface AdaptedSessionSegment {
  name: string;
  durationMinutes: number;
  order: number;
  activityId?: string | null;
}

/** Shape of session_plans.prescribedStructure — the generation-time
 * snapshot, not a live template read. See module docstring. */
export interface AdaptedPrescribedSegment {
  name: string;
  durationMinutes: number;
  /** Distribution skill-linkage fix: the activity the distribution engine
   * resolved for this position at generation time, when its
   * activitySuggestions matched something. Undefined/null on legacy
   * snapshots and on positions where nothing resolved — see module
   * docstring item 1. */
  resolvedActivityId?: string | null;
}

export function isAdapted(
  sessionSegments: AdaptedSessionSegment[] | null | undefined,
  prescribedStructure: AdaptedPrescribedSegment[] | null | undefined,
): boolean {
  const session = [...(sessionSegments ?? [])].sort((a, b) => a.order - b.order);
  const prescribed = prescribedStructure ?? [];

  if (session.length !== prescribed.length) return true;

  for (let i = 0; i < session.length; i++) {
    if (session[i].durationMinutes !== prescribed[i].durationMinutes) return true;
    const sessionAct = session[i].activityId ?? null;
    const prescribedAct = prescribed[i].resolvedActivityId ?? null;
    if (sessionAct !== prescribedAct) return true;
  }

  return false;
}
