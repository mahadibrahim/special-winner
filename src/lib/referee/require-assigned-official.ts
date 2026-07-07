import { and, eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { gameOfficials } from "@/lib/db/schema/teams";

/**
 * Authoritative gate for referee-facing match endpoints: is `userId` an
 * assigned official on `gameId`? Extracted from
 * `src/pages/api/referee/matches/[gameId]/report.ts` so the new ejections
 * endpoint (product-backlog build #4) shares the same check instead of
 * re-inlining it.
 */
export async function requireAssignedOfficial(
  userId: string,
  gameId: string,
): Promise<boolean> {
  const [assignment] = await getDb()
    .select({ id: gameOfficials.id })
    .from(gameOfficials)
    .where(and(eq(gameOfficials.gameId, gameId), eq(gameOfficials.userId, userId)))
    .limit(1);
  return Boolean(assignment);
}
