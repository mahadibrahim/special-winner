// src/lib/landing/hero-tiles.ts
export type TileState = "live" | "coming_soon"

export interface HeroTile {
  /** Display name, e.g. "Soccer". */
  label: string
  /** Sport slug (seasons pages) or sport word (pickup) the finder filters on. */
  key: string
  state: TileState
  /** Micro-label above the name, e.g. "● Now registering" or "Coming soon". */
  statusLabel: string
  /** Sub-line, e.g. "3 sessions · 2 venues" or "Interested? Notify me". */
  meta: string
  /** Background for live tiles (oklch/hex). Ignored for coming_soon. */
  color?: string
  /** When set, a live tile links here instead of scroll-filtering the finder. */
  href?: string | null
}

/** A live tile links out only when it has an href; otherwise it scroll-filters. */
export function tileLinksOut(tile: HeroTile): boolean {
  return tile.state === "live" && Boolean(tile.href)
}
