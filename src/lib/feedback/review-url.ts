import type { OrganizationSettings } from "@/lib/db/schema";
import type { BrandId } from "@/lib/branding/themes";

/**
 * Resolve the Google review destination for a feedback surface.
 *
 * Venue-specific listing wins (each facility's Google profile collects its
 * own reviews); the per-brand URL is the fallback for surfaces without a
 * venue or venues without an override. Returns null when the org has no
 * review destination configured for this surface at all.
 */
export function resolveGoogleReviewUrl(
  settings: Pick<OrganizationSettings, "feedback"> | null | undefined,
  brand: BrandId,
  venueId?: string | null,
): string | null {
  const feedback = settings?.feedback;
  if (!feedback) return null;
  const venueUrl = venueId
    ? (feedback.googleReviewUrlByVenue?.[venueId] ?? null)
    : null;
  return venueUrl ?? feedback.googleReviewUrl?.[brand] ?? null;
}
