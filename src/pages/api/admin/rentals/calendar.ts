/**
 * GET /api/admin/rentals/calendar?locationId=&from=YYYY-MM-DD&to=YYYY-MM-DD
 *
 * Range availability for one location: every rental venue's fields, every
 * unexpired ledger claim in the window (rentals, games, drop-ins, external
 * bookings, internal reserves) and every live quote marker, in one pass. This
 * is what makes contention and facility programming show up in the same
 * picture as rentals.
 *
 * Read-only. The calendar never writes.
 */
import type { APIRoute } from "astro";
import { and, asc, eq, inArray, isNull } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { locations, organizations } from "@/lib/db/schema/organizations";
import { venues } from "@/lib/db/schema/teams";
import { venueResources } from "@/lib/db/schema/scheduling";
import { requireOrgAdminAccess } from "@/lib/auth/roles";
import {
  requireSameOrgLocation,
  ownershipDeniedResponse,
} from "@/lib/auth/require-resource-ownership";
import { tzDayBoundsUtc } from "@/lib/activity-tracking/tz-day";
import {
  getBusyBlocksForVenuesRange,
  getQuoteMarkersForVenuesRange,
} from "@/lib/scheduling/range";

export const prerender = false;

const json = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * A season is the point of this screen, but a decade is a denial-of-service
 * dressed as a query. 120 days covers a full winter block plus slack.
 */
const MAX_RANGE_DAYS = 120;
const DAY_MS = 86_400_000;

export const GET: APIRoute = async (context) => {
  const auth = await requireOrgAdminAccess(context);
  if (!auth.authorized) return auth.response;
  const orgId = auth.organizationId;

  const params = context.url.searchParams;
  const locationId = params.get("locationId") ?? "";
  const from = params.get("from") ?? "";
  const to = params.get("to") ?? "";

  if (!locationId) return json({ error: "locationId is required" }, 400);
  if (!DATE_RE.test(from) || !DATE_RE.test(to)) {
    return json({ error: "from and to must be YYYY-MM-DD dates" }, 400);
  }
  if (to < from) return json({ error: "to must not precede from" }, 400);

  // Calendar-day span, inclusive of both ends. String dates are ISO so the
  // UTC parse is exact; this is a length check, not local-time arithmetic.
  const spanDays =
    (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS + 1;
  if (spanDays > MAX_RANGE_DAYS) {
    return json({ error: `Range must be ${MAX_RANGE_DAYS} days or fewer` }, 400);
  }

  const owned = await requireSameOrgLocation(orgId, locationId);
  if (!owned.ok) return ownershipDeniedResponse();

  const db = getDb();

  // Timezone resolution matches loadBlockBuildContext: the location's zone
  // wins, then the org's. The finder generates candidate instants with the
  // same zone the builder prices against, so the two cannot disagree.
  const [zoneRow] = await db
    .select({
      locationTimezone: locations.timezone,
      orgTimezone: organizations.timezone,
    })
    .from(locations)
    .innerJoin(organizations, eq(organizations.id, locations.organizationId))
    .where(eq(locations.id, locationId))
    .limit(1);
  const timeZone =
    zoneRow?.locationTimezone ??
    zoneRow?.orgTimezone ??
    context.locals.organization?.timezone ??
    "America/New_York";

  const fromUtc = tzDayBoundsUtc(from, timeZone).startUtc;
  const toUtc = tzDayBoundsUtc(to, timeZone).endUtc;

  const venueRows = await db
    .select({
      id: venues.id,
      name: venues.name,
      fieldCount: venues.fieldCount,
      rentalOpenMinute: venues.rentalOpenMinute,
      rentalCloseMinute: venues.rentalCloseMinute,
    })
    .from(venues)
    .where(and(eq(venues.locationId, locationId), eq(venues.rentalEnabled, true)))
    .orderBy(asc(venues.createdAt));

  const venueIds = venueRows.map((v) => v.id);

  // Top-level, active resources are the rentable units. A venue with no
  // resource rows falls back to a bare 1..fieldCount enumeration, matching
  // getVenueRentalAvailability.
  const resourceRows =
    venueIds.length > 0
      ? await db
          .select({
            venueId: venueResources.venueId,
            fieldNumber: venueResources.fieldNumber,
          })
          .from(venueResources)
          .where(
            and(
              inArray(venueResources.venueId, venueIds),
              isNull(venueResources.parentResourceId),
              eq(venueResources.active, true),
            ),
          )
          .orderBy(asc(venueResources.venueId), asc(venueResources.fieldNumber))
      : [];

  const fieldsByVenue = new Map<string, number[]>();
  for (const r of resourceRows) {
    const list = fieldsByVenue.get(r.venueId) ?? [];
    list.push(r.fieldNumber);
    fieldsByVenue.set(r.venueId, list);
  }

  const [busy, quotes] = await Promise.all([
    getBusyBlocksForVenuesRange(venueIds, fromUtc, toUtc),
    getQuoteMarkersForVenuesRange(venueIds, fromUtc, toUtc),
  ]);

  return json(
    {
      timeZone,
      from,
      to,
      venues: venueRows.map((v) => {
        const resolved = fieldsByVenue.get(v.id);
        const fieldNumbers =
          resolved && resolved.length > 0
            ? resolved
            : Array.from({ length: Math.max(v.fieldCount ?? 1, 1) }, (_, i) => i + 1);
        return {
          id: v.id,
          name: v.name,
          fieldNumbers,
          rentalOpenMinute: v.rentalOpenMinute,
          rentalCloseMinute: v.rentalCloseMinute,
        };
      }),
      busy: busy.map((b) => ({
        venueId: b.venueId,
        fieldNumber: b.fieldNumber,
        startsAt: b.startsAt.toISOString(),
        endsAt: b.endsAt.toISOString(),
        sourceType: b.sourceType,
        sourceId: b.sourceId,
        label: b.label,
      })),
      quotes: quotes.map((q) => ({
        venueId: q.venueId,
        fieldNumber: q.fieldNumber,
        startsAt: q.startsAt.toISOString(),
        endsAt: q.endsAt.toISOString(),
        blockId: q.blockId,
        label: q.label,
      })),
    },
    200,
  );
};
