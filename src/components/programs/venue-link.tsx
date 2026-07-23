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
 */
export function VenueLink({ slug, label }: { slug?: string | null; label: string }) {
  if (!slug) return <>{label}</>
  return (
    <a
      href={`/locations/${slug}`}
      data-testid="card-venue-link"
      className="hover:text-ink hover:underline"
      onClick={(e) => e.stopPropagation()}
    >
      {label}
    </a>
  )
}
