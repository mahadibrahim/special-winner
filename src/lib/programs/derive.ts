/**
 * Pure helpers for deriving display labels from a season + program record.
 * Used by the catalog and any program card. No React, no DOM.
 */

export interface SeasonForDerive {
  startDate: string;
  endDate: string;
  registeredCount: number;
  maxParticipants: number | null;
  pricingMode: string; // 'per_individual' | 'per_team' (legacy — derivable from signupModes)
  signupModes?: string[]; // ['individual'] | ['team'] | ['individual','team']
  registrationCloses?: string | null;
  scheduleNotes?: string | null;
  program: {
    programType: string; // 'league' | 'camp' | 'clinic' | 'tournament' | 'training'
    audienceType: string; // 'parents' | 'adults'
  };
  ageGroup: { minAge: number; maxAge: number } | null;
}

/** True when both individual and team signups are accepted. */
export function isDualMode(s: SeasonForDerive): boolean {
  const modes = s.signupModes ?? [];
  return modes.includes("individual") && modes.includes("team");
}

/** True when only team signups are accepted. */
export function isTeamOnly(s: SeasonForDerive): boolean {
  const modes = s.signupModes ?? [];
  if (modes.length > 0) return modes.includes("team") && !modes.includes("individual");
  return s.pricingMode === "per_team";
}

/** True when only individual signups are accepted. */
export function isIndividualOnly(s: SeasonForDerive): boolean {
  const modes = s.signupModes ?? [];
  if (modes.length > 0) return modes.includes("individual") && !modes.includes("team");
  return s.pricingMode !== "per_team";
}

/** Player-pricing unit label only (the per-individual side). */
export function deriveIndividualUnit(s: SeasonForDerive): string {
  const isYouth = s.program.audienceType === "parents";
  switch (s.program.programType) {
    case "camp":
      return isYouth ? "per kid · per week" : "per player · per week";
    case "clinic":
    case "training":
      return isYouth ? "per kid · per session" : "per player · per session";
    case "league":
    case "tournament":
    default:
      return isYouth ? "per kid" : "per player";
  }
}

/** Smart status pill replacing naked spot counts. */
export function deriveStatusPill(s: SeasonForDerive): {
  label: string;
  tone: "open" | "filling" | "last";
} {
  const cap = s.maxParticipants;
  if (cap == null) return { label: "Open", tone: "open" };
  const remaining = Math.max(0, cap - s.registeredCount);
  if (remaining <= 5) return { label: `Only ${remaining} left`, tone: "last" };
  const fill = s.registeredCount / cap;
  if (fill >= 0.8) return { label: "Filling up", tone: "filling" };
  if (fill >= 0.5) return { label: "Now enrolling", tone: "open" };
  return { label: "Open", tone: "open" };
}

/** Pricing unit label: "per kid" / "per player" / "per team" / "per session" / "per week". */
export function derivePriceUnit(s: SeasonForDerive): string {
  if (s.pricingMode === "per_team") return "per team";
  const isYouth = s.program.audienceType === "parents";
  switch (s.program.programType) {
    case "camp":
      return isYouth ? "per kid · per week" : "per player · per week";
    case "clinic":
    case "training":
      return isYouth ? "per kid · per session" : "per player · per session";
    case "tournament":
      return s.pricingMode === "per_team" ? "per team" : isYouth ? "per kid" : "per player";
    case "league":
    default:
      return isYouth ? "per kid" : "per player";
  }
}

/** Duration label: "8-week season" / "1-week camp" / "6 sessions" — derived
 *  from start/end date + program type. */
export function deriveDuration(s: SeasonForDerive): string {
  const start = new Date(s.startDate);
  const end = new Date(s.endDate);
  const days = Math.max(1, Math.round((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)));
  const weeks = Math.max(1, Math.round(days / 7));
  switch (s.program.programType) {
    case "camp":
      return weeks === 1 ? "1-week camp" : `${weeks}-week camp`;
    case "clinic":
    case "training":
      return `${weeks}-week clinic`;
    case "tournament":
      return weeks === 1 ? "1-day tournament" : `${weeks}-week tournament`;
    case "league":
    default:
      return `${weeks}-week season`;
  }
}

/** Time-of-day bucket for chip filtering: weekday morning / weekday evening / weekend. */
export function deriveDayBucket(s: SeasonForDerive): string {
  // Without explicit per-week schedule data we fall back to the start
  // date's day of the week. Better than nothing; the season's first
  // session typically anchors the rhythm.
  const d = new Date(s.startDate);
  const dow = d.getDay(); // 0 = Sun
  const isWeekend = dow === 0 || dow === 6;
  if (isWeekend) return "Weekend";
  // For weekday rough split — caller can refine when scheduleNotes is parsed.
  return "Weekday";
}

/** Audience inferred from age group (best-effort) and program audience type. */
export function deriveAudience(s: SeasonForDerive): "youth" | "adult" {
  if (s.ageGroup?.minAge != null && s.ageGroup.minAge >= 18) return "adult";
  if (s.ageGroup?.minAge != null && s.ageGroup.maxAge < 18) return "youth";
  return s.program.audienceType === "adults" || s.program.audienceType === "adult"
    ? "adult"
    : "youth";
}

/** Format a deadline for display with a near-deadline urgency flag.
 *  `urgent` is true when the deadline is 7 or fewer days away. */
export function deriveDeadline(
  s: SeasonForDerive,
): { label: string; urgent: boolean } | null {
  if (!s.registrationCloses) return null;
  const d = new Date(s.registrationCloses);
  const label = `Closes ${d.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" })}`;
  const msPerDay = 1000 * 60 * 60 * 24;
  const daysUntil = Math.ceil((d.getTime() - Date.now()) / msPerDay);
  return { label, urgent: daysUntil <= 7 };
}
