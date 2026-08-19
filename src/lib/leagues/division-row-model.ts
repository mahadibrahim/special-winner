// Pure presentation model for one division row on the youth league pages —
// the single place that decides team-vs-individual economics for display.
//
// A season is modelled as UP TO TWO PURCHASE PATHS, not one: `signupModes`
// decides which doors exist, and a DUAL-mode season ('individual' + 'team')
// genuinely has both. The winter club inventory is exactly that — a whole club
// team can enter, AND one kid can join alone — so collapsing it to a single
// price/CTA hid the team door on every Winter 1 row in prod. Neither
// skillLevel nor the mere presence of a teamPrice is load-bearing.
//
// Each path deep-links its own mode (`?mode=individual` / `?mode=team`) so the
// visitor lands in the flow they picked instead of the chooser interstitial —
// the same pattern the adult season cards use.
//
// The charge path recomputes every number server-side; these fields are
// display-only, same contract as /api/public/seasons.
//
// Group label: the age_groups row's authored `name` ("U6") is the truth and is
// used verbatim, exactly as program-card-v2.tsx renders it. Season-level
// minAge/maxAge are freeform admin inputs and are NULL on all current league
// inventory, which is why the old maxAge-only derivation rendered a blank
// group on every prod row; `U${maxAge}` survives only as a fallback.
import { isDualMode, isIndividualOnly, isTeamOnly, type SeasonForDerive } from "@/lib/programs/derive"

/** A `/api/public/seasons` row, narrowed to what a division row displays.
 *  Extends SeasonForDerive so the signup-mode helpers can read the real modes
 *  (and their pricingMode fallback) rather than a guess made here. */
export interface SeasonLike extends SeasonForDerive {
  id: string
  name: string
  price: number
  teamPrice: number | null
  effectiveTeamPrice?: number | null
  teamEarlyBirdActive?: boolean
  /** Per-player early-bird price, in dollars. Unlike the team side the API
   *  ships no server-computed "active" flag for it — see soloEarlyBird below. */
  earlyBirdPrice?: number | null
  earlyBirdDeadline?: string | null
  spotsLeft?: number | null
  termLabel?: string | null
  divisionGender?: string | null
  /** The authored age-group label ("U6") — the group column's real source. */
  ageGroup: { name: string; minAge: number; maxAge: number } | null
  // `status` is inherited from SeasonForDerive. This model never reads it —
  // callers filter to bookable seasons BEFORE building rows, because a row is
  // a checkout link and only status 'open' has a checkout.
}

/** One purchase door on a division: where it goes, what it costs, what it says. */
export interface DivisionPath {
  /** Mode-scoped checkout link — lands in the flow, not the chooser. */
  href: string
  /** Dollars, after any active early bird. */
  price: number
  /** Struck-through list price when an early bird is active, else null. */
  basePrice: number | null
  cta: string
}

export interface DivisionRowModel {
  id: string
  /** e.g. "U10" / "U10 boys" — the authored age-group label plus gender. */
  group: string
  /** "competitive" when a TEAM door exists (team-only or dual), else
   *  "developmental" (individual-only). Dual seasons are competitive club
   *  inventory that also happens to be solo-joinable. */
  kind: "competitive" | "developmental"
  /** Chip text: "Competitive" | "Developmental". */
  kindLabel: string
  /** Season name with a trailing "— U6" suffix stripped when it just repeats
   *  the group already shown in its own column. */
  seasonName: string
  termLabel: string | null
  /** "Sat · starts Dec 6" style; null parts omitted. */
  meta: string
  /** The per-kid door. Present iff individual signups are accepted. */
  solo: DivisionPath | null
  /** The whole-team door. Present iff team signups are accepted. */
  team: DivisionPath | null
  /**
   * Honest scarcity — remaining PLAYER spots, on rows with a SOLO path only.
   * Always null when there is no individual door: `spotsLeft` is
   * maxParticipants minus player registrations and there is no team-capacity
   * column anywhere in the schema, so "N team spots left" would be a number
   * the catalog cannot back.
   */
  spotsLeft: number | null
  /**
   * Nothing left to sell (raw spotsLeft === 0). Derived BEFORE the nulling
   * above so it stays honest for every row — consumers render a
   * non-interactive "Sold out" pill instead of any CTA.
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

/** Strip a trailing "— U6" / "- U6" that only repeats the group column. */
function stripGroupSuffix(name: string, ageLabel: string): string {
  if (!ageLabel) return name
  const escaped = ageLabel.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
  return name.replace(new RegExp(`\\s*[—–-]\\s*${escaped}\\s*$`, "i"), "").trim() || name
}

/**
 * Build the display row for one season.
 *
 * `now` is an explicit, defaulted parameter — the same shape early-bird.ts
 * uses — so the function stays deterministic under test while still resolving
 * the per-player early-bird window at render time. That window is the ONE
 * thing this model cannot take from the server: /api/public/seasons ships
 * `teamEarlyBirdActive` + `effectiveTeamPrice` for the team side but only the
 * raw `earlyBirdPrice` + `earlyBirdDeadline` for the player side, so the
 * deadline check below deliberately mirrors program-card-v2.tsx's clock check
 * (price set, positive, strictly under list, deadline in the future) rather
 * than inventing a second set of rules.
 */
export function divisionRowModel(season: SeasonLike, now: Date = new Date()): DivisionRowModel {
  // Doors, straight off signupModes (with the helpers' legacy pricingMode
  // fallback for rows that predate the column).
  const hasTeam = isTeamOnly(season) || isDualMode(season)
  const hasSoloRaw = isIndividualOnly(season) || isDualMode(season)
  // Unrecognised modes would otherwise leave a row with no door at all; a row
  // with no CTA is a dead end, so default to the per-kid path.
  const hasSolo = hasSoloRaw || !hasTeam

  const ageLabel =
    season.ageGroup?.name?.trim() || (season.maxAge != null ? `U${season.maxAge}` : "")
  const group = [ageLabel || null, season.divisionGender].filter(Boolean).join(" ")

  // ---- Per-player price + early bird
  const soloEarlyBirdActive =
    season.earlyBirdDeadline != null &&
    season.earlyBirdPrice != null &&
    season.earlyBirdPrice > 0 &&
    season.earlyBirdPrice < season.price &&
    new Date(season.earlyBirdDeadline).getTime() > now.getTime()
  const soloPrice = soloEarlyBirdActive ? (season.earlyBirdPrice as number) : season.price

  // ---- Team price + early bird (both server-computed)
  const teamListPrice = season.teamPrice ?? season.price
  const teamPrice = season.effectiveTeamPrice ?? teamListPrice
  const teamBasePrice =
    season.teamEarlyBirdActive && season.teamPrice != null && teamPrice < season.teamPrice
      ? season.teamPrice
      : null

  const solo: DivisionPath | null = hasSolo
    ? {
        href: `/register/${season.id}?mode=individual`,
        price: soloPrice,
        basePrice: soloEarlyBirdActive ? season.price : null,
        // "Book solo" only earns its word when a team door sits beside it.
        cta: hasTeam ? "Book solo →" : "Book →",
      }
    : null

  const team: DivisionPath | null = hasTeam
    ? {
        href: `/register/${season.id}?mode=team`,
        price: teamPrice,
        basePrice: teamBasePrice,
        cta: "Enter team →",
      }
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
    kind: hasTeam ? "competitive" : "developmental",
    kindLabel: hasTeam ? "Competitive" : "Developmental",
    seasonName: stripGroupSuffix(season.name, ageLabel),
    termLabel: season.termLabel ?? null,
    meta,
    solo,
    team,
    spotsLeft: solo ? rawSpotsLeft : null,
    soldOut: rawSpotsLeft === 0,
  }
}
