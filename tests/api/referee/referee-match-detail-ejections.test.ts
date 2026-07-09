/**
 * Task 4: getRefereeMatchDetail must surface already-recorded ejections
 * (type='ejection') as a separate `ejections` array, read-only, while
 * continuing to exclude them from `incidents` (Task 5's report guard has no
 * "ejection" option in the bulk-editable incidents list — see the comment
 * above the incidents query in referee-queries.ts).
 */
import { describe, it, expect, beforeAll } from "vitest";
import { getDb } from "@/lib/db";
import { users } from "@/lib/db/schema/users";
import { gameOfficials, gameIncidents } from "@/lib/db/schema/teams";
import { hashPassword } from "@/lib/auth/password";
import { createAdminOrgGameContext } from "../../utils/admin-org-game-context";
import { getRefereeMatchDetail } from "@/lib/referee/referee-queries";

describe("getRefereeMatchDetail — ejections (real DB)", () => {
  let gameId: string;
  let refUserId: string;
  let ejectionId: string;

  beforeAll(async () => {
    const ctx = await createAdminOrgGameContext();
    gameId = ctx.gameId;

    const db = getDb();
    const email = `fresh-referee-ejections-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`;
    const passwordHash = await hashPassword("TestFreshReferee123!");
    const [refUser] = await db
      .insert(users)
      .values({ email, passwordHash, firstName: "Fresh", lastName: "Referee", emailVerified: true })
      .returning();
    refUserId = refUser.id;
    await db.insert(gameOfficials).values({ gameId, userId: refUserId, position: "referee" });

    const [incident] = await db
      .insert(gameIncidents)
      .values({
        gameId,
        type: "ejection",
        side: "home",
        player: "Fixture Ejected Player",
        minute: 37,
        description: "Violent conduct",
      })
      .returning();
    ejectionId = incident.id;
  });

  it("surfaces the recorded ejection in `ejections` and excludes it from `incidents`", async () => {
    const detail = await getRefereeMatchDetail(refUserId, gameId);
    expect(detail).not.toBeNull();

    expect(detail!.ejections).toEqual([
      {
        id: ejectionId,
        side: "home",
        player: "Fixture Ejected Player",
        minute: 37,
        reason: "Violent conduct",
      },
    ]);

    expect(detail!.incidents.find((i) => i.id === ejectionId)).toBeUndefined();
  });
});
