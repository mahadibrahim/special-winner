import type { APIRoute } from "astro";
import { db } from "@/lib/db";
import { teamRegistrations, seasons } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { randomBytes } from "node:crypto";

const BodySchema = z.object({
  seasonId: z.string().uuid(),
  teamName: z.string().trim().min(1).max(200),
  captainName: z.string().trim().min(1).max(200),
  captainEmail: z.string().trim().toLowerCase().email().max(320),
  notes: z.string().trim().max(2000).optional(),
});

function generateInviteToken(): string {
  return randomBytes(24).toString("base64url");
}

/**
 * Create a team registration. The captain provides their identity + the
 * season + a team name; we return an invite token and a shareable URL.
 *
 * v1: this only creates the team grouping. The captain still needs to go
 * through the existing per-player registration flow at /register/[seasonId];
 * teammates do the same after clicking the invite URL.
 */
export const POST: APIRoute = async ({ request, locals }) => {
  if (!db) {
    return new Response(
      JSON.stringify({ error: "Database unavailable" }),
      { status: 503, headers: { "Content-Type": "application/json" } },
    );
  }

  const org = locals.organization;
  if (!org) {
    return new Response(
      JSON.stringify({ error: "Organization context required" }),
      { status: 400, headers: { "Content-Type": "application/json" } },
    );
  }

  let parsed;
  try {
    const body = await request.json();
    parsed = BodySchema.safeParse(body);
  } catch {
    return new Response(
      JSON.stringify({ error: "Invalid JSON body" }),
      { status: 400, headers: { "Content-Type": "application/json" } },
    );
  }

  if (!parsed.success) {
    return new Response(
      JSON.stringify({ error: "Invalid input", issues: parsed.error.issues }),
      { status: 400, headers: { "Content-Type": "application/json" } },
    );
  }

  const { seasonId, teamName, captainName, captainEmail, notes } = parsed.data;

  try {
    // Verify the season exists and belongs to this org.
    const seasonRow = await db
      .select({ id: seasons.id })
      .from(seasons)
      .where(eq(seasons.id, seasonId))
      .limit(1);
    if (seasonRow.length === 0) {
      return new Response(
        JSON.stringify({ error: "Season not found" }),
        { status: 404, headers: { "Content-Type": "application/json" } },
      );
    }

    const inviteToken = generateInviteToken();
    const captainUserId = locals.user?.id ?? null;

    const inserted = await db
      .insert(teamRegistrations)
      .values({
        organizationId: org.id,
        seasonId,
        captainUserId,
        captainEmail,
        captainName,
        teamName,
        inviteToken,
        notes,
        status: "forming",
      })
      .returning({ id: teamRegistrations.id });

    return new Response(
      JSON.stringify({
        ok: true,
        teamRegistrationId: inserted[0]?.id,
        inviteToken,
        joinUrl: `/team/${inviteToken}`,
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("[team-registrations] insert failed", err);
    return new Response(
      JSON.stringify({ error: "Could not create team" }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }
};
