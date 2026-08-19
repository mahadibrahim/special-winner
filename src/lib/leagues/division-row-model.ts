// Pure presentation model for one division row on the youth league pages —
// the single place that decides team-vs-individual economics for display.
// A season SELLS TEAM ENTRY iff the catalog priced it per team
// (teamPrice != null); that, not skillLevel, is the load-bearing
// discriminator, so a mislabeled level can never route a parent into the
// team checkout. The charge path recomputes everything server-side — these
// fields are display-only, same contract as /api/public/seasons.
//
// Group label: "U{maxAge}" — direct, not maxAge+1. There's no authoritative
// mapping for seasons.minAge/maxAge (freeform admin inputs); the age_groups
// table's seed fixture (name "U8" ↔ minAge 6, maxAge 8 in seed-e2e-tests.ts)
// and program-card-v2.tsx (which never derives a U-label from minAge/maxAge
// at all — it renders the pre-authored ageGroup.name field verbatim) offer
// no formula to copy. U${maxAge} matches this task's mandated tests.

interface SeasonLike {
  id: string
  name: string
  skillLevel: string | null
  teamPrice: number | null
  effectiveTeamPrice: number | null
  teamEarlyBirdActive: boolean
  price: number
  earlyBirdPrice: number | null
  earlyBirdDeadline: string | null
  spotsLeft: number | null
  dayOfWeek: string | null
  startDate: string | null
  termLabel: string | null
  minAge: number | null
  maxAge: number | null
  divisionGender: string | null
  status: string
}

export interface DivisionRowModel {
  id: string
  /** e.g. "U10 boys" — division label from ages + gender. */
  group: string
  /** "competitive" when the season sells team entry, else "developmental". */
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
  /** Honest scarcity: spotsLeft when the season caps participants, else null. */
  spotsLeft: number | null
}

// Mirrors DAY_LABEL's lowercase-keyed convention in division-slug.ts — real
// dayOfWeek values are the 3-char lowercase codes stored in
// seasons.day_of_week ('mon'..'sun', see programs.ts schema comment and the
// admin Zod enum in api/admin/seasons.ts), not full capitalized day names.
const DAY_ABBR: Record<string, string> = {
  mon: "Mon", tue: "Tue", wed: "Wed", thu: "Thu",
  fri: "Fri", sat: "Sat", sun: "Sun",
}

function shortStart(startDate: string | null): string | null {
  if (!startDate) return null
  const d = new Date(`${startDate}T00:00:00`)
  if (Number.isNaN(d.getTime())) return null
  return `starts ${d.toLocaleDateString("en-US", { month: "short", day: "numeric" })}`
}

export function divisionRowModel(season: SeasonLike): DivisionRowModel {
  const team = season.teamPrice != null
  const group = [
    season.maxAge != null ? `U${season.maxAge}` : null,
    season.divisionGender,
  ]
    .filter(Boolean)
    .join(" ")

  const price = team ? (season.effectiveTeamPrice ?? season.teamPrice!) : season.price
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

  return {
    id: season.id,
    group,
    kind: team ? "competitive" : "developmental",
    kindLabel: team ? "Competitive" : "Developmental",
    seasonName: season.name,
    termLabel: season.termLabel,
    meta,
    price,
    priceUnit: team ? "per team" : "per kid",
    basePrice,
    href: team ? `/register/${season.id}?mode=team` : `/register/${season.id}`,
    cta: team ? "Enter team →" : "Book →",
    spotsLeft: season.spotsLeft,
  }
}
