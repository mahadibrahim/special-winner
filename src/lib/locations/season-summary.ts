// Pure summarizer for the location pages' live "What's happening" league card
// and pricing band. Input is the /api/public/seasons payload (already
// early-bird-aware: effectivePrice/effectiveTeamPrice while the window is live).

interface PublicSeasonLike {
  status: string;
  termSlug?: string | null;
  termLabel?: string | null;
  startDate?: string | null;
  dayOfWeek?: string | null;
  price?: number | null;
  effectivePrice?: number | null;
  teamPrice?: number | null;
  effectiveTeamPrice?: number | null;
  registrationCloses?: string | null;
  signupModes?: string[] | null;
  program?: { programType?: string | null } | null;
  ageGroup?: { minAge?: number | null; maxAge?: number | null } | null;
}

export interface LeagueSummary {
  divisionCount: number;
  nights: string[];
  soloPrice: number | null;
  teamPrice: number | null;
  closes: string | null;
  /** True when at least one included season has status "open" (registerable
   * now). False means every included season is "forming" — interest-list
   * only, no pricing band, different card copy. */
  hasOpen: boolean;
  termSlug: string;
  termHref: string;
}

const DAY_LABEL: Record<string, string> = {
  mon: "Mon",
  tue: "Tue",
  wed: "Wed",
  thu: "Thu",
  fri: "Fri",
  sat: "Sat",
  sun: "Sun",
};

export interface UpcomingTerm {
  termSlug: string;
  termLabel: string;
  count: number;
  startDate: string | null;
  termHref: string;
}

/**
 * The "later" half of now-vs-later: forming future terms at this venue,
 * grouped by term, excluding the term the main card already shows. Each
 * links to its term page, which carries the interest-capture flow.
 */
export function summarizeUpcomingTerms(
  seasons: PublicSeasonLike[],
  excludeTermSlug: string | null,
): UpcomingTerm[] {
  const forming = seasons.filter(
    (s) =>
      s.status === "forming" &&
      (s.program?.programType ?? "league") === "league" &&
      (s.ageGroup?.minAge ?? 0) >= 18 &&
      s.termSlug &&
      s.termSlug !== excludeTermSlug,
  );
  const byTerm = new Map<string, UpcomingTerm>();
  for (const s of forming) {
    const slug = s.termSlug!;
    const existing = byTerm.get(slug);
    if (existing) {
      existing.count += 1;
      if (s.startDate && (!existing.startDate || s.startDate < existing.startDate)) {
        existing.startDate = s.startDate;
      }
    } else {
      byTerm.set(slug, {
        termSlug: slug,
        termLabel: s.termLabel ?? slug,
        count: 1,
        startDate: s.startDate ?? null,
        termHref: `/adult/leagues/soccer/${slug}`,
      });
    }
  }
  return [...byTerm.values()].sort((a, b) =>
    (a.startDate ?? "9999").localeCompare(b.startDate ?? "9999"),
  );
}

export function summarizeOpenLeagues(
  seasons: PublicSeasonLike[],
): LeagueSummary | null {
  // Include both "open" (registerable now) and "forming" (interest-list —
  // not yet open, but real enough to surface the card) adult league seasons.
  // Callers gate presentation on hasOpen.
  const candidates = seasons.filter(
    (s) =>
      (s.status === "open" || s.status === "forming") &&
      (s.program?.programType ?? "league") === "league" &&
      (s.ageGroup?.minAge ?? 0) >= 18,
  );
  if (candidates.length === 0) return null;

  // Scope everything to ONE term — the current registration window. Venues
  // pre-create future terms months ahead (a prod snapshot carried 39 forming
  // winter/spring divisions beside 7 open fall ones); aggregating across
  // terms produced "46 divisions from $750/team", mixing next winter's
  // pricing into this fall's card. Prefer the term that's open for
  // registration now; with no open term, the nearest forming term (by start
  // date) represents "what's next here".
  const anyOpen = candidates.filter((s) => s.status === "open");
  let activeTerm: string | null | undefined;
  if (anyOpen.length > 0) {
    activeTerm = anyOpen
      .slice()
      .sort((a, b) =>
        (a.registrationCloses ?? "9999").localeCompare(b.registrationCloses ?? "9999"),
      )[0].termSlug;
  } else {
    activeTerm = candidates
      .slice()
      .sort((a, b) => (a.startDate ?? "9999").localeCompare(b.startDate ?? "9999"))[0]
      .termSlug;
  }
  const included = candidates.filter((s) => s.termSlug === activeTerm);

  const openSeasons = included.filter((s) => s.status === "open");
  const hasOpen = openSeasons.length > 0;

  const nights: string[] = [];
  for (const s of included) {
    const d = s.dayOfWeek ? DAY_LABEL[s.dayOfWeek] : null;
    if (d && !nights.includes(d)) nights.push(d);
  }

  const soloPrices = included
    .filter((s) => (s.signupModes ?? ["individual"]).includes("individual"))
    .map((s) => s.effectivePrice ?? s.price)
    .filter((p): p is number => p != null);
  const teamPrices = included
    .map((s) => s.effectiveTeamPrice ?? s.teamPrice)
    .filter((p): p is number => p != null);

  // "Closes" is only meaningful for seasons you can register for today —
  // forming seasons have no registration window yet.
  const closes =
    openSeasons
      .map((s) => s.registrationCloses)
      .filter((c): c is string => !!c)
      .sort()[0] ?? null;

  const termSlug = included[0].termSlug ?? "";
  return {
    divisionCount: included.length,
    nights,
    soloPrice: soloPrices.length ? Math.min(...soloPrices) : null,
    teamPrice: teamPrices.length ? Math.min(...teamPrices) : null,
    closes,
    hasOpen,
    termSlug,
    termHref: termSlug
      ? `/adult/leagues/soccer/${termSlug}`
      : "/adult/leagues/soccer",
  };
}
