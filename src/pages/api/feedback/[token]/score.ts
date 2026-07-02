import type { APIRoute } from "astro";
import { and, eq, gt, ne } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/lib/db";
import { feedbackRequests, npsResponses, organizations } from "@/lib/db/schema";
import type { OrganizationSettings } from "@/lib/db/schema";
import { hashFeedbackToken } from "@/lib/feedback/tokens";
import { npsCategory } from "@/lib/feedback/constants";
import { getFeedbackRequestByToken } from "@/lib/feedback/lookup";
import { sendDetractorAlertEmail } from "@/lib/email/send";
import type { BrandId } from "@/lib/branding/themes";

export const prerender = false;

const bodySchema = z.object({ score: z.number().int().min(0).max(10) });

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

export const POST: APIRoute = async ({ params, request }) => {
  const token = params.token ?? "";

  let parsed;
  try {
    parsed = bodySchema.safeParse(await request.json());
  } catch {
    return json(400, { error: "Invalid JSON" });
  }
  if (!parsed.success) return json(400, { error: "Score must be an integer 0-10" });
  const { score } = parsed.data;

  const db = getDb();
  const now = new Date();

  // Atomic single-use claim + score save in ONE transaction: only an
  // unexpired, sent-but-unanswered, non-referee request flips, and the
  // npsResponses row commits together with the status flip — if the insert
  // fails the claim rolls back instead of stranding the token at
  // status='responded' with no saved score. Referee tokens are excluded in
  // the WHERE so this endpoint never claims them (no revert window).
  const claimed = await db.transaction(async (tx) => {
    const [row] = await tx
      .update(feedbackRequests)
      .set({ status: "responded", respondedAt: now })
      .where(
        and(
          eq(feedbackRequests.tokenHash, hashFeedbackToken(token)),
          eq(feedbackRequests.status, "sent"),
          gt(feedbackRequests.expiresAt, now),
          ne(feedbackRequests.kind, "referee_rating"),
        ),
      )
      .returning();
    if (!row) return null;
    await tx.insert(npsResponses).values({ requestId: row.id, score });
    return row;
  });

  if (!claimed) {
    // Distinguish the failure for a friendlier client message.
    const existing = await getFeedbackRequestByToken(token);
    if (!existing) return json(404, { error: "Unknown link" });
    if (existing.status === "responded") return json(409, { error: "Already answered" });
    if (existing.expiresAt <= now) return json(410, { error: "Link expired" });
    if (existing.kind === "referee_rating") {
      // Wrong endpoint for referee links; the referee endpoint (Task 13) owns them.
      return json(400, { error: "This link is a referee rating, not a survey" });
    }
    return json(409, { error: "Link not active" });
  }

  // Resolve the org's feedback settings for review funnel + detractor alert.
  const [org] = await db
    .select({ settings: organizations.settings })
    .from(organizations)
    .where(eq(organizations.id, claimed.organizationId))
    .limit(1);
  const settings = (org?.settings ?? {}) as OrganizationSettings;
  const brand = (claimed.brand === "soccerone" ? "soccerone" : "aspire") as BrandId;

  const category = npsCategory(score);
  const reviewUrl =
    category === "promoter"
      ? (settings.feedback?.googleReviewUrl?.[brand] ?? null)
      : null;

  if (category === "detractor") {
    const alertTo =
      settings.feedback?.detractorAlertEmail ?? settings.contact?.supportEmail;
    if (alertTo) {
      // Awaited (not fire-and-forget): Netlify's serverless runtime can
      // freeze the event loop right after the response returns, silently
      // dropping an un-awaited send. The response transaction has already
      // committed, so a failure here still never fails the request.
      try {
        await sendDetractorAlertEmail({
          to: alertTo,
          brand,
          score,
          comment: null,
          eventLabel: claimed.metadata?.eventLabel ?? "(unknown event)",
          kind: claimed.kind,
        });
      } catch (err) {
        console.error("[feedback] detractor alert failed:", err);
      }
    }
  }

  return json(200, { ok: true, category, reviewUrl });
};
