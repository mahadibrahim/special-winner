/**
 * GET /api/admin/classes/templates/:id/roster
 *
 * Admin roster view for one class-slot template: who's actively enrolled,
 * and this template's upcoming materialized sessions with seat counts.
 */
import type { APIRoute } from "astro";
import { and, asc, eq, gt, inArray } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { classSlotTemplates, classEnrollments } from "@/lib/db/schema/classes";
import { dropInSessions, dropInBookings } from "@/lib/db/schema/drop-in";
import { familyMembers } from "@/lib/db/schema/registrations";
import { requireOrgAdminAccess } from "@/lib/auth/roles";
import { ageOnDate } from "@/lib/classes/book-child";

export const prerender = false;

const json = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

// Seat-occupying booking statuses for the upcoming-sessions count. Deliberately
// excludes `waitlisted` — a waitlisted booking has not claimed a seat.
const BOOKED_STATUSES = ["confirmed", "pending_payment", "pending_claim"] as const;

export const GET: APIRoute = async (context) => {
  const auth = await requireOrgAdminAccess(context);
  if (!auth.authorized) return auth.response;
  const orgId = auth.organizationId;

  const id = context.params.id;
  if (!id) return json({ error: "Template id required" }, 400);

  const db = getDb();

  const [template] = await db
    .select()
    .from(classSlotTemplates)
    .where(and(eq(classSlotTemplates.id, id), eq(classSlotTemplates.organizationId, orgId)))
    .limit(1);
  if (!template) return json({ error: "Template not found" }, 404);

  const now = new Date();

  const enrollmentRows = await db
    .select({
      enrollmentId: classEnrollments.id,
      familyMemberId: classEnrollments.familyMemberId,
      childFirstName: familyMembers.firstName,
      childLastName: familyMembers.lastName,
      birthDate: familyMembers.birthDate,
      startedAt: classEnrollments.startedAt,
    })
    .from(classEnrollments)
    .innerJoin(familyMembers, eq(classEnrollments.familyMemberId, familyMembers.id))
    .where(and(eq(classEnrollments.slotTemplateId, id), eq(classEnrollments.status, "active")))
    .orderBy(asc(classEnrollments.startedAt));

  const enrollments = enrollmentRows.map((row) => ({
    enrollmentId: row.enrollmentId,
    familyMemberId: row.familyMemberId,
    childName: `${row.childFirstName} ${row.childLastName}`,
    age: row.birthDate ? ageOnDate(row.birthDate, now) : null,
    startedAt: row.startedAt,
  }));

  const sessionRows = await db
    .select({
      id: dropInSessions.id,
      startsAt: dropInSessions.startsAt,
      capacity: dropInSessions.capacity,
    })
    .from(dropInSessions)
    .where(
      and(
        eq(dropInSessions.classSlotTemplateId, id),
        eq(dropInSessions.status, "scheduled"),
        gt(dropInSessions.startsAt, now),
      ),
    )
    .orderBy(asc(dropInSessions.startsAt));

  const sessionIds = sessionRows.map((s) => s.id);
  const bookingRows = sessionIds.length
    ? await db
        .select({
          sessionId: dropInBookings.sessionId,
          paymentMethod: dropInBookings.paymentMethod,
        })
        .from(dropInBookings)
        .where(
          and(
            inArray(dropInBookings.sessionId, sessionIds),
            inArray(dropInBookings.status, BOOKED_STATUSES),
          ),
        )
    : [];

  const countsBySession = new Map<string, { bookedCount: number; trialCount: number }>();
  for (const booking of bookingRows) {
    const counts = countsBySession.get(booking.sessionId) ?? { bookedCount: 0, trialCount: 0 };
    counts.bookedCount += 1;
    if (booking.paymentMethod === "trial") counts.trialCount += 1;
    countsBySession.set(booking.sessionId, counts);
  }

  const upcomingSessions = sessionRows.map((session) => {
    const counts = countsBySession.get(session.id) ?? { bookedCount: 0, trialCount: 0 };
    return {
      sessionId: session.id,
      startsAt: session.startsAt,
      bookedCount: counts.bookedCount,
      capacity: session.capacity,
      trialCount: counts.trialCount,
    };
  });

  return json({ template, enrollments, upcomingSessions }, 200);
};
