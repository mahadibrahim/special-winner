export type TermSeason = {
  id: string;
  termSlug: string | null;
  termLabel: string | null;
  status: "open" | "forming" | "active" | "completed";
  startDate: string; // ISO date
};

export type TermGroup<T extends TermSeason = TermSeason> = {
  slug: string;
  label: string;
  earliestStart: string;
  hasOpen: boolean;
  seasons: T[];
};

export function groupByTerm<T extends TermSeason>(seasons: T[]): TermGroup<T>[] {
  const map = new Map<string, TermGroup<T>>();
  for (const s of seasons) {
    if (!s.termSlug) continue;
    const g = map.get(s.termSlug);
    if (g) {
      g.seasons.push(s);
      if (s.startDate < g.earliestStart) g.earliestStart = s.startDate;
      if (s.status === "open") g.hasOpen = true;
    } else {
      map.set(s.termSlug, {
        slug: s.termSlug,
        label: s.termLabel ?? s.termSlug,
        earliestStart: s.startDate,
        hasOpen: s.status === "open",
        seasons: [s],
      });
    }
  }
  return [...map.values()].sort((a, b) => a.earliestStart.localeCompare(b.earliestStart));
}

// Current term = earliest-starting term that has an open season; if none are
// open, the earliest term overall (e.g. a forming term). Null if no terms.
export function resolveCurrentTerm<T extends TermSeason>(seasons: T[]): TermGroup<T> | null {
  const groups = groupByTerm(seasons);
  if (groups.length === 0) return null;
  const open = groups.filter((g) => g.hasOpen);
  return (open.length > 0 ? open : groups)[0];
}
