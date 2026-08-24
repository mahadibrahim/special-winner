/**
 * POST /api/classes/enrollments — create a child's standing enrollment in a
 * class slot template. Body: `{ slotTemplateId, familyMemberId }`.
 * Delegates all gating (org scope, template active/capacity, child
 * ownership, membership class-benefit, dedupe) to `enrollChild`
 * (src/lib/classes/enrollment.ts).
 *
 * GET /api/classes/enrollments — list the caller's children's ACTIVE
 * enrollments, joined to their slot template (and venue) for display.
 * Org-scoped via the template join.
 */
import type { APIRoute } from "astro";
import { and, asc, eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { classSlotTemplates, classEnrollments } from "@/lib/db/schema/classes";
import { familyMembers } from "@/lib/db/schema/registrations";
import { venues } from "@/lib/db/schema/teams";
import { enrollChild, type EnrollmentError } from "@/lib/classes/enrollment";

export const prerender = false;

const UUID_RX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const json = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

/**
 * Maps every `EnrollmentError["code"]` to its HTTP status. `enrollChild`
 * never produces `enrollment_not_found` (that's `changeEnrollmentSlot`-only)
 * but the map covers it anyway so a shared switch never falls through.
 */
const ERROR_STATUS: Record<EnrollmentError["code"], number> = {
  template_not_found: 404,
  template_inactive: 400,
  template_full: 409,
  child_not_found: 404,
  no_membership: 403,
  already_enrolled: 409,
  // Child outside the template's min/max age — unprocessable, same status
  // the booking endpoint gives its own age_ineligible.
  age_ineligible: 422,
  enrollment_not_found: 404,
};

export const POST: APIRoute = async ({ request, locals }) => {
  if (!locals.user) return json({ error: "Unauthorized" }, 401);
  if (!locals.organization) return json({ error: "No organization context" }, 400);

  let body: { slotTemplateId?: unknown; familyMemberId?: unknown };
  try {
    body = await request.json();
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }

  const slotTemplateId =
    typeof body.slotTemplateId === "string" ? body.slotTemplateId : null;
  const familyMemberId =
    typeof body.familyMemberId === "string" ? body.familyMemberId : null;

  if (!slotTemplateId || !UUID_RX.test(slotTemplateId)) {
    return json({ error: "slotTemplateId is required" }, 422);
  }
  if (!familyMemberId || !UUID_RX.test(familyMemberId)) {
    return json({ error: "familyMemberId is required" }, 422);
  }

  const result = await enrollChild({
    slotTemplateId,
    familyMemberId,
    parentUserId: locals.user.id,
    organizationId: locals.organization.id,
  });

  if (!result.ok) {
    const { code, message } = result.error;
    return json({ error: code, message }, ERROR_STATUS[code] ?? 400);
  }

  return json({ ok: true, enrollmentId: result.enrollmentId }, 200);
};

export const GET: APIRoute = async ({ locals }) => {
  if (!locals.user) return json({ error: "Unauthorized" }, 401);
  if (!locals.organization) return json({ error: "No organization context" }, 400);

  const rows = await getDb()
    .select({
      id: classEnrollments.id,
      familyMemberId: classEnrollments.familyMemberId,
      childFirstName: familyMembers.firstName,
      childLastName: familyMembers.lastName,
      startedAt: classEnrollments.startedAt,
      slotTemplateId: classSlotTemplates.id,
      name: classSlotTemplates.name,
      sportLabel: classSlotTemplates.sportLabel,
      weekday: classSlotTemplates.weekday,
      startTime: classSlotTemplates.startTime,
      durationMins: classSlotTemplates.durationMins,
      capacity: classSlotTemplates.capacity,
      venueName: venues.name,
      venueAddress: venues.address,
    })
    .from(classEnrollments)
    .innerJoin(
      classSlotTemplates,
      eq(classSlotTemplates.id, classEnrollments.slotTemplateId),
    )
    .innerJoin(familyMembers, eq(familyMembers.id, classEnrollments.familyMemberId))
    .leftJoin(venues, eq(venues.id, classSlotTemplates.venueId))
    .where(
      and(
        eq(familyMembers.parentUserId, locals.user.id),
        eq(classSlotTemplates.organizationId, locals.organization.id),
        eq(classEnrollments.status, "active"),
      ),
    )
    .orderBy(asc(classSlotTemplates.weekday), asc(classSlotTemplates.startTime));

  return json(
    {
      enrollments: rows.map((r) => ({
        id: r.id,
        familyMemberId: r.familyMemberId,
        childName: `${r.childFirstName} ${r.childLastName}`,
        startedAt: r.startedAt,
        template: {
          id: r.slotTemplateId,
          name: r.name,
          sportLabel: r.sportLabel,
          weekday: r.weekday,
          startTime: r.startTime,
          durationMins: r.durationMins,
          capacity: r.capacity,
          venueName: r.venueName,
          venueAddress: r.venueAddress,
        },
      })),
    },
    200,
  );
};
