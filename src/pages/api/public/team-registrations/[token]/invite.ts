import type { APIRoute } from "astro";
import { db } from "@/lib/db";
import { teamRegistrations, teamInvitees, seasons, ageGroups } from "@/lib/db/schema";
import { and, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import { sendTeamInviteEmail } from "@/lib/email/send";
import { brandFromHost } from "@/lib/organization/soccerone-routing";
import { assignEvenShares } from "@/lib/payments/team-captain-charge";
import { rateLimit, rateLimitedResponse } from "@/lib/auth/rate-limit";
import { isYouthTeamSeason } from "@/lib/registrations/team-season-kind";

const emailSchema = z.string().trim().toLowerCase().email().max(320);

// Accept either an explicit per-email share (`invites`) or a bare email list
// (`emails`), in which case we even-split across them — the full team fee for
// a youth season, or (teamFee − deposit) for adult (winter-team-fixes, task 5).
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
 * assigned per-player share. The captain supplies either explicit
 * `{ invites: [{ email, shareCents }] }` or a bare `{ emails: [] }` list (we
 * even-split across them — the full team fee on a youth season, since the
 * captain's deposit never credits a player's share there; team fee minus the
 * captain deposit on adult, where the captain's own spot is already covered).
 * Each invitee gets the one-door join link tagged to this team and, when they
 * register, pays exactly their assigned share.
 *
 * CAPTAIN-ONLY (locals.user must be this team's captain). The assigned share
 * IS the amount the teammate is charged (create-registration.ts uses it as the
 * amountDueOverride), and the invite token is a bearer credential shared with
 * every teammate — so a token-only endpoint would let any teammate set their
 * own share to $0, grief others' shares, or email-bomb through the org sender.
 * Mirrors the auth on the sibling remind.ts / invitee.ts. Rate-limited too.
 */
export const POST: APIRoute = async ({ params, request, locals, clientAddress }) => {
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

  if (!locals.user) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  const ip = clientAddress || "unknown";
  const limit = rateLimit(`team-invite:ip:${ip}`, 10, 60_000);
  if (!limit.allowed) return rateLimitedResponse(limit.retryAfter ?? 60);

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
    // Joined to seasons/ageGroups (cheapest correct query, no second
    // round-trip) so `isYouthTeamSeason` can decide the bare-email-list even
    // split below: youth rosters split the FULL team fee (the deposit is a
    // refundable hold, never a per-share credit); adult rosters split
    // fee-minus-deposit as before (winter-team-fixes, task 5).
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
        teamFeeCents: teamRegistrations.teamFeeCents,
        depositCents: teamRegistrations.depositCents,
        seasonMinAge: seasons.minAge,
        ageGroupMinAge: ageGroups.minAge,
      })
      .from(teamRegistrations)
      .innerJoin(seasons, eq(teamRegistrations.seasonId, seasons.id))
      .leftJoin(ageGroups, eq(seasons.ageGroupId, ageGroups.id))
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

    // Captain-only: match by user id, falling back to email (captainUserId is
    // nullable). Non-captains get 404 — never leak the team's existence.
    const isCaptain =
      team.captainUserId != null
        ? team.captainUserId === locals.user.id
        : team.captainEmail.toLowerCase() === locals.user.email.toLowerCase();
    if (!isCaptain) {
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
    // even-split across the bare email list — the full team fee on a youth
    // season, or (teamFee − deposit) on adult (see isYouthTeamSeason below).
    let shareByEmail: Map<string, number>;
    if ("invites" in parsed.data) {
      shareByEmail = new Map();
      for (const { email, shareCents } of parsed.data.invites) {
        shareByEmail.set(email, shareCents); // last write wins on dupes
      }
    } else {
      const isYouth = isYouthTeamSeason({
        minAge: team.seasonMinAge,
        ageGroupMinAge: team.ageGroupMinAge,
      });
      const splittable = isYouth
        ? Math.max(0, team.teamFeeCents ?? 0)
        : Math.max(0, (team.teamFeeCents ?? 0) - (team.depositCents ?? 0));
      const emails = Array.from(new Set(parsed.data.emails));
      const shares = assignEvenShares(splittable, emails);
      shareByEmail = new Map(emails.map((e, i) => [e, shares[i]!]));
    }

    const requested = Array.from(shareByEmail.entries()).map(
      ([email, shareCents]) => ({ email, shareCents }),
    );

    // Never touch an invitee who has already paid (or been charged to the
    // captain): their assignedShareCents is what they were billed, and
    // teamCollectedCents sums paid shares at their current value — overwriting
    // it would corrupt the collected/backstop math and re-email someone who's
    // already square. Skip those emails entirely (persist + send).
    const existing = await db
      .select({ email: teamInvitees.email, status: teamInvitees.status })
      .from(teamInvitees)
      .where(
        and(
          eq(teamInvitees.teamRegistrationId, team.id),
          inArray(
            teamInvitees.email,
            requested.map((i) => i.email),
          ),
        ),
      );
    const settledEmails = new Set(
      existing
        .filter((e) => e.status !== "pending")
        .map((e) => e.email.toLowerCase()),
    );
    const invites = requested.filter(
      (i) => !settledEmails.has(i.email.toLowerCase()),
    );
    const skippedPaid = requested.length - invites.length;

    if (invites.length === 0) {
      return new Response(
        JSON.stringify({ sent: 0, invitees: 0, skippedPaid }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }

    // Persist each invitee's assigned share. UPSERT on the
    // (teamRegistrationId, email) unique index so re-inviting updates the share
    // rather than erroring. `setWhere status='pending'` is the race guard for a
    // teammate who pays between the SELECT above and this write. Done before the
    // emails so the share we persist matches the one we quote in the message.
    const upserted = await db
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
        setWhere: eq(teamInvitees.status, "pending"),
      })
      .returning({ id: teamInvitees.id, email: teamInvitees.email });

    // emailSchema already normalizes to lowercase, but key defensively by
    // lowercase in case that ever changes.
    const idByEmail = new Map(
      upserted.map((row) => [row.email.toLowerCase(), row.id]),
    );

    const results = await Promise.all(
      invites.map((i) => {
        const inviteeId = idByEmail.get(i.email.toLowerCase());
        const personalJoinUrl = inviteeId
          ? `${joinUrl}&i=${encodeURIComponent(inviteeId)}`
          : joinUrl;
        return sendTeamInviteEmail({
          to: i.email,
          teamName: team.teamName,
          captainName: team.captainName,
          joinUrl: personalJoinUrl,
          brand,
          shareCents: i.shareCents,
        });
      }),
    );

    const sent = results.filter((r) => r.success).length;

    return new Response(
      JSON.stringify({ sent, invitees: invites.length, skippedPaid }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("[team-registrations/[token]/invite] send failed", err);
    return new Response(JSON.stringify({ error: "Could not send invites" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
};
