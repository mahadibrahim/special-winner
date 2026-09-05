/**
 * "Needs your attention" queue for the super-admin home.
 *
 * Aggregates org-scoped action items into a short prioritized list:
 *   - pending refund requests submitted by venue managers
 *   - unassigned-ref warnings for games in the next 48h (when the
 *     schema gains a ref column — TODO note below)
 *   - seasons at ≥85% capacity (waitlist comms threshold)
 *   - youth league seasons with coachless teams (season readiness)
 *   - youth league seasons with unplaced confirmed registrations (season
 *     readiness)
 *
 * Each item has an optional href so the UI can wire the row to a deep
 * link. Order matters: the array is the display order.
 */

import { getDb } from "@/lib/db";
import { registrations } from "@/lib/db/schema/registrations";
import { programs, seasons } from "@/lib/db/schema/programs";
import { locations } from "@/lib/db/schema/organizations";
import { and, eq, sql } from "drizzle-orm";

export type AttentionKind =
  | "refund_pending"
  | "ref_unassigned"
  | "season_capacity"
  | "teams_coachless"
  | "players_unplaced";

// Youth league seasons still in a "getting ready" window — draft/closed/
// completed/cancelled seasons don't need readiness nudges.
const READINESS_SEASON_STATUSES = ["forming", "open", "active"] as const;
const READINESS_STATUS_LIST = sql.join(
  READINESS_SEASON_STATUSES.map((s) => sql`${s}`),
  sql`, `,
);

export type AttentionItem = {
  id: string;
  kind: AttentionKind;
  text: string;
  href?: string;
};

const CAPACITY_THRESHOLD = 0.85;

// The org has ~88 seasons and growing; an uncapped readiness scan can
// surface hundreds of rows (observed: 255 players_unplaced, 9
// teams_coachless in the live feed). Each new kind is capped to its
// worst-offender top 10 (by count DESC, in SQL via LIMIT — not a JS
// .slice()), with one extra summary row appended when the scan is
// truncated so the admin still knows the tail exists.
const READINESS_ROW_CAP = 10;

export async function getAttentionFeed(orgId: string): Promise<AttentionItem[]> {
  const db = getDb();
  const items: AttentionItem[] = [];

  // The four queries below are independent of each other — run in parallel.
  const [[refundCount], capacityRows, coachlessRows, unplacedRows] = await Promise.all([
    // 1. Refund requests awaiting approval (org-scoped via location join).
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(registrations)
      .innerJoin(seasons, eq(registrations.seasonId, seasons.id))
      .innerJoin(programs, eq(seasons.programId, programs.id))
      .innerJoin(locations, eq(programs.locationId, locations.id))
      .where(
        and(
          eq(registrations.refundStatus, "pending_approval"),
          eq(locations.organizationId, orgId),
        ),
      ),

    // 2. Seasons at ≥85% capacity. Counts non-cancelled registrations per
    // season vs. maxParticipants.
    db.execute<{
      season_id: string;
      name: string;
      location_name: string;
      registered: number;
      max_participants: number;
    }>(sql`
      SELECT
        seasons.id           AS season_id,
        seasons.name         AS name,
        locations.name       AS location_name,
        seasons.max_participants AS max_participants,
        COALESCE((
          SELECT COUNT(*)::int
            FROM registrations
           WHERE registrations.season_id = seasons.id
             AND registrations.status NOT IN ('cancelled')
        ), 0) AS registered
      FROM seasons
      INNER JOIN programs  ON programs.id   = seasons.program_id
      INNER JOIN locations ON locations.id  = programs.location_id
      WHERE locations.organization_id = ${orgId}
        AND seasons.max_participants IS NOT NULL
        AND seasons.max_participants > 0
        AND seasons.status IN ('open', 'active')
    `),

    // 3. Youth league seasons (readiness window) with at least one coachless
    // team. Grouped query — one row per affected season, no per-season loop.
    // Wrapped so `total_count` (via COUNT(*) OVER(), computed BEFORE the
    // LIMIT) travels alongside the capped rows — the JS below needs it to
    // report an accurate "+ N more" remainder without a second query.
    db.execute<{
      season_id: string;
      name: string;
      location_name: string;
      coachless_count: number;
      total_count: number;
    }>(sql`
      SELECT *, COUNT(*) OVER()::int AS total_count
      FROM (
        SELECT
          seasons.id     AS season_id,
          seasons.name   AS name,
          locations.name AS location_name,
          COUNT(teams.id) FILTER (WHERE teams.coach_user_id IS NULL)::int AS coachless_count
        FROM seasons
        INNER JOIN programs  ON programs.id   = seasons.program_id
        INNER JOIN locations ON locations.id  = programs.location_id
        INNER JOIN teams     ON teams.season_id = seasons.id
        WHERE locations.organization_id = ${orgId}
          AND programs.audience_type = 'parents'
          AND programs.program_type = 'league'
          AND seasons.status IN (${READINESS_STATUS_LIST})
        GROUP BY seasons.id, seasons.name, locations.name
        HAVING COUNT(teams.id) FILTER (WHERE teams.coach_user_id IS NULL) > 0
      ) qualifying
      ORDER BY coachless_count DESC, season_id ASC
      LIMIT ${READINESS_ROW_CAP}
    `),

    // 4. Youth league seasons (readiness window) with confirmed
    // registrations not yet rostered onto any team in the season. Grouped
    // query, mirrors the "unplaced" NOT EXISTS shape used by the placement
    // planner endpoint (src/pages/api/admin/seasons/[id]/placement.ts).
    // Same total_count + ORDER BY + LIMIT capping as query 3 above.
    db.execute<{
      season_id: string;
      name: string;
      location_name: string;
      unplaced_count: number;
      total_count: number;
    }>(sql`
      SELECT *, COUNT(*) OVER()::int AS total_count
      FROM (
        SELECT
          seasons.id     AS season_id,
          seasons.name   AS name,
          locations.name AS location_name,
          COUNT(registrations.id)::int AS unplaced_count
        FROM seasons
        INNER JOIN programs      ON programs.id      = seasons.program_id
        INNER JOIN locations     ON locations.id     = programs.location_id
        INNER JOIN registrations ON registrations.season_id = seasons.id
                                AND registrations.status = 'confirmed'
        WHERE locations.organization_id = ${orgId}
          AND programs.audience_type = 'parents'
          AND programs.program_type = 'league'
          AND seasons.status IN (${READINESS_STATUS_LIST})
          AND NOT EXISTS (
            SELECT 1 FROM rosters
            INNER JOIN teams ON teams.id = rosters.team_id
            WHERE rosters.registration_id = registrations.id
              AND teams.season_id = seasons.id
          )
        GROUP BY seasons.id, seasons.name, locations.name
        HAVING COUNT(registrations.id) > 0
      ) qualifying
      ORDER BY unplaced_count DESC, season_id ASC
      LIMIT ${READINESS_ROW_CAP}
    `),
  ]);

  const refundN = refundCount?.count ?? 0;
  if (refundN > 0) {
    items.push({
      id: "refunds",
      kind: "refund_pending",
      text: `${refundN} refund request${refundN === 1 ? "" : "s"} from venue managers`,
      href: "/admin/refunds",
    });
  }

  // drizzle-orm returns rows on .rows for node-postgres adapter, or directly
  // on the array shape for postgres-js. Handle both for safety.
  const rows: any[] = Array.isArray(capacityRows)
    ? capacityRows
    : ((capacityRows as any).rows ?? []);
  for (const r of rows) {
    const pct =
      r.max_participants > 0 ? r.registered / r.max_participants : 0;
    if (pct >= CAPACITY_THRESHOLD) {
      items.push({
        id: `cap-${r.season_id}`,
        kind: "season_capacity",
        text: `${r.name} (${r.location_name}) · ${Math.round(pct * 100)}% full`,
        href: `/admin/seasons/${r.season_id}`,
      });
    }
  }

  const coachlessResultRows: any[] = Array.isArray(coachlessRows)
    ? coachlessRows
    : ((coachlessRows as any).rows ?? []);
  for (const r of coachlessResultRows) {
    const n = Number(r.coachless_count);
    items.push({
      id: `coachless-${r.season_id}`,
      kind: "teams_coachless",
      text: `${r.name} (${r.location_name}) · ${n} team${n === 1 ? "" : "s"} without a coach`,
      href: `/admin/seasons/${r.season_id}`,
    });
  }
  if (coachlessResultRows.length > 0) {
    const total = Number(coachlessResultRows[0].total_count);
    const remainder = total - coachlessResultRows.length;
    if (remainder > 0) {
      items.push({
        id: "coachless-more",
        kind: "teams_coachless",
        text: `+ ${remainder} more season${remainder === 1 ? "" : "s"} with coachless teams`,
        href: "/admin/seasons",
      });
    }
  }

  const unplacedResultRows: any[] = Array.isArray(unplacedRows)
    ? unplacedRows
    : ((unplacedRows as any).rows ?? []);
  for (const r of unplacedResultRows) {
    const n = Number(r.unplaced_count);
    items.push({
      id: `unplaced-${r.season_id}`,
      kind: "players_unplaced",
      text: `${r.name} (${r.location_name}) · ${n} player${n === 1 ? "" : "s"} unplaced`,
      href: `/admin/seasons/${r.season_id}/placement`,
    });
  }
  if (unplacedResultRows.length > 0) {
    const total = Number(unplacedResultRows[0].total_count);
    const remainder = total - unplacedResultRows.length;
    if (remainder > 0) {
      items.push({
        id: "unplaced-more",
        kind: "players_unplaced",
        text: `+ ${remainder} more season${remainder === 1 ? "" : "s"} with unplaced players`,
        href: "/admin/seasons",
      });
    }
  }

  // 5. Unassigned refs in the next 48h. The games table has no ref column
  //    in the current schema, so this slot is intentionally empty until a
  //    `games.ref_user_id` column is added (Phase 4 follow-up). When that
  //    lands, mirror the refunds query.

  return items;
}
