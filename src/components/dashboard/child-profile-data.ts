/**
 * Pure mapping from the family-member + registrations API rows into the
 * shape the ChildProfile view renders. Kept free of React/DOM imports so it
 * can be unit-tested directly (tests/unit/dashboard/child-profile-data.test.ts).
 */

export interface Program {
  id: string
  name: string
  sport: string
  status: "active" | "upcoming" | "completed"
  startDate: Date
  endDate?: Date
  schedule?: string
  location?: string
}

export interface ScheduledEvent {
  id: string
  title: string
  type: "game" | "practice" | "class" | "camp"
  date: Date
  time: string
  location: string
}

export interface ChildProfileData {
  id: string
  firstName: string
  lastName: string
  // Null for adult self-registrants whose DOB is still pending
  // post-payment review.
  age: number | null
  dateOfBirth: Date | null
  avatarUrl?: string
  programs: Program[]
  upcomingEvents: ScheduledEvent[]
  seasonHistory: { season: string; program: string; sport: string; year: number }[]
}

export interface FamilyMemberApi {
  id: string
  firstName: string
  lastName: string
  birthDate: string | null // YYYY-MM-DD, null while DOB is pending
  photoUrl: string | null
}

export interface RegistrationApiRow {
  id: string
  status: string
  familyMember: { id: string }
  season: { name: string; startDate: string; endDate: string; scheduleNotes: string | null }
  program: { name: string }
  sport: { name: string }
  location?: { name: string; city: string | null } | null
}

// Parses a YYYY-MM-DD string in the viewer's local timezone so dates don't
// drift a day when a UTC-midnight Date crosses into yesterday.
export function parseLocalDate(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number)
  return new Date(y, (m ?? 1) - 1, d ?? 1)
}

export function computeAge(dob: Date, now: Date = new Date()): number {
  let age = now.getFullYear() - dob.getFullYear()
  const monthDiff = now.getMonth() - dob.getMonth()
  if (monthDiff < 0 || (monthDiff === 0 && now.getDate() < dob.getDate())) age--
  return Math.max(0, age)
}

function locationLabel(loc: RegistrationApiRow["location"]): string | undefined {
  if (!loc) return undefined
  return loc.city && loc.city.toLowerCase() !== loc.name.toLowerCase()
    ? `${loc.name}, ${loc.city}`
    : loc.name
}

/** Map the family member + their (already filtered) registrations into the profile. */
export function buildProfile(
  member: FamilyMemberApi,
  regs: RegistrationApiRow[],
  nowMs: number = Date.now(),
): ChildProfileData {
  const programs: Program[] = []
  const seasonHistory: ChildProfileData["seasonHistory"] = []
  const upcomingEvents: ScheduledEvent[] = []

  for (const r of regs) {
    if (r.status === "cancelled") continue
    const startDate = parseLocalDate(r.season.startDate)
    const endDate = r.season.endDate ? parseLocalDate(r.season.endDate) : undefined
    const location = locationLabel(r.location)

    let status: Program["status"]
    if (endDate && endDate.getTime() < nowMs) status = "completed"
    else if (startDate.getTime() > nowMs) status = "upcoming"
    else status = "active"

    programs.push({
      id: r.id,
      name: r.program.name,
      sport: r.sport.name,
      status,
      startDate,
      endDate,
      schedule: r.season.scheduleNotes ?? undefined,
      location,
    })

    if (status === "completed") {
      seasonHistory.push({
        season: r.season.name,
        program: r.program.name,
        sport: r.sport.name,
        year: (endDate ?? startDate).getFullYear(),
      })
    }

    if (startDate.getTime() >= nowMs) {
      upcomingEvents.push({
        id: r.id,
        title: `${r.program.name} — ${r.season.name}`,
        type: "class",
        date: startDate,
        time: r.season.scheduleNotes ?? "Schedule coming soon",
        location: location ?? "Location TBD",
      })
    }
  }

  // Active first, then most recent start date.
  const rank: Record<Program["status"], number> = { active: 0, upcoming: 1, completed: 2 }
  programs.sort(
    (a, b) => rank[a.status] - rank[b.status] || b.startDate.getTime() - a.startDate.getTime(),
  )
  upcomingEvents.sort((a, b) => a.date.getTime() - b.date.getTime())
  seasonHistory.sort((a, b) => b.year - a.year)

  const dateOfBirth = member.birthDate ? parseLocalDate(member.birthDate) : null

  return {
    id: member.id,
    firstName: member.firstName,
    lastName: member.lastName,
    age: dateOfBirth ? computeAge(dateOfBirth, new Date(nowMs)) : null,
    dateOfBirth,
    avatarUrl: member.photoUrl ?? undefined,
    programs,
    upcomingEvents,
    seasonHistory,
  }
}
