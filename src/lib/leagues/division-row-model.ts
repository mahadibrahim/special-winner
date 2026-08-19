// Pure presentation model for one division row on the youth league pages —
// the single place that decides team-vs-individual economics for display.
// A season SELLS TEAM ENTRY ONLY iff `signupModes` says so, read through the
// canonical `isTeamOnly` helper. Neither skillLevel nor the mere presence of
// a teamPrice is load-bearing: a DUAL-mode season carries a teamPrice too, and
// routing it into the team checkout would hide the solo path from the one
// parent who came to sign up one kid. The charge path recomputes everything
// server-side — these fields are display-only, same contract as
// /api/public/seasons.
//
// Group label: "U{maxAge}" — direct, not maxAge+1. There's no authoritative
// mapping for seasons.minAge/maxAge (freeform admin inputs); the age_groups
// table's seed fixture (name "U8" ↔ minAge 6, maxAge 8 in seed-e2e-tests.ts)
// and program-card-v2.tsx (which never derives a U-label from minAge/maxAge
// at all — it renders the pre-authored ageGroup.name field verbatim) offer
// no formula to copy. U${maxAge} matches this task's mandated tests.
import { isTeamOnly, type SeasonForDerive } from "@/lib/programs/derive"

/** A `/api/public/seasons` row, narrowed to what a division row displays.
 *  Extends SeasonForDerive so `isTeamOnly` can read the real signup modes
 *  (and its pricingMode fallback) rather than a guess made here. */
export interface SeasonLike extends SeasonForDerive {
  id: string
  name: string
  price: number
  teamPrice: number | null
  effectiveTeamPrice?: number | null
  teamEarlyBirdActive?: boolean
  spotsLeft?: number | null
  termLabel?: string | null
  divisionGender?: string | null
  // `status` is inherited from SeasonForDerive. This model never reads it —
  // callers filter to bookable seasons BEFORE building rows, because a row is
  // a checkout link and only status 'open' has a checkout.
}

export interface DivisionRowModel {
  id: string
  /** e.g. "U10 boys" — division label from ages + gender. */
  group: string
  /** "competitive" when the season sells TEAM ENTRY ONLY, else "developmental". */
  kind: "competitive" | "developmental"
  /** Chip text: "Competitive" | "Developmental". */
  kindLabel: string
  seasonName: string
  termLabel: string | null
  /** "Sat · starts Dec 6" style; null parts omitted. */
  meta: string
  /** Dollars. Team rows use effectiveTeamPrice, individual rows use price. */
  price: number
  priceUnit: "per team" | "per kid"
  /** Struck-through base price when early-bird is active, else null. */
  basePrice: number | null
  /** "/register/<id>?mode=team" for team rows, "/register/<id>" otherwise. */
  href: string
  cta: string // "Enter team →" | "Book →"
  /**
   * Honest scarcity — remaining PLAYER spots, on INDIVIDUAL rows only.
   * Always null on team rows: `spotsLeft` is maxParticipants minus player
   * registrations and there is no team-capacity column anywhere in the
   * schema, so "N team spots left" would be a number the catalog cannot
   * back. Team rows therefore show no count at all.
   */
  spotsLeft: number | null
  /**
   * Nothing left to sell (raw spotsLeft === 0). Derived BEFORE the team-row
   * nulling above so it stays honest for both kinds — consumers render a
   * non-interactive "Sold out" pill instead of a book/enter CTA.
   */
  soldOut: boolean
}

// Mirrors DAY_LABEL's lowercase-keyed convention in division-slug.ts — real
// dayOfWeek values are the 3-char lowercase codes stored in
// seasons.day_of_week ('mon'..'sun', see programs.ts schema comment and the
// admin Zod enum in api/admin/seasons.ts), not full capitalized day names.
const DAY_ABBR: Record<string, string> = {
  mon: "Mon", tue: "Tue", wed: "Wed", thu: "Thu",
  fri: "Fri", sat: "Sat", sun: "Sun",
}

function shortStart(startDate: string | null | undefined): string | null {
  if (!startDate) return null
  const d = new Date(`${startDate}T00:00:00`)
  if (Number.isNaN(d.getTime())) return null
  return `starts ${d.toLocaleDateString("en-US", { month: "short", day: "numeric" })}`
}

export function divisionRowModel(season: SeasonLike): DivisionRowModel {
  // Team-ONLY sells team entry. Dual-mode (individual + team) falls through to
  // the individual row on purpose — the solo door is the one this page's
  // "developmental" lane promises, and the team door on a dual season is still
  // reachable from the season's own page.
  const team = isTeamOnly(season)
  const group = [
    season.maxAge != null ? `U${season.maxAge}` : null,
    season.divisionGender,
  ]
    .filter(Boolean)
    .join(" ")

  const price = team
    ? (season.effectiveTeamPrice ?? season.teamPrice ?? season.price)
    : season.price
  const basePrice =
    team && season.teamEarlyBirdActive && season.effectiveTeamPrice != null &&
    season.teamPrice != null && season.effectiveTeamPrice < season.teamPrice
      ? season.teamPrice
      : null

  const meta = [
    season.dayOfWeek ? DAY_ABBR[season.dayOfWeek] ?? season.dayOfWeek : null,
    shortStart(season.startDate),
  ]
    .filter(Boolean)
    .join(" · ")

  const rawSpotsLeft = season.spotsLeft ?? null

  return {
    id: season.id,
    group,
    kind: team ? "competitive" : "developmental",
    kindLabel: team ? "Competitive" : "Developmental",
    seasonName: season.name,
    termLabel: season.termLabel ?? null,
    meta,
    price,
    priceUnit: team ? "per team" : "per kid",
    basePrice,
    href: team ? `/register/${season.id}?mode=team` : `/register/${season.id}`,
    cta: team ? "Enter team →" : "Book →",
    spotsLeft: team ? null : rawSpotsLeft,
    soldOut: rawSpotsLeft === 0,
  }
}
