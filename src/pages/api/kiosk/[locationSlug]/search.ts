/**
 * GET /api/kiosk/[locationSlug]/search?q=<query>
 *
 * Unauthenticated kiosk search. The locationSlug (location slug or UUID)
 * scopes every query to one facility. Returns confirmed drop-in bookings
 * and field rentals across every space in THIS facility for TODAY (local
 * day bounds at the facility's timezone — see dayBoundsInTz).
 *
 * Search matches phone digits only — last-4 of the drop-in user's phone,
 * or last-4 of the field rental's renterPhone. Matching on name used to be
 * enough for anyone standing at the kiosk to list other customers' names
 * and sessions after typing two characters; requiring the phone number
 * means only someone who actually knows it can surface a booking. Each
 * result's title is abbreviated to "First L." (see abbreviateName) so a
 * digit collision doesn't hand over a stranger's full name either.
 *
 * Returns at most 20 results. Fewer than 4 digits in the query → empty
 * results.
 */
import type { APIRoute } from "astro";
import { and, eq, gte, ilike, lt } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { dropInBookings, dropInSessions } from "@/lib/db/schema/drop-in";
import { fieldRentals } from "@/lib/db/schema/field-rentals";
import { users } from "@/lib/db/schema/users";
import { venues } from "@/lib/db/schema/teams";
import { requireKioskLocation } from "@/lib/check-in/kiosk-auth";
import { dayBoundsInTz } from "@/lib/time/day-bounds";

export const prerender = false;

const json = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

const MAX_RESULTS = 20;

/** "Casey Tester" -> "Casey T." — enough for the right person to recognize
 *  their own booking, not enough to be worth harvesting. */
function abbreviateName(first: string | null, last: string | null): string {
  const f = (first ?? "").trim();
  const l = (last ?? "").trim();
  if (!f && !l) return "Guest";
  if (!l) return f;
  return `${f} ${l[0].toUpperCase()}.`;
}

export const GET: APIRoute = async ({ params, url }) => {
  const slug = params.locationSlug ?? "";
  const kioskResult = await requireKioskLocation(slug);
  if (!kioskResult.ok) return kioskResult.response;
  const { location } = kioskResult;

  // Render times in the facility's local timezone — the kiosk and the
  // customer are physically at the facility. Falls back to Eastern (the
  // locations.timezone column default) if it somehow has no timezone set.
  const tz = location.timezone ?? "America/New_York";
  const fmtTime = (d: Date) =>
    d.toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
      timeZone: tz,
    });

  const q = url.searchParams.get("q") ?? "";
  // Phone digits only. A name-prefix search on a public kiosk listed other
  // customers' names to whoever was standing there; requiring the number
  // means only someone who knows it can surface a booking.
  const qDigits = q.replace(/\D/g, "");
  if (qDigits.length < 4) {
    return json({ results: [] }, 200);
  }
  const last4 = qDigits.slice(-4);

  // "Today" means today *at the facility* — see dayBoundsInTz. Using UTC
  // bounds here dropped evening sessions after 8pm Eastern.
  const { start: todayStart, end: todayEnd } = dayBoundsInTz(tz);

  const db = getDb();

  // ---- Drop-in bookings ----
  const dropInRows = await db
    .select({
      bookingId: dropInBookings.id,
      status: dropInBookings.status,
      checkedInAt: dropInBookings.checkedInAt,
      waiverSigned: dropInBookings.waiverSigned,
      sessionLabel: dropInSessions.sportOrClassLabel,
      startsAt: dropInSessions.startsAt,
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
        eq(venues.locationId, location.id),
        eq(dropInBookings.status, "confirmed"),
        gte(dropInSessions.startsAt, todayStart),
        lt(dropInSessions.startsAt, todayEnd),
        ilike(users.phone, `%${last4}`),
      ),
    )
    .orderBy(dropInSessions.startsAt, dropInBookings.id)
    .limit(MAX_RESULTS);

  // ---- Field rentals ----
  const rentalRows = await db
    .select({
      rentalId: fieldRentals.id,
      status: fieldRentals.status,
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
        eq(venues.locationId, location.id),
        eq(fieldRentals.status, "confirmed"),
        gte(fieldRentals.startsAt, todayStart),
        lt(fieldRentals.startsAt, todayEnd),
        ilike(fieldRentals.renterPhone, `%${last4}`),
      ),
    )
    .orderBy(fieldRentals.startsAt, fieldRentals.id)
    .limit(MAX_RESULTS);

  type Result = {
    kind: "drop_in_booking" | "field_rental";
    targetId: string;
    title: string;
    subtitle: string;
    waiverSigned: boolean;
    checkedIn: boolean;
  };

  const results: Result[] = [];

  for (const row of dropInRows) {
    const time = fmtTime(row.startsAt);
    results.push({
      kind: "drop_in_booking",
      targetId: row.bookingId,
      title: abbreviateName(row.firstName, row.lastName),
      subtitle: `${row.sessionLabel} — ${time}`,
      waiverSigned: row.waiverSigned,
      checkedIn: row.checkedInAt !== null,
    });
  }

  for (const row of rentalRows) {
    const time = fmtTime(row.startsAt);
    const [renterFirst, ...renterRest] = (row.renterName ?? "").trim().split(/\s+/);
    const renterLast = renterRest.join(" ");
    results.push({
      kind: "field_rental",
      targetId: row.rentalId,
      title: abbreviateName(renterFirst ?? "", renterLast),
      subtitle: `Field ${row.fieldNumber} — ${time}`,
      waiverSigned: row.waiverSigned,
      checkedIn: row.checkedInAt !== null,
    });
  }

  return json({ results: results.slice(0, MAX_RESULTS) }, 200);
};
