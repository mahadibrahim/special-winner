/**
 * Shared request-time context for the block builder: the rate card, the
 * location's rental venues, the timezone every local-time computation is
 * anchored to, and the pricing context.
 *
 * The preview endpoint and the create endpoint both need exactly this, and
 * both must derive it the same way — a preview that priced against a
 * different rate card than the commit would quote a number the block never
 * charges.
 */
import { and, eq, gt, inArray, isNull, lt, or, asc } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { fieldRentalRateCard, type FieldRentalRateCard } from "@/lib/db/schema/field-rentals";
import { locations, organizations } from "@/lib/db/schema/organizations";
import { venues } from "@/lib/db/schema/teams";
import { resourceBlocks, venueResources } from "@/lib/db/schema/scheduling";
import { expandFamily } from "@/lib/scheduling/blocks";
import { blockReasonLabel } from "@/lib/rentals/availability";
import type { BlockPricingContext } from "./pricing";

export interface RentalVenueSummary {
  id: string;
  name: string;
  rentalHourlyRateCents: number | null;
}

export interface BlockBuildContext {
  rateCard: FieldRentalRateCard;
  venues: RentalVenueSummary[];
  /** Org/location IANA timezone — every local-minute computation anchors here. */
  timeZone: string;
  pricingContext: BlockPricingContext;
}

/**
 * Load the rate card (creating the org default row when missing, exactly as
 * GET /api/admin/rentals/rate-card does), the location's rental venues, and
 * the timezone. Returns null when the location does not exist.
 */
export async function loadBlockBuildContext(
  organizationId: string,
  locationId: string,
  brand: "soccerone" | "aspire",
): Promise<BlockBuildContext | null> {
  const db = getDb();

  const [location] = await db
    .select({
      id: locations.id,
      locationTimezone: locations.timezone,
      orgTimezone: organizations.timezone,
    })
    .from(locations)
    .innerJoin(organizations, eq(organizations.id, locations.organizationId))
    .where(eq(locations.id, locationId))
    .limit(1);
  if (!location) return null;

  let [rateCard] = await db
    .select()
    .from(fieldRentalRateCard)
    .where(eq(fieldRentalRateCard.organizationId, organizationId))
    .limit(1);
  if (!rateCard) {
    [rateCard] = await db
      .insert(fieldRentalRateCard)
      .values({ organizationId })
      .returning();
  }

  const venueRows = await db
    .select({
      id: venues.id,
      name: venues.name,
      rentalHourlyRateCents: venues.rentalHourlyRateCents,
    })
    .from(venues)
    .where(and(eq(venues.locationId, locationId), eq(venues.rentalEnabled, true)))
    .orderBy(asc(venues.createdAt));

  const timeZone = location.locationTimezone ?? location.orgTimezone ?? "America/New_York";

  const venueHourlyRateCents: Record<string, number | null> = {};
  for (const v of venueRows) venueHourlyRateCents[v.id] = v.rentalHourlyRateCents ?? null;

  return {
    rateCard,
    venues: venueRows,
    timeZone,
    pricingContext: {
      brand,
      timeZone,
      venueHourlyRateCents,
      defaultHourlyRateCents: rateCard.defaultHourlyRateCents,
    },
  };
}

export interface ConflictSlot {
  key: string;
  venueId: string;
  fieldNumber: number;
  startsAt: Date;
  endsAt: Date;
}

/**
 * Read the field-time ledger over the whole build range and label each slot
 * that is already claimed. Family-aware, so a booked half-field conflicts with
 * its parent exactly as the commit-time check does. Read-only: this is what
 * the builder shows, and the authoritative check still runs inside the create
 * transaction.
 */
export async function findLedgerConflicts(
  slots: ConflictSlot[],
): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  if (slots.length === 0) return out;

  const venueIds = [...new Set(slots.map((s) => s.venueId))];
  const rangeStart = new Date(Math.min(...slots.map((s) => s.startsAt.getTime())));
  const rangeEnd = new Date(Math.max(...slots.map((s) => s.endsAt.getTime())));

  const db = getDb();
  const resourceRows = await db
    .select({
      id: venueResources.id,
      venueId: venueResources.venueId,
      fieldNumber: venueResources.fieldNumber,
      parentResourceId: venueResources.parentResourceId,
    })
    .from(venueResources)
    .where(inArray(venueResources.venueId, venueIds));
  if (resourceRows.length === 0) return out;

  const now = new Date();
  const blockRows = await db
    .select({
      resourceId: resourceBlocks.resourceId,
      startsAt: resourceBlocks.startsAt,
      endsAt: resourceBlocks.endsAt,
      sourceType: resourceBlocks.sourceType,
      label: resourceBlocks.label,
    })
    .from(resourceBlocks)
    .where(
      and(
        inArray(
          resourceBlocks.resourceId,
          resourceRows.map((r) => r.id),
        ),
        lt(resourceBlocks.startsAt, rangeEnd),
        gt(resourceBlocks.endsAt, rangeStart),
        or(isNull(resourceBlocks.expiresAt), gt(resourceBlocks.expiresAt, now)),
      ),
    );
  if (blockRows.length === 0) return out;

  const blocksByResource = new Map<string, typeof blockRows>();
  for (const b of blockRows) {
    const list = blocksByResource.get(b.resourceId) ?? [];
    list.push(b);
    blocksByResource.set(b.resourceId, list);
  }

  // Family expansion is per-venue: the resource tree never spans venues.
  const rowsByVenue = new Map<string, typeof resourceRows>();
  for (const r of resourceRows) {
    const list = rowsByVenue.get(r.venueId) ?? [];
    list.push(r);
    rowsByVenue.set(r.venueId, list);
  }

  for (const slot of slots) {
    const venueRows = rowsByVenue.get(slot.venueId) ?? [];
    const topLevel = venueRows.find(
      (r) => r.parentResourceId === null && r.fieldNumber === slot.fieldNumber,
    );
    if (!topLevel) continue;
    const familyIds = expandFamily(topLevel.id, venueRows);
    for (const id of familyIds) {
      const hit = (blocksByResource.get(id) ?? []).find(
        (b) => b.startsAt < slot.endsAt && b.endsAt > slot.startsAt,
      );
      if (hit) {
        out.set(slot.key, `${blockReasonLabel(hit.sourceType)}: ${hit.label}`);
        break;
      }
    }
  }
  return out;
}
