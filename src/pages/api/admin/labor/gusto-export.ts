/**
 * GET /api/admin/labor/gusto-export?kind=<hours|referee>&from=YYYY-MM-DD&to=YYYY-MM-DD[&includePaid=1]
 *
 * Admin-triggered CSV download the payroll office hand-uploads into
 * Gusto's Smart Import — NOT a live Gusto API integration (see
 * docs/superpowers/plans/2026-07-07-gusto-export.md). Two flavors:
 *
 *   - kind=hours: hourly W-2 labor (coach/venue_manager) summed from
 *     time_entries for the period, one row per (employee, role).
 *   - kind=referee: per-match 1099 referee stipends from
 *     game_officials.feeCents, one row per assignment. Defaults to
 *     unpaid-only; pass includePaid=1 to include already-paid rows too.
 *
 * Tenant scoping mirrors /api/admin/incidents: requireOrgAdminAccess
 * pins the org; super_admin sees every location in-org, location_admin
 * is narrowed via getLocationIdsForUser (venues.locationId for hours,
 * games.venueId -> venues.locationId for referee fees). Referee rows are
 * additionally scoped to the org via the
 * game_officials -> games -> seasons -> programs -> locations.organizationId
 * chain, since games has no organizationId column of its own.
 *
 * Never hard-fails on an empty result: no matching rows (or a
 * location_admin scoped to zero locations) still returns 200 with a
 * header-only CSV. Every successful download writes one payroll_exports
 * audit row (rowCount reflects the actual data row count, 0 for empty).
 */
import type { APIRoute } from "astro";
import { and, asc, between, eq, inArray, or } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { getDb } from "@/lib/db";
import { requireOrgAdminAccess } from "@/lib/auth";
import { getLocationIdsForUser } from "@/lib/auth/location-scope";
import { organizations, locations } from "@/lib/db/schema/organizations";
import { users } from "@/lib/db/schema/users";
import { timeEntries } from "@/lib/db/schema/time-tracking";
import { games, gameOfficials, teams, venues } from "@/lib/db/schema/teams";
import { seasons, programs } from "@/lib/db/schema/programs";
import { payrollExports } from "@/lib/db/schema/payroll";
import { resolvePayPeriodBoundsUtc } from "@/lib/payroll/pay-period";
import { aggregateHourlyLabor } from "@/lib/payroll/aggregate-hours";
import { buildGustoHoursCsv, type HourlyLaborCsvRow } from "@/lib/payroll/gusto-csv";
import { buildGustoRefereeCsv, type RefereeFeeCsvRow } from "@/lib/payroll/referee-lines";

export const prerender = false;

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const HOURLY_ROLES = ["coach", "venue_manager"] as const;

function json(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export const GET: APIRoute = async (context) => {
  const auth = await requireOrgAdminAccess(context);
  if (!auth.authorized) return auth.response;

  const url = new URL(context.request.url);
  const kind = url.searchParams.get("kind");
  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to");
  const includePaid = url.searchParams.get("includePaid") === "1";

  if (kind !== "hours" && kind !== "referee") {
    return json({ error: "kind must be 'hours' or 'referee'" }, 400);
  }
  if (!from || !DATE_RE.test(from)) {
    return json({ error: "from must be YYYY-MM-DD" }, 400);
  }
  if (!to || !DATE_RE.test(to)) {
    return json({ error: "to must be YYYY-MM-DD" }, 400);
  }

  const db = getDb();

  const [orgRow] = await db
    .select({ timezone: organizations.timezone })
    .from(organizations)
    .where(eq(organizations.id, auth.organizationId))
    .limit(1);
  const tz = orgRow?.timezone ?? "America/New_York";

  let bounds: { startUtc: Date; endUtc: Date };
  try {
    bounds = resolvePayPeriodBoundsUtc(from, to, tz);
  } catch (err) {
    return json(
      { error: err instanceof Error ? err.message : "Invalid period" },
      400,
    );
  }

  const isSuperAdmin = auth.roles.some((r) => r.name === "super_admin");
  let allowedLocationIds: string[] | null = null;
  if (!isSuperAdmin) {
    allowedLocationIds = await getLocationIdsForUser(auth.user.id);
    if (allowedLocationIds.length === 0) {
      // No locations in scope for this admin — graceful empty export,
      // same shape as /api/admin/incidents' empty-scope early return.
      const csv =
        kind === "hours" ? buildGustoHoursCsv([]) : buildGustoRefereeCsv([]);
      await writeAuditRow(db, {
        organizationId: auth.organizationId,
        kind: kind === "hours" ? "hours" : "referee_fees",
        bounds,
        rowCount: 0,
        exportedByUserId: auth.user.id,
      });
      return csvResponse(csv, kind, from, to);
    }
  }

  if (kind === "hours") {
    const conditions = [
      eq(timeEntries.organizationId, auth.organizationId),
      or(...HOURLY_ROLES.map((r) => eq(timeEntries.role, r)))!,
      between(timeEntries.clockInAt, bounds.startUtc, bounds.endUtc),
    ];
    if (allowedLocationIds) {
      conditions.push(inArray(venues.locationId, allowedLocationIds));
    }

    const rows = await db
      .select({
        userId: timeEntries.userId,
        role: timeEntries.role,
        clockInAt: timeEntries.clockInAt,
        clockOutAt: timeEntries.clockOutAt,
        flaggedOutOfRange: timeEntries.flaggedOutOfRange,
        firstName: users.firstName,
        lastName: users.lastName,
        email: users.email,
      })
      .from(timeEntries)
      .innerJoin(venues, eq(timeEntries.venueId, venues.id))
      .innerJoin(users, eq(timeEntries.userId, users.id))
      .where(and(...conditions))
      .orderBy(asc(timeEntries.clockInAt));

    const nameByUser = new Map<
      string,
      { firstName: string | null; lastName: string | null; email: string }
    >();
    for (const r of rows) {
      if (!nameByUser.has(r.userId)) {
        nameByUser.set(r.userId, {
          firstName: r.firstName,
          lastName: r.lastName,
          email: r.email,
        });
      }
    }

    const aggregated = aggregateHourlyLabor(
      rows.map((r) => ({
        userId: r.userId,
        role: r.role,
        clockInAt: r.clockInAt,
        clockOutAt: r.clockOutAt,
        flaggedOutOfRange: r.flaggedOutOfRange,
      })),
    );

    const csvRows: HourlyLaborCsvRow[] = aggregated.map((row) => {
      const name = nameByUser.get(row.userId);
      return {
        ...row,
        firstName: name?.firstName ?? null,
        lastName: name?.lastName ?? null,
        email: name?.email ?? "",
      };
    });

    const csv = buildGustoHoursCsv(csvRows);

    await writeAuditRow(db, {
      organizationId: auth.organizationId,
      kind: "hours",
      bounds,
      rowCount: csvRows.length,
      exportedByUserId: auth.user.id,
    });

    return csvResponse(csv, kind, from, to);
  }

  // kind === "referee"
  const homeTeams = alias(teams, "home_team");
  const awayTeams = alias(teams, "away_team");

  const conditions = [
    eq(locations.organizationId, auth.organizationId),
    between(games.scheduledAt, bounds.startUtc, bounds.endUtc),
  ];
  if (!includePaid) {
    conditions.push(eq(gameOfficials.paymentStatus, "unpaid"));
  }
  if (allowedLocationIds) {
    conditions.push(inArray(venues.locationId, allowedLocationIds));
  }

  const rows = await db
    .select({
      firstName: users.firstName,
      lastName: users.lastName,
      email: users.email,
      scheduledAt: games.scheduledAt,
      homeTeamName: homeTeams.name,
      awayTeamName: awayTeams.name,
      feeCents: gameOfficials.feeCents,
      paymentStatus: gameOfficials.paymentStatus,
    })
    .from(gameOfficials)
    .innerJoin(games, eq(gameOfficials.gameId, games.id))
    .innerJoin(seasons, eq(games.seasonId, seasons.id))
    .innerJoin(programs, eq(seasons.programId, programs.id))
    .innerJoin(locations, eq(programs.locationId, locations.id))
    .innerJoin(users, eq(gameOfficials.userId, users.id))
    .leftJoin(venues, eq(games.venueId, venues.id))
    .leftJoin(homeTeams, eq(games.homeTeamId, homeTeams.id))
    .leftJoin(awayTeams, eq(games.awayTeamId, awayTeams.id))
    .where(and(...conditions))
    .orderBy(asc(games.scheduledAt));

  const csvRows: RefereeFeeCsvRow[] = rows.map((r) => ({
    firstName: r.firstName,
    lastName: r.lastName,
    email: r.email,
    scheduledAt: r.scheduledAt,
    homeTeamName: r.homeTeamName,
    awayTeamName: r.awayTeamName,
    feeCents: r.feeCents,
    paymentStatus: r.paymentStatus,
  }));

  const csv = buildGustoRefereeCsv(csvRows);

  await writeAuditRow(db, {
    organizationId: auth.organizationId,
    kind: "referee_fees",
    bounds,
    rowCount: csvRows.length,
    exportedByUserId: auth.user.id,
  });

  return csvResponse(csv, kind, from, to);
};

async function writeAuditRow(
  db: ReturnType<typeof getDb>,
  opts: {
    organizationId: string;
    kind: "hours" | "referee_fees";
    bounds: { startUtc: Date; endUtc: Date };
    rowCount: number;
    exportedByUserId: string;
  },
) {
  await db.insert(payrollExports).values({
    organizationId: opts.organizationId,
    kind: opts.kind,
    periodStart: opts.bounds.startUtc,
    periodEnd: opts.bounds.endUtc,
    rowCount: opts.rowCount,
    exportedByUserId: opts.exportedByUserId,
  });
}

function csvResponse(csv: string, kind: string, from: string, to: string): Response {
  const filenameKind = kind === "hours" ? "gusto-hours" : "gusto-referee-fees";
  return new Response(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filenameKind}-${from}-to-${to}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
