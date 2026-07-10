/**
 * Human-readable labels for `programTypeEnum`
 * (src/lib/db/schema/programs.ts: "league" | "camp" | "clinic" |
 * "tournament" | "training"). Single source of truth shared by
 * `programs-list.tsx` (the admin programs CRUD list) and
 * `blueprint-workspace.tsx` (Program Blueprint T6/T7's header badge) —
 * before this module each screen kept its own copy, and the blueprint
 * header rendered the raw enum value ("training") instead of the label
 * ("Training") (T6 review fix).
 */
export const PROGRAM_TYPE_LABELS: Record<string, string> = {
  league: "League",
  camp: "Camp",
  clinic: "Clinic",
  tournament: "Tournament",
  training: "Training",
};

export const programTypes = Object.entries(PROGRAM_TYPE_LABELS).map(([value, label]) => ({
  value,
  label,
}));

/**
 * Falls back to the raw value for a programType this map doesn't know
 * about, rather than rendering blank or throwing.
 */
export function programTypeLabel(programType: string): string {
  return PROGRAM_TYPE_LABELS[programType] ?? programType;
}
