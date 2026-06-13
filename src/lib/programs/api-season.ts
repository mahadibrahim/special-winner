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
  scheduleNotes: string | null
  registeredCount: number
  maxParticipants: number | null
  pricingMode: string
  signupModes?: string[]
  status?: string
  signupMode?: "interest" | "register"
  registrationCloses?: string | null
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
}
