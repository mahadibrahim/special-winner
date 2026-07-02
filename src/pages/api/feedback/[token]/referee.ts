import type { APIRoute } from "astro";
import { and, eq, gt } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/lib/db";
import { feedbackRequests, refereeRatings, gameOfficials } from "@/lib/db/schema";
import { hashFeedbackToken } from "@/lib/feedback/tokens";
import { getFeedbackRequestByToken } from "@/lib/feedback/lookup";

export const prerender = false;

const dimension = z.number().int().min(1).max(5);
const bodySchema = z.object({
  overall: dimension,
  gameControl: dimension,
  communication: dimension,
  fairness: dimension,
  comment: z.string().trim().max(2000).optional(),
});

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

/** Thrown inside the transaction when the rated official can't be resolved — rolls back the claim. */
class RatingTargetMissingError extends Error {}

export const POST: APIRoute = async ({ params, request }) => {
  const token = params.token ?? "";

  let parsed;
  try {
    parsed = bodySchema.safeParse(await request.json());
  } catch {
    return json(400, { error: "Invalid JSON" });
  }
  if (!parsed.success) return json(400, { error: "All ratings must be integers 1-5" });

  const db = getDb();
  const now = new Date();

  // Atomic single-use claim + rating save in ONE transaction: only an
  // unexpired, sent-but-unanswered referee_rating request flips, and the
  // refereeRatings row (with the denormalized game/referee ids) commits
  // together with the status flip — if the gameOfficials lookup or insert
  // fails the claim rolls back instead of stranding the token at
  // status='responded' with no saved rating. Non-referee tokens are
  // excluded in the WHERE so this endpoint never claims them.
  let claimed;
  try {
    claimed = await db.transaction(async (tx) => {
      const [row] = await tx
        .update(feedbackRequests)
        .set({ status: "responded", respondedAt: now })
        .where(
          and(
            eq(feedbackRequests.tokenHash, hashFeedbackToken(token)),
            eq(feedbackRequests.status, "sent"),
            gt(feedbackRequests.expiresAt, now),
            eq(feedbackRequests.kind, "referee_rating"),
          ),
        )
        .returning();
      if (!row) return null;

      // Resolve the rated official → denormalized refereeUserId, inside the
      // transaction so a missing official rolls back the claim rather than
      // stranding it as "responded" with no rating row.
      if (!row.gameOfficialId) throw new RatingTargetMissingError();
      const [official] = await tx
        .select({ userId: gameOfficials.userId })
        .from(gameOfficials)
        .where(eq(gameOfficials.id, row.gameOfficialId))
        .limit(1);
      if (!official) throw new RatingTargetMissingError();

      await tx.insert(refereeRatings).values({
        requestId: row.id,
        gameId: row.targetId,
        refereeUserId: official.userId,
        overall: parsed.data.overall,
        gameControl: parsed.data.gameControl,
        communication: parsed.data.communication,
        fairness: parsed.data.fairness,
        comment: parsed.data.comment?.length ? parsed.data.comment : null,
      });

      return row;
    });
  } catch (err) {
    if (err instanceof RatingTargetMissingError) {
      return json(500, { error: "Rating target missing" });
    }
    throw err;
  }

  if (!claimed) {
    // Distinguish the failure for a friendlier client message.
    const existing = await getFeedbackRequestByToken(token);
    if (!existing) return json(404, { error: "Unknown link" });
    if (existing.kind !== "referee_rating")
      return json(400, { error: "This link is a survey, not a referee rating" });
    if (existing.status === "responded") return json(409, { error: "Already answered" });
    if (existing.expiresAt <= now) return json(410, { error: "Link expired" });
    return json(409, { error: "Link not active" });
  }

  return json(200, { ok: true });
};
