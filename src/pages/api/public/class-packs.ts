/**
 * GET /api/public/class-packs
 *
 * Tenant-scoped active class-pack catalog (N floating session credits for one
 * child). Anonymous, org resolved from `locals.organization` by the domain
 * middleware — same shape as /api/public/membership-tiers, which this mirrors.
 *
 * Returns `{ packs: [] }` (200) rather than a 404/error when the org sells no
 * packs: "this org has no packs" is a normal catalog state, not a failure, and
 * the pricing UI just renders nothing.
 */
import type { APIRoute } from "astro";
import { and, asc, eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { classPackProducts } from "@/lib/db/schema/classes";

export const prerender = false;

const json = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      // Anonymous, host-scoped catalog data; packs change rarely but feed
      // checkout display, so cap CDN staleness at an hour (same policy as
      // membership-tiers). Netlify keys the CDN cache per host.
      "Cache-Control": "public, max-age=300, s-maxage=3600",
    },
  });

export const GET: APIRoute = async ({ locals }) => {
  if (!locals.organization) return json({ packs: [] }, 200);

  const db = getDb();
  const packs = await db
    .select({
      id: classPackProducts.id,
      name: classPackProducts.name,
      sessionCount: classPackProducts.sessionCount,
      priceCents: classPackProducts.priceCents,
      expiryMonths: classPackProducts.expiryMonths,
    })
    .from(classPackProducts)
    .where(
      and(
        eq(classPackProducts.organizationId, locals.organization.id),
        eq(classPackProducts.active, true),
      ),
    )
    // displayOrder is admin-controlled and defaults to 0 for every row, so it
    // alone is not a total order — createdAt breaks the tie deterministically
    // (a `limit`-free query still needs stable ordering across replicas).
    .orderBy(asc(classPackProducts.displayOrder), asc(classPackProducts.createdAt));

  return json({ packs }, 200);
};
