import type { SeasonForDerive } from "@/lib/programs/derive"

/** Shape of a season row from `/api/public/seasons`. Structurally satisfies
 *  both `SeasonForDerive` and `ProgramCardV2`'s `Season` prop. */
export interface ApiSeason extends SeasonForDerive {
  id: string
  name: string
  slug: string
  startDate: string
  endDate: string
  price: number
  teamPrice: number | null
  /** Team price after an active early bird — DISPLAY ONLY, the charge path
   *  recomputes it from cents (see /api/public/seasons). */
  effectiveTeamPrice?: number | null
  teamEarlyBirdActive?: boolean
  earlyBirdPrice?: number | null
  earlyBirdTeamPrice?: number | null
  earlyBirdDeadline?: string | null
  spotsLeft?: number | null
  deposit?: number | null
  allowDeposit?: boolean
  scheduleNotes: string | null
  dayOfWeek: string | null
  startTime: string | null
  endTime: string | null
  registeredCount: number
  maxParticipants: number | null
  pricingMode: string
  signupModes?: string[]
  status?: string
  signupMode?: "interest" | "register"
  registrationCloses?: string | null
  /** Term grouping ("Fall 2026" / "fall-2026") — set on league seasons. */
  termSlug?: string | null
  termLabel?: string | null
  /** Division axes, freeform admin inputs — advisory labels only, never a
   *  discriminator for pricing or signup mode (that is `signupModes`). */
  divisionGender?: string | null
  skillLevel?: string | null
  program: {
    id: string
    name: string
    slug: string
    programType: string
    audienceType: string
  }
  sport: { id: string; name: string; slug: string; icon: string | null; color: string | null }
  location: { id: string; name: string; slug: string; city: string | null; state: string | null }
  ageGroup: { id: string; name: string; minAge: number; maxAge: number } | null
  minAge: number | null
  maxAge: number | null
}
