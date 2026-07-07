import type { APIRoute } from "astro";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { games, gameIncidents } from "@/lib/db/schema/teams";
import { requireAssignedOfficial } from "@/lib/referee/require-assigned-official";

export const prerender = false;
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { "content-type": "application/json" } });

const INCIDENT_TYPES = new Set(["yellow_card", "red_card", "injury", "other"]);
const SIDES = new Set(["home", "away"]);

interface IncidentInput {
  type: string;
  side: string;
  player?: string | null;
  minute?: number | null;
  description?: string | null;
}
interface ReportBody {
  homeScore: number;
  awayScore: number;
  refereeNotes?: string | null;
  incidents?: IncidentInput[];
}

const isNonNegInt = (n: unknown): n is number => typeof n === "number" && Number.isInteger(n) && n >= 0;

export const POST: APIRoute = async (context) => {
  const user = context.locals.user;
  if (!user) return json({ error: "Unauthorized" }, 401);
  const gameId = context.params.gameId;
  if (!gameId) return json({ error: "game id required" }, 400);

  const db = getDb();
  // Authoritative gate: caller must be an assigned official on this game.
  if (!(await requireAssignedOfficial(user.id, gameId))) return json({ error: "Not found" }, 404);

  let body: ReportBody;
  try {
    body = await context.request.json();
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }

  if (!isNonNegInt(body.homeScore) || !isNonNegInt(body.awayScore)) {
    return json({ error: "Scores must be non-negative integers" }, 400);
  }
  const incidents = Array.isArray(body.incidents) ? body.incidents : [];
  for (const inc of incidents) {
    if (!INCIDENT_TYPES.has(inc.type) || !SIDES.has(inc.side)) {
      return json({ error: "Invalid incident type or side" }, 400);
    }
    if (inc.minute != null && !isNonNegInt(inc.minute)) {
      return json({ error: "Incident minute must be a non-negative integer" }, 400);
    }
  }

  await db.transaction(async (tx) => {
    await tx
      .update(games)
      .set({
        homeScore: body.homeScore,
        awayScore: body.awayScore,
        status: "completed",
        refereeNotes: body.refereeNotes ?? null,
        updatedAt: new Date(),
      })
      .where(eq(games.id, gameId));
    // Replace the game's incidents (single-ref MVP: all incidents are this ref's).
    await tx.delete(gameIncidents).where(eq(gameIncidents.gameId, gameId));
    if (incidents.length > 0) {
      await tx.insert(gameIncidents).values(
        incidents.map((inc) => ({
          gameId,
          reportedByUserId: user.id,
          type: inc.type as "yellow_card" | "red_card" | "injury" | "other",
          side: inc.side as "home" | "away",
          player: inc.player ?? null,
          minute: inc.minute ?? null,
          description: inc.description ?? null,
        })),
      );
    }
  });

  return json({ ok: true }, 200);
};
