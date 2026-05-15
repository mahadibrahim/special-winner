/**
 * POST /api/self-serve/[token]/consume
 *
 * Marks the token as consumed (final step of the self-serve flow).
 * No auth required — the token itself is the credential.
 */
import type { APIRoute } from "astro";
import { verifyToken, consumeToken } from "@/lib/check-in/tokens-db";

export const prerender = false;

const json = (b: unknown, s: number) =>
  new Response(JSON.stringify(b), {
    status: s,
    headers: { "Content-Type": "application/json" },
  });

export const POST: APIRoute = async ({ params, request }) => {
  const tokenValue = params.token;
  if (!tokenValue) return json({ error: "Token required" }, 400);

  const v = await verifyToken(tokenValue);
  if (!v.ok) {
    return json({ error: v.reason }, 410);
  }

  const ip =
    request.headers.get("x-forwarded-for") ??
    request.headers.get("x-real-ip") ??
    null;

  await consumeToken(v.token.id, ip);
  return json({ ok: true }, 200);
};
