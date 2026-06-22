/**
 * GET /api/admin/check-in/day?venueId=&date=YYYY-MM-DD → day-view payload.
 * Admin + same-org-venue gated. Dashboard polls this every ~5s.
 */
import type { APIRoute } from "astro";
import { requireOrgAdminAccess } from "@/lib/auth/roles";
import {
  requireSameOrgVenue,
  ownershipDeniedResponse,
} from "@/lib/auth/require-resource-ownership";
import { getVenueDayEvents } from "@/lib/check-in/day-view";

export const prerender = false;

const json = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

const DATE_RX = /^\d{4}-\d{2}-\d{2}$/;
const UUID_RX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const GET: APIRoute = async (context) => {
  const auth = await requireOrgAdminAccess(context);
  if (!auth.authorized) return auth.response;
  const orgId = auth.organizationId;

  const venueId = context.url.searchParams.get("venueId");
  const date = context.url.searchParams.get("date");
  if (!venueId || !UUID_RX.test(venueId))
    return json({ error: "venueId required (UUID)" }, 400);
  if (!date || !DATE_RX.test(date))
    return json({ error: "date required (YYYY-MM-DD)" }, 400);

  const ownership = await requireSameOrgVenue(orgId, venueId);
  if (!ownership.ok) return ownershipDeniedResponse();

  const dayStart = new Date(`${date}T00:00:00.000Z`);
  const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);

  try {
    const result = await getVenueDayEvents(venueId, dayStart, dayEnd);
    if (!result) return json({ error: "Venue not found" }, 404);
    return json({ venueName: result.venueName, date, events: result.events }, 200);
  } catch (err) {
    console.error("[check-in/day]", err);
    return json({ error: "Internal error" }, 500);
  }
};
