import type { APIRoute } from "astro";
import { and, desc, eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { seasonInterest, seasons, programs } from "@/lib/db/schema";
import {
  requireSuperAdminAccess,
  requireOrganizationContext,
} from "@/lib/auth";
import { toCsvRow } from "@/lib/csv/to-csv-row";

/**
 * GET /api/admin/season-interest/export.csv
 *
 * CSV of forming-season interest records, matching the
 * /api/admin/registrations/export.csv pattern. Same filter surface as
 * GET /api/admin/season-interest (?seasonId, ?term) so the UI hands the
 * same filter state to either endpoint. This is the "email the interested
 * list when the season opens" unblock from #543 — export, then mail.
 */
const HEADER = [
  "email",
  "first_name",
  "season_name",
  "term",
  "season_status",
  "program_name",
  "submitted_at",
];

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
      email: seasonInterest.email,
      firstName: seasonInterest.firstName,
      createdAt: seasonInterest.createdAt,
      seasonName: seasons.name,
      seasonStatus: seasons.status,
      termLabel: seasons.termLabel,
      programName: programs.name,
    })
    .from(seasonInterest)
    .innerJoin(seasons, eq(seasonInterest.seasonId, seasons.id))
    .innerJoin(programs, eq(seasons.programId, programs.id))
    .where(and(...conditions))
    .orderBy(desc(seasonInterest.createdAt));

  const lines = [
    toCsvRow(HEADER),
    ...rows.map((r) =>
      toCsvRow([
        r.email,
        r.firstName,
        r.seasonName,
        r.termLabel,
        r.seasonStatus,
        r.programName,
        r.createdAt,
      ]),
    ),
  ];

  const body = lines.join("\n") + "\n";
  const dateStamp = new Date().toISOString().slice(0, 10);

  return new Response(body, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="season-interest-${dateStamp}.csv"`,
      "Cache-Control": "no-store",
    },
  });
};
