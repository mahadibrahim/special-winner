import { and, eq, ne, sql } from "drizzle-orm";
import type { getDb } from "@/lib/db";
import { teamRegistrations } from "@/lib/db/schema";

type Db = ReturnType<typeof getDb>;
type DbOrTx = Db | Parameters<Parameters<Db["transaction"]>[0]>[0];

/**
 * Season-level team cap (#429).
 *
 * `seasons.maxParticipants` only ever capped SOLO players — the team path
 * inserted no `registrations` rows and consulted no cap, so an unlimited
 * number of teams could enter any season. `seasons.maxTeams` (null = no cap)
 * closes that, enforced at the PRE-PAYMENT doors:
 *
 *  - /api/public/team-registrations (direct create, inside its transaction)
 *  - /api/public/team-registrations/prepare (before the deposit intent is
 *    minted — never take a deposit for a slot that doesn't exist)
 *
 * finalize (deposit already paid) deliberately does NOT re-reject: two
 * captains who both passed the prepare gate racing for the last slot is a
 * refund-or-overbook judgment call for a human, not an auto-refund — and at
 * team volumes (single digits per season) the window is minuscule.
 *
 * Admin-side team creation (scaffold bulk-create / clone) bypasses the cap
 * by design: an admin filling out a bracket is the capacity authority.
 *
 * Cancelled teams free their slot.
 */
export async function countActiveTeams(
  dbOrTx: DbOrTx,
  seasonId: string,
): Promise<number> {
  const rows = await dbOrTx
    .select({ c: sql<number>`count(*)::int` })
    .from(teamRegistrations)
    .where(
      and(
        eq(teamRegistrations.seasonId, seasonId),
        ne(teamRegistrations.status, "cancelled"),
      ),
    );
  return rows[0]?.c ?? 0;
}

/** True when the season has a cap and non-cancelled teams have reached it. */
export async function seasonTeamCapReached(
  dbOrTx: DbOrTx,
  seasonId: string,
  maxTeams: number | null,
): Promise<boolean> {
  if (maxTeams == null) return false;
  const taken = await countActiveTeams(dbOrTx, seasonId);
  return taken >= maxTeams;
}

/** Customer-facing copy for a capped-out season — one string, both doors. */
export const TEAM_CAP_MESSAGE =
  "All team spots for this season have been claimed. Email us and we'll let you know the moment one opens up.";
