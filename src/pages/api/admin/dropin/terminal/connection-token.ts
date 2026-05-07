/**
 * POST /api/admin/dropin/terminal/connection-token
 *
 * Mints a Stripe Terminal connection token for the front-desk panel
 * (@stripe/terminal-js needs one to bootstrap reader discovery).
 *
 * The token has a short TTL and is bound to your Stripe account; we mint
 * one per panel session. Behind admin auth.
 */
import type { APIRoute } from "astro";
import { stripe } from "@/lib/stripe/client";
import { requireAdminAccess } from "@/lib/auth/roles";

export const prerender = false;

const json = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

export const POST: APIRoute = async (context) => {
  const auth = await requireAdminAccess(context);
  if (!auth.authorized) return auth.response;

  if (!stripe) return json({ error: "Stripe not configured" }, 500);

  const token = await stripe.terminal.connectionTokens.create();
  return json({ secret: token.secret }, 200);
};
