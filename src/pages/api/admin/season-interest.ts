import type { APIRoute } from "astro";
import { and, desc, eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { seasonInterest, seasons, programs } from "@/lib/db/schema";
import {
  requireSuperAdminAccess,
  requireOrganizationContext,
} from "@/lib/auth";

/**
 * GET /api/admin/season-interest
 *
 * The read path for forming-season interest submissions — until #543 these
 * were write-only: captured by /api/public/season-interest, counted on
 * /admin/seasons, and readable by nobody. Returns every record for the
 * resolved org, newest first, with the season context an admin needs to act
 * (name, term, status — status matters because a season that has since
 * flipped to "open" means these people should have been emailed already).
 *
 * Filters (same names the CSV export accepts, so the UI hands one filter
 * state to either endpoint): ?seasonId=<uuid>, ?term=<termSlug>.
 *
 * Tenant scoping is the `organization_id` column stamped on every insert by
 * the public endpoint — the tenant column exists precisely for this read,
 * so no org join chain is needed.
 */
export const GET: APIRoute = async (context) => {
  const auth = await requireSuperAdminAccess(context);
  if (!auth.authorized) return auth.response;

  const orgContext = await requireOrganizationContext(context);
  if (!orgContext.hasOrganization) return orgContext.response;

  const url = new URL(context.request.url);
  const seasonId = url.searchParams.get("seasonId");
  const term = url.searchParams.get("term");

  const conditions = [eq(seasonInterest.organizationId, orgContext.organizationId)];
  if (seasonId) conditions.push(eq(seasonInterest.seasonId, seasonId));
  if (term) conditions.push(eq(seasons.termSlug, term));

  const rows = await getDb()
    .select({
      id: seasonInterest.id,
      email: seasonInterest.email,
      firstName: seasonInterest.firstName,
      createdAt: seasonInterest.createdAt,
      seasonId: seasons.id,
      seasonName: seasons.name,
      seasonStatus: seasons.status,
      termSlug: seasons.termSlug,
      termLabel: seasons.termLabel,
      programName: programs.name,
    })
    .from(seasonInterest)
    .innerJoin(seasons, eq(seasonInterest.seasonId, seasons.id))
    .innerJoin(programs, eq(seasons.programId, programs.id))
    .where(and(...conditions))
    .orderBy(desc(seasonInterest.createdAt));

  return new Response(JSON.stringify({ interest: rows, total: rows.length }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
};
