import { describe, it, expect, beforeAll } from "vitest";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { fieldRentals, fieldRentalPlayers } from "@/lib/db/schema/field-rentals";
import { mintToken } from "@/lib/check-in/tokens-db";
import { E2E_ORG_ID, E2E_RENTAL_VENUE_ID } from "@/lib/db/seeds/seed-e2e-tests";

const BASE = process.env.TEST_BASE_URL ?? "http://localhost:4321";
let token: string;
let playerId: string;

beforeAll(async () => {
  const db = getDb();
  const [r] = await db.insert(fieldRentals).values({
    organizationId: E2E_ORG_ID, venueId: E2E_RENTAL_VENUE_ID, fieldNumber: 41,
    startsAt: new Date(Date.UTC(2041, 0, 1, 12)), endsAt: new Date(Date.UTC(2041, 0, 1, 13)),
    status: "confirmed", source: "online_booking", paymentMethod: "card_online",
    amountDueCents: 5000, renterName: "Sign Host",
  }).returning();
  const [p] = await db.insert(fieldRentalPlayers).values({
    rentalId: r.id, playerName: "Signer Sam", signerEmail: "sam@test.aspiresports.com",
  }).returning();
  playerId = p.id;
  const t = await mintToken({
    kind: "rental_player", targetId: playerId, organizationId: E2E_ORG_ID,
    venueId: E2E_RENTAL_VENUE_ID, sentVia: "email",
    recipientUserId: null, recipientEmail: "sam@test.aspiresports.com", recipientPhone: null,
    createdByUserId: null,
  });
  token = t.token;
});

describe("sign rental_player waiver", () => {
  it("marks the roster row signed", async () => {
    const res = await fetch(`${BASE}/api/self-serve/${token}/waiver`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ acceptedName: "Signer Sam" }),
    });
    expect(res.status).toBe(200);
    const [after] = await getDb()
      .select({
        status: fieldRentalPlayers.status,
        signerName: fieldRentalPlayers.signerName,
        signedAt: fieldRentalPlayers.signedAt,
        contentHash: fieldRentalPlayers.contentHash,
      })
      .from(fieldRentalPlayers).where(eq(fieldRentalPlayers.id, playerId)).limit(1);
    expect(after.status).toBe("signed");
    expect(after.signerName).toBe("Signer Sam");
    expect(after.signedAt).not.toBeNull();
    expect(after.contentHash).not.toBeNull();
  });
});
