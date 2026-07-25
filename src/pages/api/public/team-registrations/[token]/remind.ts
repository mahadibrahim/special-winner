import type { APIRoute } from "astro";
import { db } from "@/lib/db";
import { teamRegistrations, teamInvitees } from "@/lib/db/schema";
import { eq, asc } from "drizzle-orm";
import { sendTeamShareReminderEmail } from "@/lib/email/send";
import { brandFromHost } from "@/lib/organization/soccerone-routing";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

/**
 * POST /api/public/team-registrations/[token]/remind — re-send the "pay your
 * share" email to every still-unpaid invitee. Captain-only (stronger than the
 * sibling invite.ts, which anyone holding the token may call — reminders are a
 * spam vector, so we require the signed-in captain).
 */
export const POST: APIRoute = async ({ params, request, locals }) => {
  const token = params.token;
  if (!token) return json({ error: "Missing token" }, 400);
  if (!db) return json({ error: "Database unavailable" }, 503);
  if (!locals.user) return json({ error: "Unauthorized" }, 401);

  try {
    const teamRow = await db
      .select({
        id: teamRegistrations.id,
        organizationId: teamRegistrations.organizationId,
        seasonId: teamRegistrations.seasonId,
        teamName: teamRegistrations.teamName,
        captainName: teamRegistrations.captainName,
        captainEmail: teamRegistrations.captainEmail,
        captainUserId: teamRegistrations.captainUserId,
        inviteToken: teamRegistrations.inviteToken,
        paymentDeadline: teamRegistrations.paymentDeadline,
      })
      .from(teamRegistrations)
      .where(eq(teamRegistrations.inviteToken, token))
      .limit(1);

    if (teamRow.length === 0) return json({ error: "Not found" }, 404);
    const team = teamRow[0]!;

    // Cross-tenant guard: 404 (not 403) — hides existence of cross-tenant rows.
    const organization = locals.organization;
    if (!organization || team.organizationId !== organization.id) {
      return json({ error: "Not found" }, 404);
    }

    // Captain-only. Match by user id, falling back to email (captainUserId is
    // nullable). Non-captains get 404 — never leak the team's existence.
    const isCaptain =
      team.captainUserId != null
        ? team.captainUserId === locals.user.id
        : team.captainEmail.toLowerCase() === locals.user.email.toLowerCase();
    if (!isCaptain) return json({ error: "Not found" }, 404);

    // Only pending invitees still owe — skip paid + charged-to-captain, and
    // never remind the captain's own row.
    const captainEmailLower = team.captainEmail.toLowerCase();
    const invitees = await db
      .select({
        id: teamInvitees.id,
        email: teamInvitees.email,
        assignedShareCents: teamInvitees.assignedShareCents,
        status: teamInvitees.status,
      })
      .from(teamInvitees)
      .where(eq(teamInvitees.teamRegistrationId, team.id))
      .orderBy(asc(teamInvitees.invitedAt));

    const unpaid = invitees.filter(
      (i) => i.status === "pending" && i.email.toLowerCase() !== captainEmailLower,
    );

    if (unpaid.length === 0) return json({ sent: 0, unpaid: 0 });

    const origin = new URL(request.url).origin;
    const baseJoinUrl = `${origin}/register/${team.seasonId}?team=${encodeURIComponent(team.inviteToken)}`;
    const brand = brandFromHost(new URL(request.url).host);

    const results = await Promise.all(
      unpaid.map((i) =>
        sendTeamShareReminderEmail({
          to: i.email,
          teamName: team.teamName,
          captainName: team.captainName,
          joinUrl: `${baseJoinUrl}&i=${encodeURIComponent(i.id)}`,
          shareCents: i.assignedShareCents,
          deadline: team.paymentDeadline ?? undefined,
          brand,
        }),
      ),
    );

    const sent = results.filter((r) => r.success).length;
    return json({ sent, unpaid: unpaid.length });
  } catch (err) {
    console.error("[team-registrations/[token]/remind] failed", err);
    return json({ error: "Could not send reminders" }, 500);
  }
};
