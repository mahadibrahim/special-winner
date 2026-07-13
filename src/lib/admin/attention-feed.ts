/**
 * "Needs your attention" queue for the super-admin home.
 *
 * Aggregates org-scoped action items into a short prioritized list:
 *   - pending refund requests submitted by venue managers
 *   - unassigned-ref warnings for games in the next 48h (when the
 *     schema gains a ref column — TODO note below)
 *   - seasons at ≥85% capacity (waitlist comms threshold)
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
  | "season_capacity";

export type AttentionItem = {
  id: string;
  kind: AttentionKind;
  text: string;
  href?: string;
};

const CAPACITY_THRESHOLD = 0.85;

export async function getAttentionFeed(orgId: string): Promise<AttentionItem[]> {
  const db = getDb();
  const items: AttentionItem[] = [];

  // The two queries below are independent of each other — run in parallel.
  const [[refundCount], capacityRows] = await Promise.all([
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

  // 3. Unassigned refs in the next 48h. The games table has no ref column
  //    in the current schema, so this slot is intentionally empty until a
  //    `games.ref_user_id` column is added (Phase 4 follow-up). When that
  //    lands, mirror the refunds query.

  return items;
}
