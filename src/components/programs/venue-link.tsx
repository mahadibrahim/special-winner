"use client"

/**
 * Venue name rendered as a nested anchor into `/locations/{slug}`, with its
 * own hit area inside the card body (`stopPropagation` so it never fights a
 * card-level click handler). Falls back to plain text when there's no
 * location page to link to — never render a dead link (Global Constraint,
 * card-system-consolidation plan).
 *
 * Must only be used inside a non-anchor card root — an `<a>` cannot legally
 * nest another `<a>`.
 *
 * `relative z-10` stacks this link above the card's stretched primary-CTA
 * overlay (see `STRETCHED_LINK_CLASSES` in `card-shell.tsx`) so tapping the
 * venue name still navigates to the location page instead of being
 * swallowed by the whole-card link.
 */
export function VenueLink({ slug, label }: { slug?: string | null; label: string }) {
  if (!slug) return <>{label}</>
  return (
    <a
      href={`/locations/${slug}`}
      data-testid="card-venue-link"
      className="relative z-10 hover:text-ink hover:underline"
      onClick={(e) => e.stopPropagation()}
    >
      {label}
    </a>
  )
}
