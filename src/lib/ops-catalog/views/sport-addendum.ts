// Sport addendum — ad-hoc view showing the activities tagged for a single
// sport. Useful when scoping a new sport launch or auditing what's specific
// to e.g. soccer vs. pickleball. Plain markdown, one section per activity.

import type { Catalog } from "../loader";

export function renderSportAddendum(catalog: Catalog, sportTag: string): string {
  const matched = catalog.activities.filter((a) => a.sport_tags.includes(sportTag));

  const sections: string[] = [];
  sections.push(`# Sport addendum — ${sportTag}`);

  if (matched.length === 0) {
    sections.push("");
    sections.push(`No sport-specific activities for ${sportTag}.`);
    return sections.join("\n") + "\n";
  }

  for (const activity of matched) {
    sections.push("");
    sections.push(`## ${activity.name} (\`${activity.id}\`)`);
    sections.push("");
    sections.push(`- Phase: ${activity.phase}`);
    sections.push(`- Accountable: ${activity.raci.accountable}`);
    sections.push("");
    sections.push(activity.sop_body.trimEnd());
  }

  return sections.join("\n") + "\n";
}
