/**
 * GET /api/account-credit/balance
 *
 * Customer-facing balance read for the signed-in user, scoped to the
 * current host organization (locals.organization, set by the domain
 * resolver in middleware — matches the dropin/rentals customer-endpoint
 * pattern). Returns { balanceCents: 0 } for a user with no credit, never an
 * error, so the checkout/dashboard UI can render unconditionally.
 */
import type { APIRoute } from "astro";
import { getAccountCreditBalanceCents } from "@/lib/payments/account-credit";

export const prerender = false;

export const GET: APIRoute = async ({ locals }) => {
  const user = locals.user;
  if (!user) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  const orgId = locals.organization?.id;
  if (!orgId) {
    return new Response(JSON.stringify({ error: "No organization context" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const balanceCents = await getAccountCreditBalanceCents(user.id, orgId);

  return new Response(JSON.stringify({ balanceCents }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
};
