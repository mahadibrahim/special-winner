/**
 * GET /api/memberships
 *
 * Returns the authenticated user's active membership for the resolved
 * organization as { membership: {...} | null }. Used by the dashboard card,
 * which hides itself when membership is null.
 */
import type { APIRoute } from "astro";
import { getActiveMembershipForOrg } from "@/lib/memberships/get-active-membership";

export const prerender = false;

const json = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

export const GET: APIRoute = async ({ locals }) => {
  if (!locals.user) return json({ error: "Unauthorized" }, 401);
  if (!locals.organization) return json({ membership: null }, 200);

  const m = await getActiveMembershipForOrg(
    locals.user.id,
    locals.organization.id,
  );
  if (!m) return json({ membership: null }, 200);

  return json(
    {
      membership: {
        id: m.id,
        status: m.status,
        billingInterval: m.billingInterval,
        currentPeriodEnd: m.currentPeriodEnd?.toISOString() ?? null,
        pausedAt: m.pausedAt?.toISOString() ?? null,
        pauseResumesAt: m.pauseResumesAt?.toISOString() ?? null,
        cancelAtPeriodEnd: m.cancelAtPeriodEnd,
        tier: {
          id: m.tier.id,
          name: m.tier.name,
          benefits: m.tier.benefits,
        },
      },
    },
    200,
  );
};
