import { describe, it, expect, beforeAll } from "vitest";
import { getDb } from "@/lib/db";
import { fieldRentals, fieldRentalPlayers } from "@/lib/db/schema/field-rentals";
import { resolveSigner } from "@/lib/check-in/resolve-signer";
import { E2E_ORG_ID, E2E_RENTAL_VENUE_ID } from "@/lib/db/seeds/seed-e2e-tests";

let rentalId: string;
let adultId: string;
let minorId: string;

beforeAll(async () => {
  const db = getDb();
  const [r] = await db.insert(fieldRentals).values({
    organizationId: E2E_ORG_ID, venueId: E2E_RENTAL_VENUE_ID, fieldNumber: 40,
    startsAt: new Date(Date.UTC(2040, 0, 1, 12)), endsAt: new Date(Date.UTC(2040, 0, 1, 13)),
    status: "confirmed", source: "online_booking", paymentMethod: "card_online",
    amountDueCents: 5000, renterName: "Roster Host",
  }).returning();
  rentalId = r.id;
  const [a] = await db.insert(fieldRentalPlayers).values({
    rentalId, playerName: "Adult Al", signerEmail: "al@test.aspiresports.com", isMinor: false,
  }).returning();
  const [m] = await db.insert(fieldRentalPlayers).values({
    rentalId, playerName: "Kid Kim", signerEmail: "parent@test.aspiresports.com", isMinor: true,
  }).returning();
  adultId = a.id; minorId = m.id;
});

describe("resolveSigner rental_player", () => {
  it("adult: displayName = player, not minor", async () => {
    const s = await resolveSigner("rental_player", adultId, E2E_ORG_ID);
    expect(s).not.toBeNull();
    expect(s!.isMinor).toBe(false);
    expect(s!.displayName).toBe("Adult Al");
    expect(s!.recipientEmail).toBe("al@test.aspiresports.com");
  });
  it("minor: isMinor true, displayName = child", async () => {
    const s = await resolveSigner("rental_player", minorId, E2E_ORG_ID);
    expect(s!.isMinor).toBe(true);
    expect(s!.displayName).toBe("Kid Kim");
  });
  it("wrong org → null", async () => {
    const s = await resolveSigner("rental_player", adultId, "00000000-0000-0000-0000-000000000000");
    expect(s).toBeNull();
  });
});
