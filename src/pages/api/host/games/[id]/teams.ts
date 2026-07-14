import type { APIRoute } from "astro";
import { and, eq, inArray } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { dropInBookings } from "@/lib/db/schema/drop-in";
import { requireHostOfSession } from "@/lib/auth/host";

export const prerender = false;

const json = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

/** POST /api/host/games/:id/teams — set/clear team assignments. */
export const POST: APIRoute = async (context) => {
  const id = context.params.id;
  if (!id) return json({ error: "session id required" }, 400);
  const auth = await requireHostOfSession(context, id);
  if (!auth.authorized) return auth.response;

  let body: { assignments?: Array<{ bookingId: string; team: string | null }> };
  try {
    body = await context.request.json();
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }
  if (!body.assignments || !Array.isArray(body.assignments)) {
    return json({ error: "assignments[] required" }, 400);
  }
  const validTeams = new Set(auth.session.teamColors);
  for (const a of body.assignments) {
    if (a.team !== null && !validTeams.has(a.team)) {
      return json({ error: `Unknown team "${a.team}"` }, 400);
    }
  }

  const db = getDb();
  const ids = body.assignments.map((a) => a.bookingId);
  const ours = await db
    .select({ id: dropInBookings.id })
    .from(dropInBookings)
    .where(and(eq(dropInBookings.sessionId, id), inArray(dropInBookings.id, ids)));
  const ourIds = new Set(ours.map((r) => r.id));

  let updated = 0;
  for (const a of body.assignments) {
    if (!ourIds.has(a.bookingId)) continue;
    await db
      .update(dropInBookings)
      .set({ teamAssignment: a.team, updatedAt: new Date() })
      .where(eq(dropInBookings.id, a.bookingId));
    updated++;
  }
  return json({ ok: true, updated }, 200);
};
