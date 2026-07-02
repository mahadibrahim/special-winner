import type { APIRoute } from "astro";
import { and, eq, gt } from "drizzle-orm";
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

  // Atomic single-use claim: only an unexpired, sent-but-unanswered request flips.
  const [claimed] = await db
    .update(feedbackRequests)
    .set({ status: "responded", respondedAt: now })
    .where(
      and(
        eq(feedbackRequests.tokenHash, hashFeedbackToken(token)),
        eq(feedbackRequests.status, "sent"),
        gt(feedbackRequests.expiresAt, now),
      ),
    )
    .returning();

  if (!claimed) {
    // Distinguish the failure for a friendlier client message.
    const existing = await getFeedbackRequestByToken(token);
    if (!existing) return json(404, { error: "Unknown link" });
    if (existing.status === "responded") return json(409, { error: "Already answered" });
    if (existing.expiresAt <= now) return json(410, { error: "Link expired" });
    return json(409, { error: "Link not active" });
  }

  if (claimed.kind === "referee_rating") {
    // Wrong endpoint for referee links; un-claim so the referee endpoint can take it.
    await db
      .update(feedbackRequests)
      .set({ status: "sent", respondedAt: null })
      .where(eq(feedbackRequests.id, claimed.id));
    return json(400, { error: "This link is a referee rating, not a survey" });
  }

  await db.insert(npsResponses).values({ requestId: claimed.id, score });

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
      // Fire-and-forget — the alert must never block or fail the response save.
      void sendDetractorAlertEmail({
        to: alertTo,
        brand,
        score,
        comment: null,
        eventLabel: claimed.metadata?.eventLabel ?? "(unknown event)",
        kind: claimed.kind,
      }).catch((err) => console.error("[feedback] detractor alert failed:", err));
    }
  }

  return json(200, { ok: true, category, reviewUrl });
};
