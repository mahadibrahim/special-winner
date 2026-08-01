// Shared server-side loader for the per-division league pages
// (/adult/leagues/<sport>/[term]/[division]). Fetches the term's catalog rows
// (live + completed, mirroring the term pages), resolves the division slug,
// and precomputes everything the layout renders — so the soccer and
// flag-football routes stay thin and can't drift from each other.
import { divisionSlugMap, divisionNaming, type DivisionNaming } from "./division-slug";
import { venueAddress } from "@/lib/seo/venue-address";

const DAY_LONG: Record<string, string> = {
  mon: "Monday", tue: "Tuesday", wed: "Wednesday", thu: "Thursday",
  fri: "Friday", sat: "Saturday", sun: "Sunday",
};

export function fmtTime(t: string | null): string | null {
  if (!t) return null;
  const [h] = t.split(":").map(Number);
  const ampm = h >= 12 ? "PM" : "AM";
  const hr = h % 12 === 0 ? 12 : h % 12;
  return `${hr} ${ampm}`;
}

export interface DivisionPageData {
  season: any;
  naming: DivisionNaming;
  termLabel: string;
  sportName: string;
  dayName: string | null;
  timeWindow: string | null;
  isOpen: boolean;
  isForming: boolean;
  isCompleted: boolean;
  soloPrice: number | null;
  teamList: number | null;
  teamNow: number | null;
  teamEarlyBird: boolean;
  isAgeDivision: boolean;
  cityState: string;
  addressLine: string;
  siblings: Array<DivisionNaming & { slug: string; venueName: string }>;
}

/**
 * Load and shape one division's page data. Returns null when the term has no
 * rows or the slug doesn't resolve — callers redirect to the term page.
 */
export async function loadDivisionPage(opts: {
  origin: string;
  cookie: string;
  sportSlug: string;
  fallbackSportName: string;
  term: string | undefined;
  division: string | undefined;
}): Promise<DivisionPageData | null> {
  const { origin, cookie, sportSlug, fallbackSportName, term, division } = opts;
  if (!term || !division) return null;

  const [liveRes, doneRes] = await Promise.all([
    fetch(`${origin}/api/public/seasons?sport=${sportSlug}&audience=adult&term=${term}`, { headers: { cookie } }),
    fetch(`${origin}/api/public/seasons?sport=${sportSlug}&audience=adult&term=${term}&status=completed`, { headers: { cookie } }),
  ]);
  const live: any[] = liveRes.ok ? ((await liveRes.json()).seasons ?? []) : [];
  const done: any[] = doneRes.ok ? ((await doneRes.json()).seasons ?? []) : [];
  const seasons: any[] = [...live, ...done];

  const slugMap = divisionSlugMap(seasons);
  const season = slugMap.get(division);
  if (!season) return null;

  const sportName = season.sport?.name ?? fallbackSportName;
  const termLabel = season.termLabel ?? "This season";
  const naming = divisionNaming(season, sportName, termLabel);
  const venue = venueAddress(season.location.slug);

  const modes: string[] = season.signupModes ?? ["individual"];
  const soloPrice = modes.includes("individual") ? (season.effectivePrice ?? season.price ?? null) : null;
  const teamList = modes.includes("team") ? (season.teamPrice ?? null) : null;
  const teamNow = modes.includes("team") ? (season.effectiveTeamPrice ?? season.teamPrice ?? null) : null;

  const cityState = [season.location.city, season.location.state].filter(Boolean).join(", ");

  return {
    season,
    naming,
    termLabel,
    sportName,
    dayName: season.dayOfWeek ? DAY_LONG[season.dayOfWeek] ?? null : null,
    timeWindow:
      season.startTime && season.endTime
        ? `${fmtTime(season.startTime)}–${fmtTime(season.endTime)}`
        : null,
    isOpen: season.status === "open",
    isForming: season.status === "forming",
    isCompleted: season.status === "completed",
    soloPrice,
    teamList,
    teamNow,
    teamEarlyBird:
      teamNow != null && teamList != null && teamNow < teamList && !!season.teamEarlyBirdActive,
    isAgeDivision: season.minAge != null && season.minAge >= 30,
    cityState,
    addressLine: venue
      ? `${venue.address.streetAddress}, ${venue.address.addressLocality}, ${venue.address.addressRegion} ${venue.address.postalCode}`
      : cityState || season.location.name,
    siblings: [...slugMap.entries()]
      .filter(([, s]) => s.id !== season.id)
      .map(([slug, s]) => ({ slug, ...divisionNaming(s, sportName, termLabel), venueName: s.location.name })),
  };
}
