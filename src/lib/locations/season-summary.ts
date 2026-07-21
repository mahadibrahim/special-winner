// Pure summarizer for the location pages' live "What's happening" league card
// and pricing band. Input is the /api/public/seasons payload (already
// early-bird-aware: effectivePrice/effectiveTeamPrice while the window is live).

interface PublicSeasonLike {
  status: string;
  termSlug?: string | null;
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
  termSlug: string;
  termHref: string;
}

const DAY_LABEL: Record<string, string> = {
  mon: "Mon", tue: "Tue", wed: "Wed", thu: "Thu", fri: "Fri", sat: "Sat", sun: "Sun",
};

export function summarizeOpenLeagues(seasons: PublicSeasonLike[]): LeagueSummary | null {
  const open = seasons.filter(
    (s) =>
      s.status === "open" &&
      (s.program?.programType ?? "league") === "league" &&
      (s.ageGroup?.minAge ?? 0) >= 18,
  );
  if (open.length === 0) return null;

  const nights: string[] = [];
  for (const s of open) {
    const d = s.dayOfWeek ? DAY_LABEL[s.dayOfWeek] : null;
    if (d && !nights.includes(d)) nights.push(d);
  }

  const soloPrices = open
    .filter((s) => (s.signupModes ?? ["individual"]).includes("individual"))
    .map((s) => s.effectivePrice ?? s.price)
    .filter((p): p is number => p != null);
  const teamPrices = open
    .map((s) => s.effectiveTeamPrice ?? s.teamPrice)
    .filter((p): p is number => p != null);

  const closes = open
    .map((s) => s.registrationCloses)
    .filter((c): c is string => !!c)
    .sort()[0] ?? null;

  const termSlug = open[0].termSlug ?? "";
  return {
    divisionCount: open.length,
    nights,
    soloPrice: soloPrices.length ? Math.min(...soloPrices) : null,
    teamPrice: teamPrices.length ? Math.min(...teamPrices) : null,
    closes,
    termSlug,
    termHref: termSlug ? `/adult/leagues/soccer/${termSlug}` : "/adult/leagues/soccer",
  };
}
