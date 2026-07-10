/**
 * Adapted-state pure function (Program Blueprint T9). See "The coach seam"
 * in docs/superpowers/specs/2026-07-10-program-blueprint-design.md:
 *
 *   "Adapted state: computed, not coach-managed — a prescribed session
 *   whose segments differ from its template's structure counts as
 *   adapted. No new coach UI beyond the badge."
 *
 * No DB access — the callers (the delivery endpoint, today; distribution
 * safety later if ever needed) fetch the session's segments and the
 * template's current structure and pass them in, same pattern as
 * sequence-instantiation.ts.
 *
 * --- Shape decision (read before touching the comparison) ---
 * `session_plans.segments` (practice-planning.ts) carries
 * `{ order, name, type, durationMinutes, activityId?, activityName?,
 * notes? }` per entry. `practice_templates.structure` (same file) carries
 * `{ name, type, durationMinutes, description?, activitySuggestions?,
 * coachingScript? }` per entry.
 *
 * Two things fall out of comparing those shapes honestly:
 *
 * 1. Templates never carry a resolved `activityId` — only free-text
 *    `activitySuggestions` (candidate names for a coach to pick from).
 *    So "does this position's activityId differ from the template's"
 *    always compares against "no activity". A segment where the coach
 *    picked a concrete activity the template only suggested in the
 *    abstract counts as a real divergence — the plan said "try one of
 *    these", the delivered session says "here is specifically which one".
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
 *   - any position has a concrete `activityId` set (template positions
 *     never have one, so any non-null/non-empty value is a divergence).
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

export interface AdaptedTemplateSegment {
  name: string;
  durationMinutes: number;
}

export function isAdapted(
  sessionSegments: AdaptedSessionSegment[] | null | undefined,
  templateStructure: AdaptedTemplateSegment[] | null | undefined,
): boolean {
  const session = [...(sessionSegments ?? [])].sort((a, b) => a.order - b.order);
  const template = templateStructure ?? [];

  if (session.length !== template.length) return true;

  for (let i = 0; i < session.length; i++) {
    if (session[i].durationMinutes !== template[i].durationMinutes) return true;
    if (session[i].activityId) return true; // template positions never carry one
  }

  return false;
}
