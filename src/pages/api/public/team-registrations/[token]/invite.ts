import type { APIRoute } from "astro";
import { db } from "@/lib/db";
import { teamRegistrations, teamInvitees } from "@/lib/db/schema";
import { eq, sql } from "drizzle-orm";
import { z } from "zod";
import { sendTeamInviteEmail } from "@/lib/email/send";
import { brandFromHost } from "@/lib/organization/soccerone-routing";
import { assignEvenShares } from "@/lib/payments/team-captain-charge";

const emailSchema = z.string().trim().toLowerCase().email().max(320);

// Accept either an explicit per-email share (`invites`) or a bare email list
// (`emails`), in which case we even-split (teamFee − deposit) across them.
const BodySchema = z.union([
  z.object({
    invites: z
      .array(
        z.object({
          email: emailSchema,
          shareCents: z.number().int().min(0).max(10_000_000),
        }),
      )
      .min(1)
      .max(50),
  }),
  z.object({
    emails: z.array(emailSchema).min(1).max(50),
  }),
]);

/**
 * Send team-invite emails to prospective teammates AND persist each invitee's
 * assigned per-player share. The captain (or anyone holding the invite token)
 * supplies either explicit `{ invites: [{ email, shareCents }] }` or a bare
 * `{ emails: [] }` list (we even-split the team fee minus the captain deposit
 * across them). Each invitee gets the one-door join link tagged to this team
 * and, when they register, pays exactly their assigned share. Tenant-scoped
 * via locals.organization, mirroring the sibling GET [token].ts handler.
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
        teamFeeCents: teamRegistrations.teamFeeCents,
        depositCents: teamRegistrations.depositCents,
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

    // Normalize the body into an [{ email, shareCents }] list, de-duped by
    // email. Prefer an explicit per-email share when provided; otherwise
    // even-split (teamFee − deposit) across the bare email list.
    let shareByEmail: Map<string, number>;
    if ("invites" in parsed.data) {
      shareByEmail = new Map();
      for (const { email, shareCents } of parsed.data.invites) {
        shareByEmail.set(email, shareCents); // last write wins on dupes
      }
    } else {
      const emails = Array.from(new Set(parsed.data.emails));
      const splittable = Math.max(
        0,
        (team.teamFeeCents ?? 0) - (team.depositCents ?? 0),
      );
      const shares = assignEvenShares(splittable, emails);
      shareByEmail = new Map(emails.map((e, i) => [e, shares[i]!]));
    }

    const invites = Array.from(shareByEmail.entries()).map(
      ([email, shareCents]) => ({ email, shareCents }),
    );

    // Persist each invitee's assigned share. UPSERT on the
    // (teamRegistrationId, email) unique index so re-inviting updates the share
    // rather than erroring. Done before the emails so the share we persist
    // matches the one we quote in the message.
    await db
      .insert(teamInvitees)
      .values(
        invites.map((i) => ({
          teamRegistrationId: team.id,
          email: i.email,
          assignedShareCents: i.shareCents,
        })),
      )
      .onConflictDoUpdate({
        target: [teamInvitees.teamRegistrationId, teamInvitees.email],
        set: { assignedShareCents: sql`excluded.assigned_share_cents` },
      });

    const results = await Promise.all(
      invites.map((i) =>
        sendTeamInviteEmail({
          to: i.email,
          teamName: team.teamName,
          captainName: team.captainName,
          joinUrl,
          brand,
          shareCents: i.shareCents,
        }),
      ),
    );

    const sent = results.filter((r) => r.success).length;

    return new Response(JSON.stringify({ sent, invitees: invites.length }), {
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
