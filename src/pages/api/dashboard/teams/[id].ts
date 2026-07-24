import type { APIRoute } from "astro";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { teamRegistrations } from "@/lib/db/schema";
import { buildTeamHubDetail } from "@/lib/registrations/team-hub";

export const prerender = false;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

/**
 * GET /api/dashboard/teams/[id] — the hub detail for one team the caller
 * captains. Captain-auth is enforced on the id itself: the row must match
 * captainUserId AND the resolved org, else 404 (never trust an id alone).
 */
export const GET: APIRoute = async ({ params, locals }) => {
  if (!locals.user) return json({ error: "Unauthorized" }, 401);
  if (!locals.organization) return json({ error: "No organization" }, 400);
  const id = params.id;
  if (!id) return json({ error: "Missing id" }, 400);

  try {
    const db = getDb();
    const rows = await db
      .select()
      .from(teamRegistrations)
      .where(
        and(
          eq(teamRegistrations.id, id),
          eq(teamRegistrations.captainUserId, locals.user.id),
          eq(teamRegistrations.organizationId, locals.organization.id),
        ),
      )
      .limit(1);

    // 404 (not 403) — a non-captain must not learn the team exists.
    if (rows.length === 0) return json({ error: "Not found" }, 404);

    const detail = await buildTeamHubDetail(db, rows[0]!);
    return json(detail);
  } catch (err) {
    console.error("[dashboard/teams/[id]] detail failed", err);
    return json({ error: "Could not load team" }, 500);
  }
};
