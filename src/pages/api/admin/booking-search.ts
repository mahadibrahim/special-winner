/**
 * GET /api/admin/booking-search?q=<name|phone>
 *
 * Admin-gated booking search. Returns today's confirmed drop-in bookings +
 * field rentals across all locations the caller can see (org/location-scoped
 * via allowedLocationIds — same pattern as /api/admin/person/[id]).
 *
 * Search matches:
 *  - Drop-in: user's first or last name (ilike) or last-4 of phone.
 *  - Field rental: renterName (ilike) or last-4 of renterPhone.
 *
 * Returns at most 20 results. Sub-2-char query → empty results. 401 if
 * unauthenticated or non-admin.
 */
import type { APIRoute } from "astro";
import { and, asc, eq, gte, ilike, inArray, lt, or } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { dropInBookings, dropInSessions } from "@/lib/db/schema/drop-in";
import { fieldRentals } from "@/lib/db/schema/field-rentals";
import { users } from "@/lib/db/schema/users";
import { venues } from "@/lib/db/schema/teams";
import { locations } from "@/lib/db/schema/organizations";
import { requireAdminAccess, requireOrganizationContext } from "@/lib/auth";
import { getEffectiveLocationIds } from "@/lib/admin/active-venue";

export const prerender = false;

const json = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

const MAX_RESULTS = 20;

export const GET: APIRoute = async (context) => {
  const auth = await requireAdminAccess(context);
  if (!auth.authorized) return auth.response;

  const orgContext = await requireOrganizationContext(context);
  if (!orgContext.hasOrganization) return orgContext.response;

  const q = context.url.searchParams.get("q") ?? "";
  if (q.trim().length < 2) {
    return json({ results: [] }, 200);
  }

  try {
    // ---- Resolve effective location ids (mirrors person/[id].ts) ----------------
    const effectiveIds = await getEffectiveLocationIds({
      userId: auth.user.id,
      userRoles: auth.roles,
      activeLocationId: context.locals.activeLocationId,
    });

    let allowedLocationIds: string[];
    if (effectiveIds === null) {
      // Super-admin with no pin: all locations in org.
      const orgLocations = await getDb()
        .select({ id: locations.id })
        .from(locations)
        .where(eq(locations.organizationId, orgContext.organizationId))
        .orderBy(asc(locations.createdAt));
      allowedLocationIds = orgLocations.map((l) => l.id);
    } else if (effectiveIds.length === 0) {
      return json({ results: [] }, 200);
    } else {
      allowedLocationIds = effectiveIds;
    }

    // Use the org's first location timezone for time formatting. If the admin is
    // pinned to one location, that location's timezone is used; otherwise fall
    // back to Eastern (the same default as the kiosk search).
    let tz = "America/New_York";
    if (allowedLocationIds.length > 0) {
      const [loc] = await getDb()
        .select({ timezone: locations.timezone })
        .from(locations)
        .where(eq(locations.id, allowedLocationIds[0]))
        .limit(1);
      if (loc?.timezone) tz = loc.timezone;
    }

    const fmtTime = (d: Date) =>
      d.toLocaleTimeString("en-US", {
        hour: "numeric",
        minute: "2-digit",
        timeZone: tz,
      });

    // UTC day bounds for today
    const now = new Date();
    const todayStart = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
    );
    const todayEnd = new Date(todayStart.getTime() + 86_400_000);

    const db = getDb();
    const term = `%${q}%`;
    const qDigits = q.replace(/\D/g, "");
    const last4 = qDigits.length >= 4 ? qDigits.slice(-4) : "";

    // ---- Drop-in bookings ----
    const dropInRows = await db
      .select({
        bookingId: dropInBookings.id,
        checkedInAt: dropInBookings.checkedInAt,
        waiverSigned: dropInBookings.waiverSigned,
        sessionLabel: dropInSessions.sportOrClassLabel,
        startsAt: dropInSessions.startsAt,
        venueLocationId: venues.locationId,
        firstName: users.firstName,
        lastName: users.lastName,
        phone: users.phone,
      })
      .from(dropInBookings)
      .innerJoin(dropInSessions, eq(dropInSessions.id, dropInBookings.sessionId))
      .innerJoin(venues, eq(venues.id, dropInSessions.venueId))
      .innerJoin(users, eq(users.id, dropInBookings.userId))
      .where(
        and(
          inArray(venues.locationId, allowedLocationIds),
          eq(dropInBookings.status, "confirmed"),
          gte(dropInSessions.startsAt, todayStart),
          lt(dropInSessions.startsAt, todayEnd),
          or(
            ilike(users.firstName, term),
            ilike(users.lastName, term),
            last4.length === 4 ? ilike(users.phone, `%${last4}`) : undefined,
          ),
        ),
      )
      .limit(MAX_RESULTS);

    // ---- Field rentals ----
    const rentalRows = await db
      .select({
        rentalId: fieldRentals.id,
        checkedInAt: fieldRentals.checkedInAt,
        waiverSigned: fieldRentals.waiverSigned,
        renterName: fieldRentals.renterName,
        renterPhone: fieldRentals.renterPhone,
        startsAt: fieldRentals.startsAt,
        fieldNumber: fieldRentals.fieldNumber,
      })
      .from(fieldRentals)
      .innerJoin(venues, eq(venues.id, fieldRentals.venueId))
      .where(
        and(
          inArray(venues.locationId, allowedLocationIds),
          eq(fieldRentals.status, "confirmed"),
          gte(fieldRentals.startsAt, todayStart),
          lt(fieldRentals.startsAt, todayEnd),
          or(
            ilike(fieldRentals.renterName, term),
            last4.length === 4 ? ilike(fieldRentals.renterPhone, `%${last4}`) : undefined,
          ),
        ),
      )
      .limit(MAX_RESULTS);

    type Result = {
      kind: "drop_in_booking" | "field_rental";
      targetId: string;
      name: string;
      timeLabel: string;
      waiverSigned: boolean;
      checkedIn: boolean;
    };

    const results: Result[] = [];

    for (const row of dropInRows) {
      const name = `${row.firstName ?? ""} ${row.lastName ?? ""}`.trim() || "(unknown)";
      const time = fmtTime(row.startsAt);
      results.push({
        kind: "drop_in_booking",
        targetId: row.bookingId,
        name,
        timeLabel: `${row.sessionLabel} — ${time}`,
        waiverSigned: row.waiverSigned,
        checkedIn: row.checkedInAt !== null,
      });
    }

    for (const row of rentalRows) {
      const time = fmtTime(row.startsAt);
      results.push({
        kind: "field_rental",
        targetId: row.rentalId,
        name: row.renterName,
        timeLabel: `Field ${row.fieldNumber} — ${time}`,
        waiverSigned: row.waiverSigned,
        checkedIn: row.checkedInAt !== null,
      });
    }

    return json({ results: results.slice(0, MAX_RESULTS) }, 200);
  } catch (err) {
    console.error("[/api/admin/booking-search]", err);
    return json({ error: "Internal server error" }, 500);
  }
};
