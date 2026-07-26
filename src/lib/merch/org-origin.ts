import { getDb } from "@/lib/db";
import { and, asc, eq } from "drizzle-orm";
import { locations } from "@/lib/db/schema/organizations";

/**
 * Org origin address for pickup-order Stripe Tax.
 *
 * Pickup orders have no ship-to address, so Stripe Tax needs an explicit
 * origin address to compute Ohio tax. We derive it from the org's primary
 * `locations` row (active, lowest sortOrder, oldest as tiebreaker) and fall
 * back to a Columbus, OH default when no location or fields are present.
 */
export interface StripeAddr {
  line1: string;
  city: string;
  state: string;
  postal_code: string;
  country: string;
}

const OHIO_FALLBACK: StripeAddr = {
  line1: "—",
  city: "Columbus",
  state: "OH",
  postal_code: "43215",
  country: "US",
};

export function locationToStripeAddress(
  loc: {
    addressLine1?: string | null;
    city?: string | null;
    state?: string | null;
    postalCode?: string | null;
  } | null,
): StripeAddr {
  if (!loc || !loc.state) return OHIO_FALLBACK;
  return {
    line1: loc.addressLine1 ?? OHIO_FALLBACK.line1,
    city: loc.city ?? OHIO_FALLBACK.city,
    state: loc.state,
    postal_code: loc.postalCode ?? OHIO_FALLBACK.postal_code,
    country: "US",
  };
}

export async function getOrgOriginAddress(orgId: string): Promise<StripeAddr> {
  const [loc] = await getDb()
    .select()
    .from(locations)
    .where(and(eq(locations.organizationId, orgId), eq(locations.active, true)))
    .orderBy(asc(locations.sortOrder), asc(locations.createdAt))
    .limit(1);
  return locationToStripeAddress(loc ?? null);
}
