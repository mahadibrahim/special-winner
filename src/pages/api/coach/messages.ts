/**
 * POST /api/coach/messages
 *
 * Coach → parent messaging. The outbound gateway (sendToParent) has
 * existed since the messaging build-out, but no coach-facing surface
 * called it — coaches had to ask an admin to broadcast. This endpoint
 * lets a coach message the parents of players on THEIR OWN roster:
 *
 *   - recipients are addressed by roster id, never by raw user id, so a
 *     coach can only ever reach parents through a roster row on a team
 *     they coach (isCoachOfTeam check + roster→team verification)
 *   - sends go through the gateway: parent channel preference (SMS /
 *     email / Telegram), opt-out handling, fallback, and conversation
 *     logging all apply — replies land in the staff inbox like any
 *     other conversation, senderType='coach'
 *
 * Body: { teamId: uuid, rosterIds: "all" | uuid[], body: string }
 * Returns per-recipient results so the UI can show partial failures.
 */
import type { APIRoute } from "astro";
import { z } from "zod";
import { and, eq, inArray } from "drizzle-orm";
import { getDb } from "@/lib/db";
import {
  teams,
  rosters,
  registrations,
  familyMembers,
  seasons,
  programs,
} from "@/lib/db/schema";
import { locations } from "@/lib/db/schema/organizations";
import { isCoachOfTeam } from "@/lib/auth/roles";
import { sendToParent } from "@/lib/messaging/gateway";
import { requireOrganizationContext } from "@/lib/auth";

const bodySchema = z.object({
  teamId: z.string().uuid(),
  rosterIds: z.union([z.literal("all"), z.array(z.string().uuid()).min(1)]),
  body: z.string().trim().min(1, "Message body is required").max(4000),
});

const json = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

export const POST: APIRoute = async (context) => {
  const { request, locals } = context;
  const user = locals.user;
  if (!user) {
    return json({ error: "Unauthorized" }, 401);
  }

  let parsed;
  try {
    parsed = bodySchema.safeParse(await request.json());
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }
  if (!parsed.success) {
    return json({ error: parsed.error.issues[0].message }, 400);
  }
  const { teamId, rosterIds, body } = parsed.data;

  // Coach must coach THIS team (head or assistant). Admins use the
  // broadcast surface instead — this endpoint is deliberately
  // roster-scoped coach tooling.
  const isCoach = await isCoachOfTeam(user.id, teamId);
  if (!isCoach) {
    return json({ error: "Access denied" }, 403);
  }

  const db = getDb();

  // Resolve the team's organization and pin it to the request host's org
  // (same pattern as the staff reply endpoint).
  const [teamOrg] = await db
    .select({ organizationId: locations.organizationId })
    .from(teams)
    .innerJoin(seasons, eq(teams.seasonId, seasons.id))
    .innerJoin(programs, eq(seasons.programId, programs.id))
    .innerJoin(locations, eq(programs.locationId, locations.id))
    .where(eq(teams.id, teamId))
    .limit(1);
  if (!teamOrg) {
    return json({ error: "Team not found" }, 404);
  }

  const orgContext = await requireOrganizationContext(context);
  if (!orgContext.hasOrganization) return orgContext.response;
  if (teamOrg.organizationId !== orgContext.organizationId) {
    return json({ error: "Forbidden" }, 403);
  }

  // Resolve recipients: roster rows on THIS team → registration →
  // the registering user (the parent for dependents; the player
  // themselves for adult self-registrations).
  // Include injured players — their parents still need team comms.
  // Only 'inactive' (removed) roster rows are excluded.
  const rosterConditions = [
    eq(rosters.teamId, teamId),
    inArray(rosters.status, ["active", "injured"] as const),
  ];
  if (rosterIds !== "all") {
    rosterConditions.push(inArray(rosters.id, rosterIds));
  }

  const recipients = await db
    .select({
      rosterId: rosters.id,
      parentUserId: registrations.registeredByUserId,
      playerFirstName: familyMembers.firstName,
      playerLastName: familyMembers.lastName,
    })
    .from(rosters)
    .innerJoin(registrations, eq(rosters.registrationId, registrations.id))
    .innerJoin(familyMembers, eq(registrations.familyMemberId, familyMembers.id))
    .where(and(...rosterConditions));

  if (recipients.length === 0) {
    return json({ error: "No matching roster members" }, 404);
  }
  // Explicit roster ids that didn't resolve to THIS team's active roster
  // are an authorization signal, not a soft miss — reject the whole send.
  if (rosterIds !== "all" && recipients.length !== rosterIds.length) {
    return json({ error: "One or more rosterIds are not on this team" }, 403);
  }

  // One send per distinct parent — a parent with two kids on the roster
  // gets the message once.
  const byParent = new Map<string, { players: string[] }>();
  for (const r of recipients) {
    const entry = byParent.get(r.parentUserId) ?? { players: [] };
    entry.players.push(`${r.playerFirstName} ${r.playerLastName}`);
    byParent.set(r.parentUserId, entry);
  }

  const sendResults = await Promise.all(
    [...byParent.keys()].map(async (parentUserId) => {
      const result = await sendToParent({
        parentUserId,
        organizationId: teamOrg.organizationId,
        body,
        senderType: "coach",
        senderUserId: user.id,
      });
      return { parentUserId, result };
    }),
  );

  const sent = sendResults.filter((r) => r.result.ok);
  const failed = sendResults
    .filter((r) => !r.result.ok)
    .map((r) => ({
      parentUserId: r.parentUserId,
      players: byParent.get(r.parentUserId)?.players ?? [],
      reason: r.result.ok ? null : r.result.reason,
    }));

  return json(
    {
      success: failed.length === 0,
      sentCount: sent.length,
      failedCount: failed.length,
      failed,
    },
    200,
  );
};
