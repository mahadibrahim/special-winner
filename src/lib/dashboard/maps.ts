/** A venue we can route to — at least one of name/address should be set. */
export interface RoutableVenue {
  name?: string | null;
  address?: string | null;
}

/**
 * Builds a Google Maps directions URL for a venue. Prefers the street
 * address (more reliable), falls back to the venue name. Whitespace-only
 * addresses are treated as absent. Returns null when the venue has neither —
 * callers should not render a Directions link.
 */
export function directionsUrl(venue: RoutableVenue): string | null {
  const destination = venue.address?.trim() || venue.name?.trim() || "";
  if (!destination) return null;
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(destination)}`;
}
