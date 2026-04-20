import type { APIRoute } from "astro";
import { processThumbnail } from "@/lib/media/thumbnail-job";

export const POST: APIRoute = async ({ request }) => {
  const auth = request.headers.get("authorization") || "";
  if (
    process.env.INTERNAL_JOB_SECRET &&
    auth !== `Bearer ${process.env.INTERNAL_JOB_SECRET}`
  ) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
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
