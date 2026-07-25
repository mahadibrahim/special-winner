import type { APIRoute } from "astro";
import { db } from "@/lib/db";
import { teamRegistrations, teamInvitees } from "@/lib/db/schema";
import { and, eq } from "drizzle-orm";
import { z } from "zod";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

const BodySchema = z.object({ inviteeId: z.string().uuid() });

/**
 * DELETE /api/public/team-registrations/[token]/invitee — remove a PENDING
 * invitee from the roster (captain-only). A paid / charged-to-captain invitee
 * is never removed here (they've already contributed money) → 409. Idempotent
 * on an already-gone id (404).
 */
export const DELETE: APIRoute = async ({ params, request, locals }) => {
  const token = params.token;
  if (!token) return json({ error: "Missing token" }, 400);
  if (!db) return json({ error: "Database unavailable" }, 503);
  if (!locals.user) return json({ error: "Unauthorized" }, 401);

  let parsed;
  try {
    parsed = BodySchema.safeParse(await request.json());
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }
  if (!parsed.success) {
    return json({ error: "Invalid input", issues: parsed.error.issues }, 400);
  }

  try {
    const teamRow = await db
      .select({
        id: teamRegistrations.id,
        organizationId: teamRegistrations.organizationId,
        captainEmail: teamRegistrations.captainEmail,
        captainUserId: teamRegistrations.captainUserId,
      })
      .from(teamRegistrations)
      .where(eq(teamRegistrations.inviteToken, token))
      .limit(1);

    if (teamRow.length === 0) return json({ error: "Not found" }, 404);
    const team = teamRow[0]!;

    // Cross-tenant guard: 404 (not 403).
    const organization = locals.organization;
    if (!organization || team.organizationId !== organization.id) {
      return json({ error: "Not found" }, 404);
    }

    // Captain-only (match by id, fall back to email — captainUserId nullable).
    const isCaptain =
      team.captainUserId != null
        ? team.captainUserId === locals.user.id
        : team.captainEmail.toLowerCase() === locals.user.email.toLowerCase();
    if (!isCaptain) return json({ error: "Not found" }, 404);

    // Scope the lookup to THIS team so a captain can't remove another team's
    // invitee by guessing its id.
    const inviteeRow = await db
      .select({ id: teamInvitees.id, status: teamInvitees.status })
      .from(teamInvitees)
      .where(
        and(
          eq(teamInvitees.id, parsed.data.inviteeId),
          eq(teamInvitees.teamRegistrationId, team.id),
        ),
      )
      .limit(1);

    if (inviteeRow.length === 0) return json({ error: "Invitee not found" }, 404);

    // Only pending invitees are removable — a paid / charged-to-captain row
    // represents collected money and must not vanish.
    if (inviteeRow[0]!.status !== "pending") {
      return json(
        { error: "Cannot remove an invitee who has already paid" },
        409,
      );
    }

    await db.delete(teamInvitees).where(eq(teamInvitees.id, parsed.data.inviteeId));

    return json({ removed: true });
  } catch (err) {
    console.error("[team-registrations/[token]/invitee] delete failed", err);
    return json({ error: "Could not remove invitee" }, 500);
  }
};
