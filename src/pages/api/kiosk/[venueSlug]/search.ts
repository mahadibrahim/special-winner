/**
 * GET /api/kiosk/[venueSlug]/search?q=<query>
 *
 * Unauthenticated kiosk search. The venueSlug (venue UUID for v1) scopes
 * every query to one venue. Returns confirmed drop-in bookings and field
 * rentals at THIS venue for TODAY (UTC day bounds).
 *
 * Search matches:
 *  - Drop-in: user's first or last name (ilike) or last-4 of phone.
 *  - Field rental: renterName (ilike) or last-4 of renterPhone.
 *
 * Returns at most 20 results. Empty / sub-2-char query → empty results.
 */
import type { APIRoute } from "astro";
import { and, eq, gte, ilike, lt, or } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { dropInBookings, dropInSessions } from "@/lib/db/schema/drop-in";
import { fieldRentals } from "@/lib/db/schema/field-rentals";
import { users } from "@/lib/db/schema/users";
import { requireKioskVenue } from "@/lib/check-in/kiosk-auth";

export const prerender = false;

const json = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

const MAX_RESULTS = 20;

export const GET: APIRoute = async ({ params, url }) => {
  const slug = params.venueSlug ?? "";
  const kioskResult = await requireKioskVenue(slug);
  if (!kioskResult.ok) return kioskResult.response;
  const { venue } = kioskResult;

  // Render times in the venue's local timezone — the kiosk and the customer
  // are physically at the venue. Falls back to Eastern (the venues.timezone
  // column default) if a location somehow has no timezone set.
  const tz = venue.timezone ?? "America/New_York";
  const fmtTime = (d: Date) =>
    d.toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
      timeZone: tz,
    });

  const q = url.searchParams.get("q") ?? "";
  if (q.trim().length < 2) {
    return json({ results: [] }, 200);
  }

  // UTC day bounds for today
  const now = new Date();
  const todayStart = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  );
  const todayEnd = new Date(todayStart.getTime() + 86_400_000);

  const db = getDb();
  const term = `%${q}%`;
  // Extract only digits from the raw query and take the last 4. This lets a
  // user type "0182" or "(614) 0182" and still match the DB's 10-digit phone
  // field via a trailing-4 ilike. normalizePhone() requires 10 digits so it's
  // not suitable for extracting a 4-digit fragment.
  const qDigits = q.replace(/\D/g, "");
  const last4 = qDigits.length >= 4 ? qDigits.slice(-4) : "";

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
    .innerJoin(users, eq(users.id, dropInBookings.userId))
    .where(
      and(
        eq(dropInSessions.venueId, venue.id),
        eq(dropInBookings.status, "confirmed"),
        gte(dropInSessions.startsAt, todayStart),
        lt(dropInSessions.startsAt, todayEnd),
        or(
          ilike(users.firstName, term),
          ilike(users.lastName, term),
          // last-4 phone match — only apply when the input normalizes to ≥4 digits
          last4.length === 4 ? ilike(users.phone, `%${last4}`) : undefined,
        ),
      ),
    )
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
    .where(
      and(
        eq(fieldRentals.venueId, venue.id),
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
    title: string;
    subtitle: string;
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
      title: name,
      subtitle: `${row.sessionLabel} — ${time}`,
      waiverSigned: row.waiverSigned,
      checkedIn: row.checkedInAt !== null,
    });
  }

  for (const row of rentalRows) {
    const time = fmtTime(row.startsAt);
    results.push({
      kind: "field_rental",
      targetId: row.rentalId,
      title: row.renterName,
      subtitle: `Field ${row.fieldNumber} — ${time}`,
      waiverSigned: row.waiverSigned,
      checkedIn: row.checkedInAt !== null,
    });
  }

  return json({ results: results.slice(0, MAX_RESULTS) }, 200);
};
