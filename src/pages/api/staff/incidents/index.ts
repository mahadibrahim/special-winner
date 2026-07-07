import type { APIRoute } from "astro";
import { getDb } from "@/lib/db";
import { incidents } from "@/lib/db/schema/incidents";
import { requireStaffAccess } from "@/lib/auth";
import {
  requireSameOrgVenue,
  requireSameOrgGame,
  requireSameOrgFamilyMember,
  ownershipDeniedResponse,
} from "@/lib/auth/require-resource-ownership";
import { createIncidentSchema } from "@/lib/incidents/incident-schema";
import { markCompleteBySystemEvent } from "@/lib/activity-tracking/mark-complete";

export const prerender = false;

// POST — fast same-day incident capture (v1 scope; no finalization/follow-up
// workflow here — see the incident-reporting plan). Any of
// super_admin/location_admin/coach may file (role.event_lead has no
// dedicated app role and maps to coach).
export const POST: APIRoute = async (context) => {
  const auth = await requireStaffAccess(context);
  if (!auth.authorized) return auth.response;

  let body: unknown;
  try {
    body = await context.request.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const result = createIncidentSchema.safeParse(body);
  if (!result.success) {
    return new Response(
      JSON.stringify({
        error: "Validation failed",
        details: result.error.flatten().fieldErrors,
      }),
      { status: 400, headers: { "Content-Type": "application/json" } },
    );
  }
  const data = result.data;

  const venueCheck = await requireSameOrgVenue(auth.organizationId, data.venueId);
  if (!venueCheck.ok) return ownershipDeniedResponse();

  if (data.gameId) {
    const gameCheck = await requireSameOrgGame(auth.organizationId, data.gameId);
    if (!gameCheck.ok) return ownershipDeniedResponse();
  }

  if (data.subject.subjectType === "participant") {
    const familyMemberCheck = await requireSameOrgFamilyMember(
      auth.organizationId,
      data.subject.familyMemberId,
    );
    if (!familyMemberCheck.ok) return ownershipDeniedResponse();
  }

  try {
    const [newIncident] = await getDb()
      .insert(incidents)
      .values({
        organizationId: auth.organizationId,
        venueId: data.venueId,
        gameId: data.gameId ?? null,
        reportedByUserId: auth.user.id,
        subjectType: data.subject.subjectType,
        subjectFamilyMemberId:
          data.subject.subjectType === "participant" ? data.subject.familyMemberId : null,
        subjectFreeTextName:
          data.subject.subjectType === "participant" ? null : data.subject.freeTextName,
        incidentType: data.incidentType,
        occurredAt: new Date(data.occurredAt),
        peopleInvolved: data.peopleInvolved,
        firstResponderName: data.firstResponderName,
        immediateCareGiven: data.immediateCareGiven,
        emergencyServicesCalled: data.emergencyServicesCalled,
        emergencyServicesCallTime: data.emergencyServicesCallTime
          ? new Date(data.emergencyServicesCallTime)
          : null,
        suspectedConcussion: data.suspectedConcussion,
        removedFromPlay: data.removedFromPlay ?? null,
        parentNotifiedOnsite: data.parentNotifiedOnsite,
        // Reserved-for-follow-on column: seed the pending state now so the
        // (not-yet-built) clearance-update admin action has something to
        // flip once written clearance is provided.
        concussionClearanceStatus: data.suspectedConcussion ? "pending" : null,
      })
      .returning();

    // Fire-and-forget: closing the game-day activity-tracking row must not
    // block the incident-report response, and a failure here doesn't
    // invalidate the incident that already saved. Mirrors the pattern in
    // src/lib/messaging/notifications.ts.
    if (data.gameId) {
      markCompleteBySystemEvent(data.gameId, "evt.incident_response_filed").catch((err) => {
        console.error(
          `[mark-complete] evt.incident_response_filed for game ${data.gameId} failed:`,
          err,
        );
      });
    }

    return new Response(JSON.stringify({ incident: newIncident }), {
      status: 201,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Error creating incident:", error);
    return new Response(JSON.stringify({ error: "Failed to create incident" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
};
