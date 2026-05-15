/**
 * POST /api/dashboard/check-in
 * Body: { kind: "drop_in_booking" | "field_rental", targetId: string }
 *
 * The booker (or parent for minors via roster_entry — not handled here in
 * v1; rosters need the manager send-link surface) self-stamps checkedInAt
 * inside the rate-card's checkInWindowMinutes around startsAt.
 *
 * Idempotent: re-firing keeps the original timestamp.
 */
import type { APIRoute } from "astro";
import { and, eq, isNull } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { dropInBookings, dropInSessions, dropInRateCard } from "@/lib/db/schema/drop-in";
import { fieldRentals, fieldRentalRateCard } from "@/lib/db/schema/field-rentals";

export const prerender = false;
const json = (b: unknown, s: number) =>
  new Response(JSON.stringify(b), { status: s, headers: { "Content-Type": "application/json" } });

const VALID_KINDS = ["drop_in_booking", "field_rental"] as const;
type Kind = (typeof VALID_KINDS)[number];

export const POST: APIRoute = async ({ request, locals }) => {
  if (!locals.user) return json({ error: "Unauthorized" }, 401);

  let body: { kind?: string; targetId?: string };
  try { body = await request.json(); } catch { return json({ error: "Invalid JSON" }, 400); }
  const kind = body.kind as Kind;
  const targetId = body.targetId;
  if (!kind || !VALID_KINDS.includes(kind))
    return json({ error: "kind must be drop_in_booking | field_rental" }, 400);
  if (!targetId) return json({ error: "targetId required" }, 400);

  const db = getDb();
  const now = new Date();
  const userId = locals.user.id;
  const userEmail = locals.user.email;

  if (kind === "drop_in_booking") {
    const [row] = await db
      .select({
        bookingId: dropInBookings.id,
        userId: dropInBookings.userId,
        checkedInAt: dropInBookings.checkedInAt,
        startsAt: dropInSessions.startsAt,
        orgId: dropInSessions.organizationId,
      })
      .from(dropInBookings)
      .innerJoin(dropInSessions, eq(dropInSessions.id, dropInBookings.sessionId))
      .where(eq(dropInBookings.id, targetId))
      .limit(1);
    if (!row || row.userId !== userId) return json({ error: "Booking not found" }, 404);

    const [card] = await db
      .select({ checkInWindowMinutes: dropInRateCard.checkInWindowMinutes })
      .from(dropInRateCard)
      .where(eq(dropInRateCard.organizationId, row.orgId))
      .limit(1);
    const win = card?.checkInWindowMinutes ?? 60;
    const lo = new Date(row.startsAt.getTime() - win * 60_000);
    const hi = new Date(row.startsAt.getTime() + win * 60_000);
    if (now < lo || now > hi)
      return json({ error: `Check-in window is ${win} minutes around the event start.` }, 422);

    if (!row.checkedInAt) {
      await db.update(dropInBookings)
        .set({ checkedInAt: now, updatedAt: now })
        .where(and(eq(dropInBookings.id, targetId), isNull(dropInBookings.checkedInAt)));
    }
    return json({ ok: true, checkedInAt: row.checkedInAt ?? now.toISOString() }, 200);
  }

  // field_rental
  const [row] = await db
    .select()
    .from(fieldRentals)
    .where(eq(fieldRentals.id, targetId))
    .limit(1);
  if (!row) return json({ error: "Rental not found" }, 404);
  const isMine = row.renterUserId === userId || row.renterEmail === userEmail;
  if (!isMine) return json({ error: "Rental not found" }, 404);

  const [card] = await db
    .select({ checkInWindowMinutes: fieldRentalRateCard.checkInWindowMinutes })
    .from(fieldRentalRateCard)
    .where(eq(fieldRentalRateCard.organizationId, row.organizationId))
    .limit(1);
  const win = card?.checkInWindowMinutes ?? 60;
  const lo = new Date(row.startsAt.getTime() - win * 60_000);
  const hi = new Date(row.startsAt.getTime() + win * 60_000);
  if (now < lo || now > hi)
    return json({ error: `Check-in window is ${win} minutes around the event start.` }, 422);

  if (!row.checkedInAt) {
    await db.update(fieldRentals)
      .set({ checkedInAt: now, updatedAt: now })
      .where(and(eq(fieldRentals.id, targetId), isNull(fieldRentals.checkedInAt)));
  }
  return json({ ok: true, checkedInAt: row.checkedInAt ?? now.toISOString() }, 200);
};
