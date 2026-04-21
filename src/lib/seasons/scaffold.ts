import { eq } from "drizzle-orm";
import { teams, type Team } from "@/lib/db/schema";
import type { Database } from "@/lib/db";

type Tx = Parameters<Parameters<Database["transaction"]>[0]>[0];

export async function cloneSeasonTeams(
  tx: Tx,
  args: { sourceSeasonId: string; targetSeasonId: string }
): Promise<Team[]> {
  const sourceTeams = await tx
    .select()
    .from(teams)
    .where(eq(teams.seasonId, args.sourceSeasonId));

  if (sourceTeams.length === 0) return [];

  const inserted = await tx
    .insert(teams)
    .values(
      sourceTeams.map((t) => ({
        seasonId: args.targetSeasonId,
        name: t.name,
        color: t.color,
        coachUserId: t.coachUserId,
        assistantCoachUserId: t.assistantCoachUserId,
        maxRosterSize: t.maxRosterSize,
        division: t.division,
      }))
    )
    .returning();

  return inserted;
}

export async function bulkCreateTeams(
  tx: Tx,
  args: {
    targetSeasonId: string;
    count: number;
    programName: string;
    ageGroupName: string | null;
  }
): Promise<Team[]> {
  if (args.count <= 0) return [];

  const prefix = args.ageGroupName
    ? `${args.programName} ${args.ageGroupName}`
    : args.programName;

  const rows = Array.from({ length: args.count }, (_, i) => ({
    seasonId: args.targetSeasonId,
    name: `${prefix} Team ${i + 1}`,
  }));

  const inserted = await tx.insert(teams).values(rows).returning();
  return inserted;
}
