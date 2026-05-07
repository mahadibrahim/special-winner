// Runbook view — renders the activities relevant to a specific event
// (sport/venue/format/audience) ordered by phase, as a markdown briefing.

import type { Catalog } from "../loader";
import type { Activity } from "../types/activity";

export interface RunbookContext {
  venue_id: string;
  event_date: string;
  sport_tags: string[];
  venue_tags: string[];
  format_tags: string[];
  audience_tags: ("youth" | "adult" | "mixed")[];
}

const PHASE_ORDER: Activity["phase"][] = [
  "pre_day",
  "day_setup",
  "pre_game",
  "in_game",
  "post_game",
  "end_of_day",
  "post_day",
];

// An activity matches the context iff every populated tag dimension on the
// activity overlaps with the context (OR within a dim, AND across dims). An
// empty array on the activity = "no constraint on that dimension".
function matchesContext(activity: Activity, ctx: RunbookContext): boolean {
  const dims: Array<[string[], readonly string[]]> = [
    [activity.sport_tags, ctx.sport_tags],
    [activity.venue_tags, ctx.venue_tags],
    [activity.format_tags, ctx.format_tags],
    [activity.audience_tags, ctx.audience_tags],
  ];
  for (const [actTags, ctxTags] of dims) {
    if (actTags.length === 0) continue;
    const overlap = actTags.some((t) => ctxTags.includes(t));
    if (!overlap) return false;
  }
  return true;
}

function renderActivity(activity: Activity): string {
  const lines: string[] = [];
  lines.push(`### ${activity.name} (\`${activity.id}\`)`);
  lines.push("");
  lines.push(`- Accountable: ${activity.raci.accountable}`);
  lines.push(`- Expected completion: ${activity.expected_completion}`);
  lines.push(`- Tracking: ${activity.tracking_method}`);
  lines.push("");
  lines.push(activity.sop_body.trimEnd());
  return lines.join("\n");
}

export function renderRunbook(catalog: Catalog, ctx: RunbookContext): string {
  const matching = catalog.activities.filter((a) => matchesContext(a, ctx));

  const sections: string[] = [];
  sections.push(`# Runbook — ${ctx.venue_id} — ${ctx.event_date}`);

  for (const phase of PHASE_ORDER) {
    const phaseActivities = matching.filter((a) => a.phase === phase);
    if (phaseActivities.length === 0) continue;
    sections.push("");
    sections.push(`## ${phase}`);
    for (const activity of phaseActivities) {
      sections.push("");
      sections.push(renderActivity(activity));
    }
  }

  return sections.join("\n") + "\n";
}
