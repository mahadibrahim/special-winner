/**
 * POST /api/drop/food-diary
 *
 * Player submits their weekly food diary. Idempotent — safe to call multiple
 * times for the same (player, week); it will always end with submitted: true.
 *
 * Security: the endpoint resolves the player row by `userId = locals.user.id`
 * (most recent), so a user can only submit for their own row — structural
 * impossibility to touch another player's diary.
 *
 * coachConfirmed is left at its DB default (false). Coach confirmation is a
 * separate admin action not handled here.
 */
import type { APIRoute } from "astro";
import { z } from "zod";
import { desc, eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { dropPlayers, dropFoodDiary } from "@/lib/db/schema/drop-league";

export const prerender = false;

const json = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

const bodySchema = z.object({
  weekNumber: z.number().int().min(1),
});

export const POST: APIRoute = async ({ request, locals }) => {
  if (!locals.user) return json({ error: "Unauthorized" }, 401);

  // Parse + validate body.
  let parsed: z.infer<typeof bodySchema>;
  try {
    const raw = await request.json();
    parsed = bodySchema.parse(raw);
  } catch {
    return json({ error: "weekNumber must be a positive integer" }, 400);
  }

  const db = getDb();

  // Resolve the player row scoped to this user.
  const [player] = await db
    .select({ id: dropPlayers.id })
    .from(dropPlayers)
    .where(eq(dropPlayers.userId, locals.user.id))
    .orderBy(desc(dropPlayers.createdAt))
    .limit(1);

  if (!player) {
    return json({ error: "No Drop League registration found" }, 404);
  }

  // Upsert: insert with submitted=true; on conflict (player, week) set submitted=true.
  // coachConfirmed stays at its default (false) — coach confirms separately.
  await db
    .insert(dropFoodDiary)
    .values({
      dropPlayerId: player.id,
      weekNumber: parsed.weekNumber,
      submitted: true,
    })
    .onConflictDoUpdate({
      target: [dropFoodDiary.dropPlayerId, dropFoodDiary.weekNumber],
      set: { submitted: true },
    });

  return json({ ok: true }, 200);
};
