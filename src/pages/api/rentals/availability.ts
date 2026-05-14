/**
 * GET /api/rentals/availability?venueId=&date=YYYY-MM-DD
 *
 * Public (no auth) — returns per-field free rental blocks for the venue on
 * the given date. 404 when the venue is missing or not rental-enabled.
 */
import type { APIRoute } from "astro";
import { getVenueRentalAvailability } from "@/lib/rentals/availability";

export const prerender = false;

const json = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

const DATE_RX = /^\d{4}-\d{2}-\d{2}$/;

export const GET: APIRoute = async ({ url }) => {
  const venueId = url.searchParams.get("venueId");
  const date = url.searchParams.get("date");
  if (!venueId) return json({ error: "venueId required" }, 400);
  if (!date || !DATE_RX.test(date)) {
    return json({ error: "date required (YYYY-MM-DD)" }, 400);
  }

  // Treat the date as a UTC calendar day. (Org-timezone handling is a
  // follow-up; for launch all venues are US/Eastern and the booking grid
  // shows local times client-side.)
  const dayStart = new Date(`${date}T00:00:00.000Z`);
  const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);

  const result = await getVenueRentalAvailability(venueId, dayStart, dayEnd);
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
      })),
    },
    200,
  );
};
