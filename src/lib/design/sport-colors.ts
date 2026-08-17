// Sport colours — one source for every surface that tints by sport.
//
// Resolution order is deliberate and unchanged from what ProgramCardV2 has
// always done:
//
//   1. `sports.color` on the row (admin-set, hex) — data wins
//   2. this fallback map, keyed by sport slug
//   3. a neutral grey, so an unknown sport still renders
//
// This map used to live privately inside program-card-v2.tsx while the hero
// sport tiles on the league category pages hardcoded their own inline
// oklch() literals. That meant the same sport could be one colour on a card
// and a different colour on the tile above it, and adding a sport meant
// hunting literals across pages. Extracting it is what makes a new sport
// (futsal, then basketball) a one-line change on both adult and youth.
//
// Sport colour answers "which game". It is a different axis from the accent
// roles in docs/design-system.md ("emerald = youth", "orange = adult"), which
// answer "who is this for". A surface may carry both.

/** Branded fallbacks for sports with no `color` set on the row. */
export const SPORT_FALLBACK_COLORS: Record<string, string> = {
  soccer: "#16a34a",
  // Futsal sits adjacent to soccer on purpose — it is soccer's sibling and
  // should read as related rather than as a rival product.
  futsal: "#0d9488",
  basketball: "#f97316",
  baseball: "#dc2626",
  football: "#a16207",
  hockey: "#0ea5e9",
};

/** Last resort when a sport is unknown to both the row and the map. */
export const SPORT_NEUTRAL_COLOR = "#52525b";

export interface SportColorSource {
  slug?: string | null;
  /** `sports.color` — admin-set hex, wins when present. */
  color?: string | null;
}

/**
 * Resolve the tint for a sport. Pass the sport row where you have one; pass
 * `{ slug }` alone on marketing surfaces that only know the slug.
 */
export function sportColor(sport: SportColorSource | null | undefined): string {
  if (!sport) return SPORT_NEUTRAL_COLOR;
  if (sport.color) return sport.color;
  if (sport.slug && SPORT_FALLBACK_COLORS[sport.slug]) {
    return SPORT_FALLBACK_COLORS[sport.slug];
  }
  return SPORT_NEUTRAL_COLOR;
}
