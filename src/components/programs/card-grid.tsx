import type { ReactNode } from "react"

/**
 * Container primitive for the two card-grid idioms used across the finders,
 * homepage, and catalog: a responsive 3-up grid and a fixed-width horizontal
 * scroll row (catalog's "featured" rows). Every call site that lays out
 * `ProgramCardV2`/`PickupCard` (or their skeleton) migrates through here so
 * the two layouts stay byte-equivalent everywhere rather than re-typed per
 * file. See docs/superpowers/plans/2026-07-23-card-system-consolidation.md,
 * Task 3.
 */
export interface CardGridProps {
  layout: "grid" | "scroll-row"
  children: ReactNode
}

export function CardGrid({ layout, children }: CardGridProps) {
  if (layout === "scroll-row") {
    return (
      <div className="flex gap-4 overflow-x-auto pb-3 -mx-4 px-4 sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8 snap-x snap-mandatory">
        {children}
      </div>
    )
  }
  return <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">{children}</div>
}

/**
 * Fixed-width wrapper for a single `scroll-row` child — the "featured rows"
 * idiom (catalog's "Filling up" / "Starting soon" rows). Kept as a separate
 * component (not inlined into `CardGrid`) because each item needs its own
 * `key` in the caller's `.map()`, which a wrapping container can't supply.
 */
export function CardGridItem({ children }: { children: ReactNode }) {
  return <div className="flex-none w-[300px] sm:w-[320px] snap-start">{children}</div>
}
