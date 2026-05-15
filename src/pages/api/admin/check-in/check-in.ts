/**
 * POST /api/admin/check-in/check-in — body: { kind, targetId }
 * Idempotent. Stamps checkedInAt; for field_rental also sets
 * checkedInByUserId = manager. Drop-in's checkedInAt column has no
 * "by-user" tracking in v1.
 */
import type { APIRoute } from "astro";
import { and, eq, isNull } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { dropInBookings } from "@/lib/db/schema/drop-in";
import { fieldRentals } from "@/lib/db/schema/field-rentals";
import { requireAdminAccess } from "@/lib/auth/roles";

export const prerender = false;
const json = (b: unknown, s: number) =>
  new Response(JSON.stringify(b), { status: s, headers: { "Content-Type": "application/json" } });

const VALID_KINDS = ["drop_in_booking", "field_rental"] as const;
type Kind = (typeof VALID_KINDS)[number];

export const POST: APIRoute = async (context) => {
  const auth = await requireAdminAccess(context);
  if (!auth.authorized) return auth.response;
  const orgId = context.locals.organization?.id;
  if (!orgId) return json({ error: "No organization context" }, 400);

  let body: { kind?: string; targetId?: string };
  try { body = await context.request.json(); } catch { return json({ error: "Invalid JSON body" }, 400); }
  const kind = body.kind as Kind;
  const targetId = body.targetId;
  if (!kind || !VALID_KINDS.includes(kind))
    return json({ error: "kind must be drop_in_booking | field_rental" }, 400);
  if (!targetId) return json({ error: "targetId required" }, 400);

  const db = getDb();
  const now = new Date();

  if (kind === "drop_in_booking") {
    const [updated] = await db
      .update(dropInBookings)
      .set({ checkedInAt: now, updatedAt: now })
      .where(and(eq(dropInBookings.id, targetId), isNull(dropInBookings.checkedInAt)))
      .returning();
    const row = updated ?? (await db.select().from(dropInBookings).where(eq(dropInBookings.id, targetId)).limit(1))[0];
    if (!row) return json({ error: "Booking not found" }, 404);
    return json({ booking: row }, 200);
  }

  const [updated] = await db
    .update(fieldRentals)
    .set({ checkedInAt: now, checkedInByUserId: auth.user.id, updatedAt: now })
    .where(and(eq(fieldRentals.id, targetId), isNull(fieldRentals.checkedInAt)))
    .returning();
  const row = updated ?? (await db.select().from(fieldRentals).where(eq(fieldRentals.id, targetId)).limit(1))[0];
  if (!row || row.organizationId !== orgId) return json({ error: "Rental not found" }, 404);
  return json({ rental: row }, 200);
};
