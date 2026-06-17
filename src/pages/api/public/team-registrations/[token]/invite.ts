import type { APIRoute } from "astro";
import { db } from "@/lib/db";
import { teamRegistrations } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { sendTeamInviteEmail } from "@/lib/email/send";
import { brandFromHost } from "@/lib/organization/soccerone-routing";

const BodySchema = z.object({
  emails: z
    .array(z.string().trim().toLowerCase().email().max(320))
    .min(1)
    .max(50),
});

/**
 * Send team-invite emails to prospective teammates. The captain (or anyone
 * holding the invite token) supplies a list of emails; each gets the one-door
 * join link tagged to this team. Tenant-scoped via locals.organization,
 * mirroring the sibling GET [token].ts handler.
 */
export const POST: APIRoute = async ({ params, request, locals }) => {
  const token = params.token;
  if (!token) {
    return new Response(JSON.stringify({ error: "Missing token" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  if (!db) {
    return new Response(JSON.stringify({ error: "Database unavailable" }), {
      status: 503,
      headers: { "Content-Type": "application/json" },
    });
  }

  let parsed;
  try {
    const body = await request.json();
    parsed = BodySchema.safeParse(body);
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  if (!parsed.success) {
    return new Response(
      JSON.stringify({ error: "Invalid input", issues: parsed.error.issues }),
      { status: 400, headers: { "Content-Type": "application/json" } },
    );
  }

  try {
    const teamRow = await db
      .select({
        id: teamRegistrations.id,
        organizationId: teamRegistrations.organizationId,
        seasonId: teamRegistrations.seasonId,
        teamName: teamRegistrations.teamName,
        captainName: teamRegistrations.captainName,
        inviteToken: teamRegistrations.inviteToken,
      })
      .from(teamRegistrations)
      .where(eq(teamRegistrations.inviteToken, token))
      .limit(1);

    if (teamRow.length === 0) {
      return new Response(JSON.stringify({ error: "Team not found" }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      });
    }

    const team = teamRow[0]!;

    // Cross-tenant guard: 404 (not 403) — hides existence of cross-tenant rows.
    const organization = locals.organization;
    if (!organization || team.organizationId !== organization.id) {
      return new Response(JSON.stringify({ error: "Not found" }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Build the join link from the request origin so it works on whichever
    // brand/host the captain is on.
    const origin = new URL(request.url).origin;
    const joinUrl = `${origin}/register/${team.seasonId}?team=${encodeURIComponent(team.inviteToken)}`;
    const brand = brandFromHost(new URL(request.url).host);

    // De-dupe emails (case already lowercased by zod).
    const emails = Array.from(new Set(parsed.data.emails));

    const results = await Promise.all(
      emails.map((to) =>
        sendTeamInviteEmail({
          to,
          teamName: team.teamName,
          captainName: team.captainName,
          joinUrl,
          brand,
        }),
      ),
    );

    const sent = results.filter((r) => r.success).length;

    return new Response(JSON.stringify({ sent }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("[team-registrations/[token]/invite] send failed", err);
    return new Response(JSON.stringify({ error: "Could not send invites" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
};
