/**
 * GET /api/admin/activity-completions/today
 *
 * Returns activity_completions for a single calendar date (default:
 * today in the caller's organization timezone), scoped to the caller's
 * organization, joined with game.scheduledAt and venue.name for display.
 * Default sort: expected_at ascending.
 *
 * Query params:
 *   ?date=YYYY-MM-DD       — filter by expected_at within that calendar
 *                            day in the org's timezone. Bounds are
 *                            converted to UTC for the BETWEEN query.
 *
 * Tenant scoping: activity_completions.organization_id is the snapshot
 * captured at bootstrap, so we filter directly with no joins. The
 * underlying games/venues are joined for display only — they are
 * already known to be in-org because the snapshot is consistent.
 *
 * Status filter: by default we hide closed states (completed, canceled,
 * skipped_by_handoff) so the dashboard surfaces only what still needs
 * attention. Pass `?includeClosed=1` to see everything.
 */
import type { APIRoute } from "astro";
import { getDb } from "@/lib/db";
import { activityCompletions } from "@/lib/db/schema/activity-tracking";
import { games, venues } from "@/lib/db/schema/teams";
import { organizations } from "@/lib/db/schema/organizations";
import { and, asc, between, eq, notInArray } from "drizzle-orm";
import { requireSuperAdminAccess, requireOrganizationContext } from "@/lib/auth";
import { tzDayBoundsUtc } from "@/lib/activity-tracking/tz-day";

const json = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

const CLOSED_STATUSES = ["completed", "canceled", "skipped_by_handoff"] as const;
type CompletionStatus = (typeof CLOSED_STATUSES)[number] | "pending" | "in_progress" | "overdue";

export const GET: APIRoute = async (context) => {
  const auth = await requireSuperAdminAccess(context);
  if (!auth.authorized) return auth.response;

  const orgContext = await requireOrganizationContext(context);
  if (!orgContext.hasOrganization) return orgContext.response;

  const url = new URL(context.request.url);
  const dateParam = url.searchParams.get("date");
  const includeClosed = url.searchParams.get("includeClosed") === "1";

  // Resolve org timezone — defaults to America/New_York per organizations schema.
  const [orgRow] = await getDb()
    .select({ timezone: organizations.timezone })
    .from(organizations)
    .where(eq(organizations.id, orgContext.organizationId))
    .limit(1);
  const tz = orgRow?.timezone ?? "America/New_York";

  // Default "today" is today in the org's timezone, not UTC.
  const date =
    dateParam ??
    new Intl.DateTimeFormat("en-CA", {
      timeZone: tz,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date());
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return json({ error: "date must be YYYY-MM-DD" }, 400);
  }
  const { startUtc: start, endUtc: end } = tzDayBoundsUtc(date, tz);

  const conditions = [
    eq(activityCompletions.organizationId, orgContext.organizationId),
    between(activityCompletions.expectedAt, start, end),
  ];
  if (!includeClosed) {
    conditions.push(
      notInArray(
        activityCompletions.status,
        CLOSED_STATUSES as readonly CompletionStatus[] as CompletionStatus[],
      ),
    );
  }

  const rows = await getDb()
    .select({
      id: activityCompletions.id,
      organizationId: activityCompletions.organizationId,
      gameId: activityCompletions.gameId,
      activityId: activityCompletions.activityId,
      expectedAt: activityCompletions.expectedAt,
      status: activityCompletions.status,
      currentResponsibleRole: activityCompletions.currentResponsibleRole,
      completedAt: activityCompletions.completedAt,
      gameScheduledAt: games.scheduledAt,
      venueId: venues.id,
      venueName: venues.name,
    })
    .from(activityCompletions)
    .innerJoin(games, eq(activityCompletions.gameId, games.id))
    .leftJoin(venues, eq(games.venueId, venues.id))
    .where(and(...conditions))
    .orderBy(asc(activityCompletions.expectedAt));

  return json({ rows, date }, 200);
};
