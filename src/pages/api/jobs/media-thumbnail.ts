import type { APIRoute } from "astro";
import { processThumbnail } from "@/lib/media/thumbnail-job";

export const POST: APIRoute = async ({ request }) => {
  const secret = process.env.INTERNAL_JOB_SECRET;
  const auth = request.headers.get("authorization") || "";

  if (secret) {
    if (auth !== `Bearer ${secret}`) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
    }
  } else if (import.meta.env.PROD) {
    // Fail closed in prod: an unset secret previously left this endpoint
    // open to unauthenticated POSTs. Mirrors the cron-endpoint behavior.
    console.error(
      "[jobs] INTERNAL_JOB_SECRET not configured in production. Refusing request.",
    );
    return new Response(JSON.stringify({ error: "Server misconfigured" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  let body: { assetId?: string } = {};
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON" }), { status: 400 });
  }
  if (!body.assetId)
    return new Response(JSON.stringify({ error: "assetId required" }), {
      status: 400,
    });

  try {
    await processThumbnail(body.assetId);
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("media-thumbnail job failed:", err);
    return new Response(JSON.stringify({ error: "Job failed" }), { status: 500 });
  }
};
