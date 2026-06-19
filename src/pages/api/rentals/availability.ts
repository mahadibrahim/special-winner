/**
 * GET /api/rentals/availability?venueId=&date=YYYY-MM-DD
 *
 * Public (no auth) — returns per-field free rental blocks for the venue on
 * the given date. 404 when the venue is missing or not rental-enabled.
 */
import type { APIRoute } from "astro";
import { getVenueRentalAvailability } from "@/lib/rentals/availability";
import { tzDayBoundsUtc } from "@/lib/activity-tracking/tz-day";

export const prerender = false;

const json = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

const DATE_RX = /^\d{4}-\d{2}-\d{2}$/;
const UUID_RX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const GET: APIRoute = async ({ url, locals }) => {
  const venueId = url.searchParams.get("venueId");
  const date = url.searchParams.get("date");
  if (!venueId) return json({ error: "venueId required" }, 400);
  if (!UUID_RX.test(venueId)) return json({ error: "venueId must be a valid id" }, 400);
  if (!date || !DATE_RX.test(date)) {
    return json({ error: "date required (YYYY-MM-DD)" }, 400);
  }

  // Compute day bounds in the org's local timezone so the rental window
  // (rentalOpenMinute/rentalCloseMinute, expressed as minutes of local day)
  // lines up with the tz-aware slots the booking grid constructs client-side.
  const orgTimeZone = locals.organization?.timezone ?? "America/New_York";
  const { startUtc, endUtc } = tzDayBoundsUtc(date, orgTimeZone);

  try {
    const result = await getVenueRentalAvailability(venueId, startUtc, endUtc, startUtc, date, orgTimeZone);
    if (!result) return json({ error: "Venue not found or rentals disabled" }, 404);

    return json(
      {
        venueName: result.venueName,
        date,
        fields: result.fields.map((f) => ({
          fieldNumber: f.fieldNumber,
          free: f.free.map((b) => ({
            startsAt: b.startsAt.toISOString(),
            endsAt: b.endsAt.toISOString(),
          })),
          busy: f.busy.map((b) => ({
            startsAt: b.startsAt.toISOString(),
            endsAt: b.endsAt.toISOString(),
            reason: b.reason,
          })),
        })),
      },
      200,
    );
  } catch (err) {
    console.error("[rentals/availability] fetch failed", err);
    return json({ error: "Internal error" }, 500);
  }
};
