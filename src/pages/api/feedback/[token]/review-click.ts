import type { APIRoute } from "astro";
import { and, eq, isNull } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { npsResponses } from "@/lib/db/schema";
import { getFeedbackRequestByToken } from "@/lib/feedback/lookup";

export const prerender = false;

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

export const POST: APIRoute = async ({ params }) => {
  const req = await getFeedbackRequestByToken(params.token ?? "");
  if (!req) return json(404, { error: "Unknown link" });

  // Keep the FIRST click timestamp; later clicks are no-ops.
  await getDb()
    .update(npsResponses)
    .set({ reviewLinkClickedAt: new Date() })
    .where(and(eq(npsResponses.requestId, req.id), isNull(npsResponses.reviewLinkClickedAt)));

  return json(200, { ok: true });
};
