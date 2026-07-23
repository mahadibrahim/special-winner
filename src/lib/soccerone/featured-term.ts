// Aggregate a term's division seasons into one hero-card payload.
//
// Why: the catalog stores each division as its own season. All 13 fall
// divisions share a start date, so "first open season" tiebreaks on
// creation order and the homepage ended up permanently advertising
// "Fall 2026 — Co-Ed D" — an arbitrary division as the flagship. When the
// featured season belongs to a term with multiple open divisions, the card
// should sell the TERM (name, division families, shared dates, uniform
// pricing) and route to /leagues where the finder helps people pick a
// division. Single open season → the direct division card stays.

import { CAPTAIN_DEPOSIT_DOLLARS } from "@/lib/registrations/team-deposit";

export interface SeasonLike {
  id: string;
  name: string;
  startDate: string | null;
  registrationCloses: string | null;
  termSlug: string | null;
  termLabel: string | null;
  price: number | null;
  teamPrice: number | null;
}

export interface TermAggregate {
  /** True when the featured season's (non-null) term has 2+ open seasons. */
  multi: boolean;
  termLabel: string | null;
  /** Seasons in the featured term (or just [featured] when single). */
  seasons: SeasonLike[];
  count: number;
  /** Ordered display families derived from division names. */
  families: string[];
  /** Earliest startDate (YYYY-MM-DD) across the group. */
  kickoff: string | null;
  /** Earliest non-null registrationCloses ISO instant across the group. */
  closes: string | null;
  /** "$120/player · team: $200 reserves it, $1,050 total" — only when uniform across the group. */
  uniformPrice: string | null;
}

const FAMILY_ORDER = ["Co-Ed", "Men's", "Women's", "30+/40+", "Futsal", "Open"] as const;

function familiesOf(names: string[]): string[] {
  const found = new Set<string>();
  for (const raw of names) {
    const n = raw.toLowerCase();
    if (/futsal/.test(n)) found.add("Futsal");
    if (/wom[ea]n/.test(n)) found.add("Women's");
    else if (/\bmen'?s\b/.test(n)) found.add("Men's");
    if (/co-?ed/.test(n)) found.add("Co-Ed");
    if (/[34]0\s*\+/.test(n)) found.add("30+/40+");
    if (!/futsal|wom[ea]n|\bmen'?s\b|co-?ed|[34]0\s*\+/.test(n)) found.add("Open");
  }
  return FAMILY_ORDER.filter((f) => found.has(f));
}

function fmtMoney(n: number): string {
  return `$${n.toLocaleString("en-US")}`;
}

export function aggregateFeaturedTerm(openSeasons: SeasonLike[]): TermAggregate {
  const featured = openSeasons[0] ?? null;
  const empty: TermAggregate = {
    multi: false, termLabel: null, seasons: [], count: 0,
    families: [], kickoff: null, closes: null, uniformPrice: null,
  };
  if (!featured) return empty;

  const group =
    featured.termSlug != null
      ? openSeasons.filter((s) => s.termSlug === featured.termSlug)
      : [featured];
  const multi = group.length > 1 && featured.termLabel != null;

  const dates = group.map((s) => s.startDate).filter((d): d is string => !!d).sort();
  const closesList = group
    .map((s) => s.registrationCloses)
    .filter((c): c is string => !!c)
    .sort((a, b) => new Date(a).getTime() - new Date(b).getTime());

  const prices = new Set(group.map((s) => s.price));
  const teamPrices = new Set(group.map((s) => s.teamPrice));
  let uniformPrice: string | null = null;
  if (prices.size === 1 && teamPrices.size === 1) {
    const [p] = prices; const [tp] = teamPrices;
    if (p != null) {
      uniformPrice = tp != null
        ? `${fmtMoney(p)}/player · team: $${CAPTAIN_DEPOSIT_DOLLARS} reserves it, ${fmtMoney(tp)} total`
        : `${fmtMoney(p)}/player`;
    }
  }

  return {
    multi,
    termLabel: featured.termLabel,
    seasons: group,
    count: group.length,
    families: familiesOf(group.map((s) => s.name)),
    kickoff: dates[0] ?? null,
    closes: closesList[0] ?? null,
    uniformPrice,
  };
}
