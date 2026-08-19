// Pure presentation model for one division row on the youth league pages —
// the single place that decides team-vs-individual economics for display.
// A season SELLS TEAM ENTRY iff the catalog priced it per team
// (teamPrice != null); that, not skillLevel, is the load-bearing
// discriminator, so a mislabeled level can never route a parent into the
// team checkout. The charge path recomputes everything server-side — these
// fields are display-only, same contract as /api/public/seasons.
//
// Group label: "U{maxAge}" — direct, not maxAge+1. Confirmed against the
// only concrete minAge/maxAge → name mapping in the repo (age_groups seed
// fixture in seed-e2e-tests.ts: name "U8" has minAge 6, maxAge 8) and against
// program-card-v2.tsx, which never derives a U-label from minAge/maxAge at
// all — it renders the pre-authored ageGroup.name field verbatim. This
// helper computes a label from a season's own minAge/maxAge (no ageGroup
// join available on this surface), so it must agree with the maxAge-direct
// convention rather than inventing an off-by-one.

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

const DAY_ABBR: Record<string, string> = {
  Monday: "Mon", Tuesday: "Tue", Wednesday: "Wed", Thursday: "Thu",
  Friday: "Fri", Saturday: "Sat", Sunday: "Sun",
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
