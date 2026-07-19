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
