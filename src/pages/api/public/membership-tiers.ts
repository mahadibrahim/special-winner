/**
 * GET /api/public/membership-tiers
 *
 * Tenant-scoped active tier list. Returns [] when the resolved org has
 * no tiers — that is the Aspire path. Sorted by displayOrder ascending.
 */
import type { APIRoute } from "astro";
import { and, asc, eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { membershipTiers } from "@/lib/db/schema/memberships";

export const prerender = false;

const json = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      // Anonymous, host-scoped catalog data; tiers change rarely but feed
      // checkout display, so cap CDN staleness at an hour. Netlify keys
      // the CDN cache per host and skips responses with Set-Cookie.
      "Cache-Control": "public, max-age=300, s-maxage=3600",
    },
  });

export const GET: APIRoute = async ({ locals }) => {
  if (!locals.organization) return json({ tiers: [] }, 200);

  const db = getDb();
  const rows = await db
    .select({
      id: membershipTiers.id,
      name: membershipTiers.name,
      tagline: membershipTiers.tagline,
      monthlyPriceCents: membershipTiers.monthlyPriceCents,
      annualPriceCents: membershipTiers.annualPriceCents,
      annualFeeCents: membershipTiers.annualFeeCents,
      benefits: membershipTiers.benefits,
      displayOrder: membershipTiers.displayOrder,
    })
    .from(membershipTiers)
    .where(
      and(
        eq(membershipTiers.organizationId, locals.organization.id),
        eq(membershipTiers.isActive, true),
      ),
    )
    .orderBy(asc(membershipTiers.displayOrder), asc(membershipTiers.name));

  return json({ tiers: rows }, 200);
};
