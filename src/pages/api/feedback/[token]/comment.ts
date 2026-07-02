import type { APIRoute } from "astro";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/lib/db";
import { npsResponses } from "@/lib/db/schema";
import { getFeedbackRequestByToken } from "@/lib/feedback/lookup";

export const prerender = false;

const bodySchema = z.object({ comment: z.string().trim().min(1).max(2000) });

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

export const POST: APIRoute = async ({ params, request }) => {
  let parsed;
  try {
    parsed = bodySchema.safeParse(await request.json());
  } catch {
    return json(400, { error: "Invalid JSON" });
  }
  if (!parsed.success) return json(400, { error: "Comment must be 1-2000 chars" });

  const req = await getFeedbackRequestByToken(params.token ?? "");
  if (!req) return json(404, { error: "Unknown link" });
  if (req.status !== "responded") return json(409, { error: "Answer the survey first" });
  if (req.expiresAt <= new Date()) return json(410, { error: "Link expired" });

  const updated = await getDb()
    .update(npsResponses)
    .set({ comment: parsed.data.comment })
    .where(eq(npsResponses.requestId, req.id))
    .returning({ id: npsResponses.id });
  if (updated.length === 0) return json(409, { error: "No survey response found" });

  return json(200, { ok: true });
};
