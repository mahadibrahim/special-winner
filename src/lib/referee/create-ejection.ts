import { getDb } from "@/lib/db";
import { gameIncidents } from "@/lib/db/schema/teams";
import { suspensions } from "@/lib/db/schema/suspensions";
import type { EjectionInput } from "@/lib/suspensions/ejection-schema";

/** The transaction handle Drizzle passes to db.transaction(async (tx) => …). */
export type DbTx = Parameters<Parameters<ReturnType<typeof getDb>["transaction"]>[0]>[0];

export interface CreateEjectionArgs {
  gameId: string;
  reportedByUserId: string;
  organizationId: string;
  /** Resolved from input.side by the caller; null for a TBD team slot. */
  teamId: string | null;
  input: EjectionInput;
}

/**
 * Insert an ejection incident and, when it carries a suspension, the linked
 * suspension row — inside the caller's transaction. This is the ONLY way
 * ejections are created (endpoint + close-out both call it), so the
 * suspensions.gameIncidentId trail is always consistent.
 *
 * Caller MUST reject carriesSuspension against a null teamId before calling
 * (a suspension needs a team); this function assumes that check passed.
 */
export async function createEjection(tx: DbTx, args: CreateEjectionArgs) {
  const { gameId, reportedByUserId, organizationId, teamId, input } = args;

  const [incident] = await tx
    .insert(gameIncidents)
    .values({
      gameId,
      reportedByUserId,
      type: "ejection",
      side: input.side,
      player: input.player,
      minute: input.minute ?? null,
      description: input.reason,
    })
    .returning();

  let suspension: typeof suspensions.$inferSelect | null = null;
  if (input.carriesSuspension && teamId) {
    const [row] = await tx
      .insert(suspensions)
      .values({
        organizationId,
        teamId,
        personName: input.player,
        gameIncidentId: incident.id,
        reason: input.reason,
        gamesMissed: input.gamesMissed ?? 1,
        notes: input.suspensionNotes ?? null,
        escalatedToDirector: input.escalatedToDirector,
        setByUserId: reportedByUserId,
        status: "active",
      })
      .returning();
    suspension = row;
  }

  return { incident, suspension };
}
