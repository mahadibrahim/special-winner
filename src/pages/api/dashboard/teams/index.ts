import type { APIRoute } from "astro";
import { getDb } from "@/lib/db";
import { listCaptainTeams } from "@/lib/registrations/team-hub";

export const prerender = false;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

/**
 * GET /api/dashboard/teams — the captain's "My teams" list. Scoped to the
 * signed-in user (captainUserId) within the resolved org.
 */
export const GET: APIRoute = async ({ locals }) => {
  if (!locals.user) return json({ error: "Unauthorized" }, 401);
  if (!locals.organization) return json({ error: "No organization" }, 400);

  try {
    const db = getDb();
    const teams = await listCaptainTeams(
      db,
      locals.user.id,
      locals.organization.id,
    );
    return json({ teams });
  } catch (err) {
    console.error("[dashboard/teams] list failed", err);
    return json({ error: "Could not load teams" }, 500);
  }
};
