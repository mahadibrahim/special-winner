import { describe, it, expect, beforeAll } from "vitest";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { fieldRentals, fieldRentalPlayers } from "@/lib/db/schema/field-rentals";
import { E2E_ORG_ID, E2E_RENTAL_VENUE_ID } from "@/lib/db/seeds/seed-e2e-tests";
import { mintToken } from "@/lib/check-in/tokens-db";
import { remindPendingRentalPlayers } from "@/lib/rentals/player-reminders";

// A distinct calendar DAY per test run, far in the future, mirroring
// tests/api/rentals/expire.test.ts — avoids field/slot collisions with
// other suites and parallel CI jobs.
const RUN_DAY_OFFSET = Math.floor(Math.random() * 3_650);
const RUN_BASE_UTC = Date.UTC(2036, 0, 1) + RUN_DAY_OFFSET * 86_400_000;

let rentalId: string;
let duePlayerId: string;
let recentlyRemindedPlayerId: string;
let recentlyRemindedOriginalStamp: Date;

beforeAll(async () => {
  const db = getDb();

  const [rental] = await db
    .insert(fieldRentals)
    .values({
      organizationId: E2E_ORG_ID,
      venueId: E2E_RENTAL_VENUE_ID,
      fieldNumber: 50,
      startsAt: new Date(RUN_BASE_UTC + 10 * 3_600_000),
      endsAt: new Date(RUN_BASE_UTC + 11 * 3_600_000),
      status: "confirmed",
      source: "online_booking",
      paymentMethod: "card_online",
      amountDueCents: 5000,
      renterName: "Reminder Sweep Host",
    })
    .returning();
  rentalId = rental!.id;

  const [due] = await db
    .insert(fieldRentalPlayers)
    .values({
      rentalId,
      playerName: "Due Reminder Dana",
      signerEmail: "dana-reminder@test.aspiresports.com",
      isMinor: false,
      status: "pending",
      reminderSentAt: null,
    })
    .returning();
  duePlayerId = due!.id;

  await mintToken({
    kind: "rental_player",
    targetId: duePlayerId,
    organizationId: E2E_ORG_ID,
    venueId: E2E_RENTAL_VENUE_ID,
    sentVia: "email",
    recipientUserId: null,
    recipientEmail: due!.signerEmail,
    recipientPhone: null,
    createdByUserId: null,
  });

  recentlyRemindedOriginalStamp = new Date();
  const [recent] = await db
    .insert(fieldRentalPlayers)
    .values({
      rentalId,
      playerName: "Recently Reminded Rae",
      signerEmail: "rae-reminder@test.aspiresports.com",
      isMinor: false,
      status: "pending",
      reminderSentAt: recentlyRemindedOriginalStamp,
    })
    .returning();
  recentlyRemindedPlayerId = recent!.id;
});

describe("remindPendingRentalPlayers", () => {
  it("reminds a pending player with no prior reminder and stamps reminder_sent_at", async () => {
    const { reminded } = await remindPendingRentalPlayers();
    expect(reminded).toBeGreaterThanOrEqual(1);

    const [row] = await getDb()
      .select({ reminderSentAt: fieldRentalPlayers.reminderSentAt })
      .from(fieldRentalPlayers)
      .where(eq(fieldRentalPlayers.id, duePlayerId));

    expect(row).toBeDefined();
    expect(row!.reminderSentAt).not.toBeNull();
  });

  it("skips a player reminded within the last 24h (no re-stamp)", async () => {
    const [row] = await getDb()
      .select({ reminderSentAt: fieldRentalPlayers.reminderSentAt })
      .from(fieldRentalPlayers)
      .where(eq(fieldRentalPlayers.id, recentlyRemindedPlayerId));

    expect(row).toBeDefined();
    expect(row!.reminderSentAt).not.toBeNull();
    expect(row!.reminderSentAt!.getTime()).toBe(recentlyRemindedOriginalStamp.getTime());
  });
});
