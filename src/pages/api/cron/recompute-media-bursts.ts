import type { APIRoute } from "astro";
import { recomputeBurstsForPendingSessions } from "@/lib/media/burst-job";

export const prerender = false;

export const POST: APIRoute = async ({ request }) => {
  const secret = import.meta.env.CRON_SECRET;
  const provided = request.headers.get("x-cron-secret");

  if (secret) {
    if (provided !== secret) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    }
  }

  const result = await recomputeBurstsForPendingSessions();
  return new Response(JSON.stringify({ ok: true, ...result }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
};

export const GET = POST;
