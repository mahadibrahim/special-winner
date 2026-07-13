/**
 * GET /api/self-serve/[token] → context payload for the self-serve page.
 *
 * Returns enough info for the page to render the greeting, event summary,
 * and outstanding-action checklist without an authenticated session.
 *
 * The context-building logic lives in `@/lib/self-serve/build-context` —
 * this route is a thin wrapper over it. It stays as an HTTP endpoint
 * because PayCard polls it client-side after the initial page load; the
 * initial page render (`/self-serve/[token].astro`) calls the shared
 * builder directly instead of fetching this route.
 */
import type { APIRoute } from "astro";
import { buildSelfServeContext } from "@/lib/self-serve/build-context";

export const prerender = false;

const json = (b: unknown, s: number) =>
  new Response(JSON.stringify(b), {
    status: s,
    headers: { "Content-Type": "application/json" },
  });

export const GET: APIRoute = async ({ params }) => {
  const tokenValue = params.token;
  if (!tokenValue) return json({ error: "Token required" }, 400);

  const result = await buildSelfServeContext(tokenValue);
  return json(result.body, result.status);
};
