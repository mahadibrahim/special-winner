/**
 * POST /api/referee/matches/[gameId]/check-out
 *
 * Closes the referee's check-in for this match (Task 12,
 * docs/superpowers/plans/2026-07-07-time-tracking.md). Sets clockOutAt
 * only — no second activity completion fires; the stipend/report
 * workflow locks on /report, not on check-out. Mirrors the staff
 * clock-out endpoint: coordinates/accuracy are captured for audit, but
 * check-out is never geofence-blocked.
 */
import type { APIRoute } from "astro";
import { z } from "zod";
import { and, eq, isNull } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { requireAssignedOfficial } from "@/lib/referee/require-assigned-official";
import { timeEntries } from "@/lib/db/schema/time-tracking";

export const prerender = false;

const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { "content-type": "application/json" } });

const checkOutSchema = z.object({
  lat: z.number().min(-90).max(90).optional(),
  lng: z.number().min(-180).max(180).optional(),
  accuracy: z.number().min(0).optional(),
});

export const POST: APIRoute = async (context) => {
  const user = context.locals.user;
  if (!user) return json({ error: "Unauthorized" }, 401);
  const gameId = context.params.gameId;
  if (!gameId) return json({ error: "game id required" }, 400);

  if (!(await requireAssignedOfficial(user.id, gameId))) {
    return json({ error: "Not found" }, 404);
  }

  let body: unknown;
  try {
    body = await context.request.json();
  } catch {
    body = {};
  }
  const parsed = checkOutSchema.safeParse(body ?? {});
  if (!parsed.success) {
    return json({ error: "Validation failed", issues: parsed.error.issues }, 400);
  }
  const data = parsed.data;

  const db = getDb();
  const [openEntry] = await db
    .select({ id: timeEntries.id })
    .from(timeEntries)
    .where(
      and(
        eq(timeEntries.gameId, gameId),
        eq(timeEntries.userId, user.id),
        isNull(timeEntries.clockOutAt),
      ),
    )
    .limit(1);

  if (!openEntry) {
    return json({ error: "No open check-in for this match", reason: "no_open_check_in" }, 404);
  }

  const now = new Date();
  const [updated] = await db
    .update(timeEntries)
    .set({
      clockOutAt: now,
      clockOutLat: data.lat != null ? data.lat.toFixed(6) : null,
      clockOutLng: data.lng != null ? data.lng.toFixed(6) : null,
      clockOutAccuracyM: data.accuracy != null ? Math.round(data.accuracy) : null,
      updatedAt: now,
    })
    .where(eq(timeEntries.id, openEntry.id))
    .returning();

  return json({ timeEntry: updated }, 200);
};
