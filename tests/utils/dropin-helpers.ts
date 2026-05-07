import { getDb } from "@/lib/db";
import { dropInSessions, dropInRateCard } from "@/lib/db/schema/drop-in";
import { sql } from "drizzle-orm";
import { createTestGameContext } from "./activity-tracking-helpers";

export interface CreateTestDropInSessionOpts {
  organizationId?: string;
  venueId?: string;
  capacity?: number;
  capacityMale?: number | null;
  capacityFemale?: number | null;
  membersOnly?: boolean;
  startsAt?: Date;
  endsAt?: Date;
  kind?: "pickup" | "class";
  teamCount?: number;
  teamColors?: string[];
  sportOrClassLabel?: string;
  sessionRateCents?: number | null;
  memberRateCents?: number | null;
}

/**
 * Insert a drop-in session row plus the org-level rate card it depends on.
 * Reuses `createTestGameContext` for the org+venue fixture when callers
 * don't provide their own.
 */
export async function createTestDropInSession(opts: CreateTestDropInSessionOpts = {}) {
  const db = getDb();
  const ctx =
    opts.organizationId && opts.venueId
      ? { organizationId: opts.organizationId, venueId: opts.venueId }
      : await createTestGameContext({});

  await db
    .insert(dropInRateCard)
    .values({ organizationId: ctx.organizationId })
    .onConflictDoNothing();

  const startsAt = opts.startsAt ?? new Date(Date.now() + 7 * 86400_000);
  const endsAt = opts.endsAt ?? new Date(startsAt.getTime() + 90 * 60_000);
  const kind = opts.kind ?? "pickup";

  const [session] = await db
    .insert(dropInSessions)
    .values({
      organizationId: ctx.organizationId,
      venueId: ctx.venueId,
      kind,
      sportOrClassLabel: opts.sportOrClassLabel ?? "soccer",
      startsAt,
      endsAt,
      capacity: opts.capacity ?? 16,
      capacityMale: opts.capacityMale ?? null,
      capacityFemale: opts.capacityFemale ?? null,
      membersOnly: opts.membersOnly ?? false,
      sessionRateCents: opts.sessionRateCents ?? null,
      memberRateCents: opts.memberRateCents ?? null,
      teamCount: opts.teamCount ?? (kind === "class" ? 0 : 2),
      teamColors:
        opts.teamColors ?? (kind === "class" ? [] : ["orange", "black"]),
    })
    .returning();

  return { ...ctx, sessionId: session.id, session };
}

/**
 * Convenience: count active bookings for a session in tests.
 */
export async function countSessionBookings(sessionId: string, status?: string) {
  const db = getDb();
  const condition = status
    ? sql`session_id = ${sessionId} AND status = ${status}`
    : sql`session_id = ${sessionId}`;
  const [row] = await db.execute<{ c: number }>(
    sql`SELECT COUNT(*)::int AS c FROM drop_in_bookings WHERE ${condition}`,
  );
  return row?.c ?? 0;
}
