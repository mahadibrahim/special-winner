/**
 * Program-type-aware group noun for user-facing copy (Program Blueprint).
 * See "Language" in docs/superpowers/specs/2026-07-10-program-blueprint-design.md:
 *
 *   "the grouping entity in the schema is `teams`, but UI copy uses
 *   program-type-aware nouns — league → 'team', camp → 'camp group',
 *   class/clinic → 'class' / 'group'. No user-facing surface in this
 *   feature says 'team' for a non-league program."
 *
 * `programType` matches `programTypeEnum` in
 * src/lib/db/schema/programs.ts: "league" | "camp" | "clinic" |
 * "tournament" | "training". Accepts a plain string (not the enum type)
 * since callers often have it as a loosely-typed DB column value.
 *
 * Unknown/unrecognized program types fall back to "group" (never "team")
 * — the spec is explicit that "team" must never leak onto a non-league
 * surface, so an unrecognized type should never risk that by defaulting
 * to "team".
 */
export function groupNoun(programType: string): string {
  switch (programType) {
    case "league":
      return "team";
    case "camp":
      return "camp group";
    case "clinic":
    case "training":
      return "class";
    case "tournament":
      return "group";
    default:
      return "group";
  }
}
