/**
 * POST /api/admin/pickup/[sessionId]/add
 *
 * Rapid roll-call walk-up: register a person by name + phone, create a
 * CONFIRMED drop_in_booking with checkedInAt = now, and attempt to send
 * a waiver+pay SMS link. Phone-deduped: same phone on the same session
 * returns the existing booking (idempotent).
 *
 * Body (JSON):
 *   firstName  string  — required
 *   lastName   string  — required
 *   phone      string  — required (any US format)
 *
 * Responses:
 *   200 { bookingId, personName, userId, linkResult }
 *   400 { error }   — missing/invalid body
 *   401 { error }   — not authenticated
 *   404 { error }   — session not found or not in caller's org
 */
import type { APIRoute } from "astro";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { requireAdminAccess } from "@/lib/auth/roles";
import { callerCanActOnVenue } from "@/lib/admin/require-location-scope";
import { dropInSessions } from "@/lib/db/schema/drop-in";
import { addWalkUpToPickup } from "@/lib/venue/add-walkup-to-pickup";

export const prerender = false;

const json = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

const AddBody = z.object({
  firstName: z.string().min(1, "firstName is required"),
  lastName: z.string().min(1, "lastName is required"),
  phone: z
    .string()
    .min(7, "phone is required")
    .regex(/[\d]/, "phone must contain digits"),
});

export const POST: APIRoute = async (context) => {
  // ---- Auth gate ---------------------------------------------------------
  const auth = await requireAdminAccess(context);
  if (!auth.authorized) return auth.response;

  const orgId = context.locals.organization?.id;
  if (!orgId) return json({ error: "No organization context" }, 400);

  // ---- Resolve session ---------------------------------------------------
  const sessionId = context.params.sessionId;
  if (!sessionId) return json({ error: "sessionId param required" }, 400);

  const db = getDb();
  const [session] = await db
    .select({
      id: dropInSessions.id,
      organizationId: dropInSessions.organizationId,
      venueId: dropInSessions.venueId,
    })
    .from(dropInSessions)
    .where(eq(dropInSessions.id, sessionId))
    .limit(1);

  if (!session) return json({ error: "Session not found" }, 404);

  // Tenant guard: session must belong to caller's org.
  if (session.organizationId !== orgId) {
    return json({ error: "Session not found" }, 404);
  }

  // Location scope guard: venue must be in the caller's assigned locations
  // (super-admin is always allowed; venue-manager is location-scoped).
  if (!(await callerCanActOnVenue(context, session.venueId))) {
    return json({ error: "Session not found" }, 404);
  }

  // ---- Parse + validate body --------------------------------------------
  let raw: unknown;
  try {
    raw = await context.request.json();
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }

  const parsed = AddBody.safeParse(raw);
  if (!parsed.success) {
    return json(
      { error: parsed.error.issues[0]?.message ?? "Invalid body" },
      400,
    );
  }
  const { firstName, lastName, phone } = parsed.data;

  // ---- Core logic -------------------------------------------------------
  const result = await addWalkUpToPickup(db, {
    sessionId,
    firstName,
    lastName,
    phone,
    orgId,
    actorUserId: auth.user.id,
    nowIso: new Date().toISOString(),
  });

  return json(result, 200);
};
