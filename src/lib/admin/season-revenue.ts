import { and, eq, sql } from "drizzle-orm";
import type { getDb } from "@/lib/db";
import { payments } from "@/lib/db/schema/payments";
import { registrations } from "@/lib/db/schema/registrations";
import { teamRegistrations } from "@/lib/db/schema/team-registrations";

/**
 * Total succeeded payment volume for one season, counting both solo
 * registration payments and team-level payments (captain deposit, backstop
 * balance) whose team registration belongs to the season. Feeds the season
 * hub "Revenue" KPI (#525 — team-sold seasons showed near-$0 before).
 */
export async function seasonRevenueCents(
  db: ReturnType<typeof getDb>,
  seasonId: string,
): Promise<number> {
  const [row] = await db
    .select({
      total: sql<number>`COALESCE(SUM(${payments.amountCents}), 0)::int`,
    })
    .from(payments)
    .leftJoin(registrations, eq(payments.registrationId, registrations.id))
    .leftJoin(
      teamRegistrations,
      eq(payments.teamRegistrationId, teamRegistrations.id),
    )
    .where(
      and(
        sql`COALESCE(${registrations.seasonId}, ${teamRegistrations.seasonId}) = ${seasonId}`,
        eq(payments.status, "succeeded"),
      ),
    );
  return row?.total ?? 0;
}
