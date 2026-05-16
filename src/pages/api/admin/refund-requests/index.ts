import type { APIRoute } from "astro";
import { getDb } from "@/lib/db";
import { registrations } from "@/lib/db/schema/registrations";
import { programs, seasons } from "@/lib/db/schema/programs";
import { locations } from "@/lib/db/schema/organizations";
import { and, eq } from "drizzle-orm";
import { requireSameOrgRegistration } from "@/lib/auth/require-resource-ownership";
import { getLocationIdsForUser } from "@/lib/auth/location-scope";

export const prerender = false;

/**
 * Venue-manager-driven refund request.
 *
 * POST /api/admin/refund-requests
 * Body: { registrationId, reason, amountCents }
 *
 * Sets registrations.refundStatus = 'pending_approval' and records the
 * audit fields (refundRequestedAt, refundRequestReason,
 * refundRequestedByUserId). The super-admin's existing /admin/refunds
 * approval flow picks it up from there.
 *
 * Authorization:
 *   - Caller must be signed in.
 *   - Caller's org must own the registration (via requireSameOrgRegistration).
 *   - For non-super_admin callers, the registration's location must be in
 *     the user's getLocationIdsForUser() set.
 */
export const POST: APIRoute = async ({ request, locals }) => {
  if (!locals.user) {
    return json({ error: "Unauthorized" }, 401);
  }
  const orgId = locals.organization?.id;
  if (!orgId) {
    return json({ error: "No org context" }, 400);
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }

  const { registrationId, reason, amountCents } = (body ?? {}) as {
    registrationId?: string;
    reason?: string;
    amountCents?: number;
  };

  if (
    typeof registrationId !== "string" ||
    typeof reason !== "string" ||
    reason.trim().length === 0 ||
    typeof amountCents !== "number" ||
    !Number.isFinite(amountCents) ||
    amountCents <= 0
  ) {
    return json({ error: "Invalid request" }, 400);
  }

  // Tenant check
  const own = await requireSameOrgRegistration(orgId, registrationId);
  if (!own.ok) {
    return json({ error: "Not found" }, 404);
  }

  // Location scope for non-super_admins
  const userRoleNames = (locals.userRoles ?? []).map((r) => r.name);
  if (!userRoleNames.includes("super_admin")) {
    const allowedLocationIds = await getLocationIdsForUser(locals.user.id);
    if (allowedLocationIds.length === 0) {
      return json({ error: "Not found" }, 404);
    }
    // Resolve the registration's location and verify it's in scope.
    const [located] = await getDb()
      .select({ locationId: programs.locationId })
      .from(registrations)
      .innerJoin(seasons, eq(registrations.seasonId, seasons.id))
      .innerJoin(programs, eq(seasons.programId, programs.id))
      .where(eq(registrations.id, registrationId))
      .limit(1);
    if (!located || !allowedLocationIds.includes(located.locationId)) {
      return json({ error: "Not found" }, 404);
    }
  }

  await getDb()
    .update(registrations)
    .set({
      refundStatus: "pending_approval",
      refundAmountCents: amountCents,
      refundRequestedAt: new Date(),
      refundRequestReason: reason.trim(),
      refundRequestedByUserId: locals.user.id,
    })
    .where(eq(registrations.id, registrationId));

  return json({ ok: true }, 200);
};

function json(payload: unknown, status: number): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json" },
  });
}
