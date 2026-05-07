/**
 * Filter activities by a derived TagContext.
 *
 * Semantics:
 *   - Empty dimension on the activity = no constraint for that dimension
 *     (the activity applies to every context).
 *   - Within a dimension: OR — any tag match counts.
 *   - Across dimensions: AND — every populated dimension on the activity
 *     must have at least one match in the context.
 */

import type { TagContext } from "./derive-tag-context";

export interface ActivityTags {
  id: string;
  sport_tags: string[];
  venue_tags: string[];
  format_tags: string[];
  audience_tags: string[];
}

function dimensionMatches(activityDim: string[], contextDim: readonly string[]): boolean {
  if (activityDim.length === 0) return true; // no constraint
  return activityDim.some((tag) => contextDim.includes(tag));
}

export function filterActivitiesByContext<T extends ActivityTags>(
  activities: T[],
  ctx: TagContext,
): T[] {
  return activities.filter(
    (a) =>
      dimensionMatches(a.sport_tags, ctx.sport_tags) &&
      dimensionMatches(a.venue_tags, ctx.venue_tags) &&
      dimensionMatches(a.format_tags, ctx.format_tags) &&
      dimensionMatches(a.audience_tags, ctx.audience_tags),
  );
}
