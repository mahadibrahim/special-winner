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
 *    The comparison is now a MULTISET check, not positional: the sorted
 *    list of the session's concrete `activityId`s vs. the sorted list of
 *    the snapshot's `resolvedActivityId`s — adapted if they differ in
 *    size or in any element. Multiset rather than per-position because
 *    the session is re-sorted by its mutable `order` while the snapshot
 *    is frozen in generation order: a coach cosmetically REORDERING two
 *    same-duration segments with different resolved ids would compare
 *    cross-wise under a positional check and wrongly flip to "adapted".
 *    Reorders are cosmetic (the same protection item 2 gives to renames);
 *    the SET of drills being run is what's structural. A segment where
 *    the coach picked a concrete activity nothing was resolved for, or
 *    swapped/cleared a resolved one, still counts as a real divergence —
 *    the multisets differ. Legacy snapshots (generated pre-fix, no
 *    `resolvedActivityId` on any position) preserve the OLD behavior
 *    exactly: their multiset is empty, so any concrete session
 *    `activityId` still diverges from "no activity" — old sessions are
 *    not retroactively reclassified.
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
 *   - the multiset of the session's concrete `activityId`s differs from
 *     the multiset of the snapshot's `resolvedActivityId`s (see item 1 —
 *     the activity check is deliberately order-insensitive).
 *
 * For the DURATION check, segments are compared by their position in the
 * array, sorted by each segment's own `order` field first — `order` is
 * `idx + 1` at generation time (sequence-instantiation.ts) and the PUT
 * that lets a coach reorder segments (api/coach/sessions/[id].ts) writes
 * back whatever `order` values the client sends, so re-sorting by `order`
 * rather than trusting array-as-stored is the more defensive read. A
 * reorder that swaps two segments with DIFFERENT durations still reads as
 * adapted via this positional duration check (pre-existing, accepted
 * behavior); a reorder of same-duration segments is invisible to it,
 * which is exactly why the activity check above must not be positional —
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
  }

  // Activity comparison is a MULTISET check, not positional — see module
  // docstring item 1. The session is sorted by its mutable `order` while
  // the snapshot is frozen in generation order, so a cosmetic reorder of
  // two same-duration segments with different resolved ids would compare
  // cross-wise under a positional check and wrongly flip to "adapted".
  // The SET of drills being run is what's structural; where they sit in
  // the timeline is not.
  const sessionActs = session
    .map((s) => s.activityId ?? null)
    .filter((x): x is string => x !== null)
    .sort();
  const prescribedActs = prescribed
    .map((p) => p.resolvedActivityId ?? null)
    .filter((x): x is string => x !== null)
    .sort();
  if (sessionActs.length !== prescribedActs.length) return true;
  for (let i = 0; i < sessionActs.length; i++) {
    if (sessionActs[i] !== prescribedActs[i]) return true;
  }

  return false;
}
