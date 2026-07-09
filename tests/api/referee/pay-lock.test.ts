/**
 * Task 6 regression against a real DB: getRefereePay's `locked` derivation.
 * A fee is payable only once the game is closed out (games.status =
 * 'completed'). This test self-seeds a fresh referee + gameOfficials fee row
 * on a `scheduled` game (createAdminOrgGameContext's default), asserts the
 * row comes back locked and excluded from totalUnpaidCents, then flips the
 * game to 'completed' and asserts the same row unlocks and is now counted.
 */
import { describe, it, expect, beforeAll } from "vitest";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { users } from "@/lib/db/schema/users";
import { games, gameOfficials } from "@/lib/db/schema/teams";
import { hashPassword } from "@/lib/auth/password";
import { createAdminOrgGameContext } from "../../utils/admin-org-game-context";
import { getRefereePay } from "@/lib/referee/get-referee-pay";

describe("getRefereePay — locked fees on un-closed-out games (real DB)", () => {
  let gameId: string;
  let refUserId: string;
  const feeCents = 4500;

  beforeAll(async () => {
    const ctx = await createAdminOrgGameContext();
    gameId = ctx.gameId;

    const db = getDb();
    const email = `fresh-referee-pay-lock-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`;
    const passwordHash = await hashPassword("TestFreshReferee123!");
    const [refUser] = await db
      .insert(users)
      .values({ email, passwordHash, firstName: "Fresh", lastName: "PayLock", emailVerified: true })
      .returning();
    refUserId = refUser.id;

    await db.insert(gameOfficials).values({
      gameId,
      userId: refUserId,
      position: "referee",
      feeCents,
      paymentStatus: "unpaid",
    });
  });

  it("locks the fee and excludes it from totalUnpaidCents while the game is scheduled", async () => {
    const pay = await getRefereePay(refUserId);
    const row = pay.rows.find((r) => r.gameId === gameId);
    expect(row).toBeDefined();
    expect(row!.locked).toBe(true);
    expect(pay.totalUnpaidCents).toBe(0);
  });

  it("unlocks the fee and includes it in totalUnpaidCents once the game is completed", async () => {
    const db = getDb();
    await db.update(games).set({ status: "completed" }).where(eq(games.id, gameId));

    const pay = await getRefereePay(refUserId);
    const row = pay.rows.find((r) => r.gameId === gameId);
    expect(row).toBeDefined();
    expect(row!.locked).toBe(false);
    expect(pay.totalUnpaidCents).toBe(feeCents);
  });
});
