/**
 * DELETE /api/classes/enrollments/:id — end a child's standing class
 * enrollment.
 *
 * PUT /api/classes/enrollments/:id — move a child's standing enrollment to
 * a different slot template. Body: `{ newSlotTemplateId }`.
 *
 * Both verify ownership first (the enrollment's child must belong to the
 * caller, via `familyMembers.parentUserId`) AND org scope (via the
 * enrollment's template) with one query, THEN delegate the actual mutation
 * to `endEnrollment`/`changeEnrollmentSlot` (src/lib/classes/enrollment.ts),
 * which trust the id at that point — same shape as
 * `POST /api/classes/bookings/:id/cancel`'s ownership-then-delegate split.
 */
import type { APIRoute } from "astro";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { classEnrollments, classSlotTemplates } from "@/lib/db/schema/classes";
import { familyMembers } from "@/lib/db/schema/registrations";
import {
  endEnrollment,
  changeEnrollmentSlot,
  type EnrollmentError,
} from "@/lib/classes/enrollment";

export const prerender = false;

const UUID_RX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const json = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

const ERROR_STATUS: Record<EnrollmentError["code"], number> = {
  template_not_found: 404,
  template_inactive: 400,
  template_full: 409,
  child_not_found: 404,
  no_membership: 403,
  already_enrolled: 409,
  // Child outside the destination template's min/max age — unprocessable,
  // same status the booking endpoint gives its own age_ineligible.
  age_ineligible: 422,
  enrollment_not_found: 404,
  // Destination slot is priced above the block the family paid for — a
  // conflict with the purchase, not a malformed request.
  rate_mismatch: 409,
};

/**
 * Confirms `id` names an enrollment whose child belongs to `parentUserId`
 * within `organizationId`. Returns nothing meaningful beyond existence —
 * never leaks whether the id exists in another tenant or under another
 * parent (both collapse to 404).
 */
async function ownedEnrollmentExists(
  id: string,
  parentUserId: string,
  organizationId: string,
): Promise<boolean> {
  const [row] = await getDb()
    .select({ id: classEnrollments.id })
    .from(classEnrollments)
    .innerJoin(familyMembers, eq(familyMembers.id, classEnrollments.familyMemberId))
    .innerJoin(
      classSlotTemplates,
      eq(classSlotTemplates.id, classEnrollments.slotTemplateId),
    )
    .where(
      and(
        eq(classEnrollments.id, id),
        eq(familyMembers.parentUserId, parentUserId),
        eq(classSlotTemplates.organizationId, organizationId),
      ),
    )
    .limit(1);
  return !!row;
}

export const DELETE: APIRoute = async ({ params, locals }) => {
  if (!locals.user) return json({ error: "Unauthorized" }, 401);
  if (!locals.organization) return json({ error: "No organization context" }, 400);

  const id = params.id;
  if (!id) return json({ error: "Enrollment id required" }, 400);

  if (!(await ownedEnrollmentExists(id, locals.user.id, locals.organization.id))) {
    return json({ error: "Enrollment not found" }, 404);
  }

  const { ended } = await endEnrollment(id);
  if (!ended) {
    // Ownership check above confirmed the row exists — a false here means a
    // concurrent end/change already flipped it since.
    return json({ error: "not_active", message: "Enrollment is not active" }, 409);
  }

  return json({ ok: true }, 200);
};

export const PUT: APIRoute = async ({ request, params, locals }) => {
  if (!locals.user) return json({ error: "Unauthorized" }, 401);
  if (!locals.organization) return json({ error: "No organization context" }, 400);

  const id = params.id;
  if (!id) return json({ error: "Enrollment id required" }, 400);

  let body: { newSlotTemplateId?: unknown };
  try {
    body = await request.json();
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }
  const newSlotTemplateId =
    typeof body.newSlotTemplateId === "string" ? body.newSlotTemplateId : null;
  if (!newSlotTemplateId || !UUID_RX.test(newSlotTemplateId)) {
    return json({ error: "newSlotTemplateId is required" }, 422);
  }

  if (!(await ownedEnrollmentExists(id, locals.user.id, locals.organization.id))) {
    return json({ error: "Enrollment not found" }, 404);
  }

  const result = await changeEnrollmentSlot(id, newSlotTemplateId);
  if (!result.ok) {
    const { code, message } = result.error;
    return json({ error: code, message }, ERROR_STATUS[code] ?? 400);
  }

  return json({ ok: true, enrollmentId: result.enrollmentId }, 200);
};
