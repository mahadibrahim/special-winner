/**
 * POST /api/admin/pickup/start
 *
 * Start a pickup game right now. Creates a `drop_in_sessions` row with
 * kind:"pickup", startsAt = now, endsAt = now + durationMinutes.
 *
 * Body (JSON):
 *   spaceId          string   — bookableResourceId; the space/field to claim
 *   label            string   — sportOrClassLabel (e.g. "Soccer Pickup")
 *   capacity?        number   — max players; default 30
 *   walkUpRateCents? number   — nullable walk-up rate; default null (free)
 *   durationMinutes? number   — session length; default 120
 *
 * Responses:
 *   201 { sessionId }          — session created
 *   400 { error }              — missing/invalid body
 *   401 { error }              — not authenticated
 *   404 { error }              — space not in caller's org
 *
 * Tenant-scoped: the space (venueResource) must belong to a venue that
 * belongs to the caller's org (mirrors POST /api/admin/dropin/sessions).
 * Location scope is enforced via callerCanActOnVenue.
 */
import type { APIRoute } from "astro";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { requireAdminAccess } from "@/lib/auth/roles";
import { venueResources } from "@/lib/db/schema/scheduling";
import { callerCanActOnVenue } from "@/lib/admin/require-location-scope";
import { createPickupSession } from "@/lib/venue/create-pickup-session";
import { syncDropInSessionBlock } from "@/lib/scheduling/sync";
import { BlockConflictError } from "@/lib/scheduling/blocks";

export const prerender = false;

const json = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

const StartBody = z.object({
  spaceId: z.string().uuid("spaceId must be a UUID"),
  label: z.string().min(1, "label is required"),
  capacity: z.number().int().positive().optional(),
  walkUpRateCents: z.number().int().nonnegative().nullable().optional(),
  durationMinutes: z.number().int().positive().optional(),
});

export const POST: APIRoute = async (context) => {
  const auth = await requireAdminAccess(context);
  if (!auth.authorized) return auth.response;

  const orgId = context.locals.organization?.id;
  if (!orgId) return json({ error: "No organization context" }, 400);

  // Parse + validate body.
  let raw: unknown;
  try {
    raw = await context.request.json();
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }

  const parsed = StartBody.safeParse(raw);
  if (!parsed.success) {
    return json({ error: parsed.error.issues[0]?.message ?? "Invalid body" }, 400);
  }
  const body = parsed.data;

  const db = getDb();

  // Resolve the space (venueResource) → derive its venueId.
  const [space] = await db
    .select({ id: venueResources.id, venueId: venueResources.venueId })
    .from(venueResources)
    .where(eq(venueResources.id, body.spaceId))
    .limit(1);
  if (!space) return json({ error: "Space not found" }, 404);

  // Tenant guard: venue must belong to a location in the caller's org.
  // callerCanActOnVenue handles both super-admin (unscoped) and venue-manager
  // (location-scoped) — returning false means the venue is not in scope
  // (including non-existent venues).
  if (!(await callerCanActOnVenue(context, space.venueId))) {
    return json({ error: "Space not found" }, 404);
  }

  const { sessionId } = await createPickupSession(db, {
    organizationId: orgId,
    venueId: space.venueId,
    bookableResourceId: space.id,
    label: body.label,
    capacity: body.capacity,
    walkUpRateCents: body.walkUpRateCents ?? null,
    durationMinutes: body.durationMinutes,
    createdByUserId: auth.user.id,
  });

  // Claim the slot in the field-time ledger. A conflict returns 409 with
  // a warning (the session row has already been committed).
  try {
    await syncDropInSessionBlock(sessionId);
  } catch (err) {
    if (err instanceof BlockConflictError) {
      return json({ sessionId, warning: err.message }, 409);
    }
    throw err;
  }

  return json({ sessionId }, 201);
};
