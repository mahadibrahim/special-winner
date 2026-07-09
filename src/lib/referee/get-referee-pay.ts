import { eq, desc } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { getDb } from "@/lib/db";
import { games, gameOfficials, teams } from "@/lib/db/schema/teams";

export type RefereePayRow = {
  gameId: string;
  scheduledAt: Date;
  homeTeamName: string | null;
  awayTeamName: string | null;
  feeCents: number;
  paymentStatus: string;
  /** True until the game is closed out (games.status = 'completed'); a
   *  locked fee is not yet payable and is excluded from totalUnpaidCents. */
  locked: boolean;
};

/** The ref's assignments with pay + a computed total unpaid (in cents). */
export async function getRefereePay(userId: string): Promise<{ rows: RefereePayRow[]; totalUnpaidCents: number }> {
  const db = getDb();
  const home = alias(teams, "home_team");
  const away = alias(teams, "away_team");
  const rawRows = await db
    .select({
      gameId: games.id,
      scheduledAt: games.scheduledAt,
      homeTeamName: home.name,
      awayTeamName: away.name,
      feeCents: gameOfficials.feeCents,
      paymentStatus: gameOfficials.paymentStatus,
      status: games.status,
    })
    .from(gameOfficials)
    .innerJoin(games, eq(games.id, gameOfficials.gameId))
    .leftJoin(home, eq(home.id, games.homeTeamId))
    .leftJoin(away, eq(away.id, games.awayTeamId))
    .where(eq(gameOfficials.userId, userId))
    .orderBy(desc(games.scheduledAt));
  const totalUnpaidCents = rawRows
    .filter((r) => r.paymentStatus === "unpaid" && r.status === "completed")
    .reduce((sum, r) => sum + r.feeCents, 0);
  const rows: RefereePayRow[] = rawRows.map(({ status, ...r }) => ({
    ...r,
    locked: status !== "completed",
  }));
  return { rows, totalUnpaidCents };
}
