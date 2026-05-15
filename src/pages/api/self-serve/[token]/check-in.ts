/**
 * POST /api/self-serve/[token]/check-in — customer-dashboard variant.
 * Stamps checkedInAt on the target row. Idempotent.
 */
import type { APIRoute } from "astro";
import { and, eq, isNull } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { dropInBookings } from "@/lib/db/schema/drop-in";
import { fieldRentals } from "@/lib/db/schema/field-rentals";
import { verifyToken } from "@/lib/check-in/tokens-db";

export const prerender = false;
const json = (b: unknown, s: number) =>
  new Response(JSON.stringify(b), { status: s, headers: { "Content-Type": "application/json" } });

export const POST: APIRoute = async ({ params }) => {
  const tokenValue = params.token;
  if (!tokenValue) return json({ error: "Token required" }, 400);
  const v = await verifyToken(tokenValue);
  if (!v.ok) {
    const status = v.reason === "expired" || v.reason === "consumed" ? 410 : 404;
    return json({ error: v.reason }, status);
  }
  const tok = v.token;
  const now = new Date();
  const db = getDb();

  if (tok.kind === "drop_in_booking" || tok.kind === "walkin_session") {
    await db.update(dropInBookings).set({ checkedInAt: now, updatedAt: now })
      .where(and(eq(dropInBookings.id, tok.targetId), isNull(dropInBookings.checkedInAt)));
  } else if (tok.kind === "field_rental") {
    await db.update(fieldRentals).set({ checkedInAt: now, updatedAt: now })
      .where(and(eq(fieldRentals.id, tok.targetId), isNull(fieldRentals.checkedInAt)));
  }
  return json({ ok: true, checkedInAt: now.toISOString() }, 200);
};
