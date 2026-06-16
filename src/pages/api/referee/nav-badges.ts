import type { APIRoute } from "astro";
import { getReportsOwed } from "@/lib/referee/referee-queries";

export const prerender = false;
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { "content-type": "application/json", "cache-control": "no-store" } });

// Reports-owed count for the referee sidebar badge. Fail-soft: 0 on error.
export const GET: APIRoute = async ({ locals }) => {
  if (!locals.user) return json({ error: "Unauthorized" }, 401);
  try {
    return json({ reportsOwed: await getReportsOwed(locals.user.id) });
  } catch {
    return json({ reportsOwed: 0 });
  }
};
