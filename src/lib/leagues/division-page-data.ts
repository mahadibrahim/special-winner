// Shared server-side loader for the per-division league pages
// (/adult/leagues/<sport>/[term]/[division]). Fetches the term's catalog rows
// (live + completed, mirroring the term pages), resolves the division slug,
// and precomputes everything the layout renders — so the soccer and
// flag-football routes stay thin and can't drift from each other.
import { divisionSlug, divisionNaming, type DivisionNaming, type DivisionAudience } from "./division-slug";
import { filterYouthSeasons } from "./youth-seasons";
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
 * Build the same collision-safe division slug map loadDivisionPage resolves
 * `division` params against. Term pages need this too, to emit links that
 * are guaranteed to resolve to the division loadDivisionPage will actually
 * serve — building it separately (e.g. via divisionSlugMap, which takes one
 * shared ageGroupName for every row) would drift for youth, where the age
 * group differs per row. Audience gates whether ageGroupName is read per row
 * (youth) or forced null (adult); see the loadDivisionPage comment above for
 * why adult must stay null (adult seasons carry a real but irrelevant
 * ageGroup row too).
 */
export function divisionSlugMapForAudience(
  seasons: any[],
  audience: DivisionAudience,
): Map<string, any> {
  const ageGroupNameFor = (s: any): string | null =>
    audience === "youth" ? (s.ageGroup?.name ?? null) : null;
  const map = new Map<string, any>();
  for (const s of seasons) {
    let slug = divisionSlug(s, { ageGroupName: ageGroupNameFor(s) });
    if (map.has(slug)) slug = `${s.slug ?? s.id}-${s.location.slug}`;
    if (!map.has(slug)) map.set(slug, s);
  }
  return map;
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
  /** Defaults to "adult" so existing adult routes are unchanged. */
  audience?: DivisionAudience;
}): Promise<DivisionPageData | null> {
  const { origin, cookie, sportSlug, fallbackSportName, term, division } = opts;
  const audience = opts.audience ?? "adult";
  if (!term || !division) return null;

  const [liveRes, doneRes] = await Promise.all([
    fetch(`${origin}/api/public/seasons?sport=${sportSlug}&audience=${audience}&term=${term}`, { headers: { cookie } }),
    fetch(`${origin}/api/public/seasons?sport=${sportSlug}&audience=${audience}&term=${term}&status=completed`, { headers: { cookie } }),
  ]);
  const live: any[] = liveRes.ok ? ((await liveRes.json()).seasons ?? []) : [];
  const done: any[] = doneRes.ok ? ((await doneRes.json()).seasons ?? []) : [];
  const fetched: any[] = [...live, ...done];
  // `?audience=youth` also returns age-group-less rows (see youth-seasons.ts) —
  // one adult season saved without an age group would otherwise get a
  // /youth/leagues/.../<division> page under youth branding. Youth only; the
  // adult path keeps the raw fetched list, unchanged.
  const seasons: any[] = audience === "youth" ? filterYouthSeasons(fetched) : fetched;

  // Youth slugs/titles lead with the age group, which differs per row, so
  // divisionSlugMap's single shared-options signature doesn't fit here — use
  // divisionSlugMapForAudience instead, which resolves ageGroupName per row.
  // Term pages call the same function to emit division links, so a link
  // this loader will resolve can never diverge from what it points at.
  //
  // Guarded on audience === "youth": adult seasons carry a real ageGroup row
  // too (name "Adult 18+", seeded for every adult division), so this must
  // NOT fall through to `s.ageGroup?.name` unconditionally — that would leak
  // "Adult 18+" into every adult slug/title. Null for adult keeps both
  // divisionSlug and divisionNaming byte-identical to pre-audience behavior.
  const ageGroupNameFor = (s: any): string | null =>
    audience === "youth" ? (s.ageGroup?.name ?? null) : null;
  const slugMap = divisionSlugMapForAudience(seasons, audience);
  const season = slugMap.get(division);
  if (!season) return null;

  const sportName = season.sport?.name ?? fallbackSportName;
  const termLabel = season.termLabel ?? "This season";
  const naming = divisionNaming(season, sportName, termLabel, audience, ageGroupNameFor(season));
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
      .map(([slug, s]) => ({ slug, ...divisionNaming(s, sportName, termLabel, audience, ageGroupNameFor(s)), venueName: s.location.name })),
  };
}
