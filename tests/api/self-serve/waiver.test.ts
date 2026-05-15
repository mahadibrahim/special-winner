import { describe, it, expect, beforeAll } from "vitest";
import { apiFetch } from "../setup/test-helpers";
import { getDb } from "@/lib/db";
import { fieldRentals } from "@/lib/db/schema/field-rentals";
import { mintToken } from "@/lib/check-in/tokens-db";
import { E2E_RENTAL_VENUE_ID, E2E_ORG_ID } from "@/lib/db/seeds/seed-e2e-tests";
import { eq } from "drizzle-orm";

const BASE = process.env.TEST_BASE_URL ?? "http://localhost:4321";

// Unique slot per run to avoid collisions.
const RUN_DAY_OFFSET = Math.floor(Math.random() * 3_650);
const RUN_BASE_UTC = Date.UTC(2035, 0, 1) + RUN_DAY_OFFSET * 86_400_000;

describe("POST /api/self-serve/[token]/waiver", () => {
  let rentalId: string;
  let tokenValue: string;

  beforeAll(async () => {
    // Seed a field_rental without waiver signed.
    const start = new Date(RUN_BASE_UTC + 12 * 3_600_000);
    const [rental] = await getDb()
      .insert(fieldRentals)
      .values({
        organizationId: E2E_ORG_ID,
        venueId: E2E_RENTAL_VENUE_ID,
        fieldNumber: 51,
        startsAt: start,
        endsAt: new Date(start.getTime() + 3_600_000),
        status: "confirmed",
        source: "admin_created",
        renterName: "Waiver Test Renter",
        renterEmail: "waiver-test@example.com",
        renterPhone: null,
        paymentMethod: "cash",
        amountDueCents: 8000,
        amountPaidCents: 8000,
        paymentStatus: "paid",
        waiverSigned: false,
      })
      .returning();
    rentalId = rental.id;

    // Mint a token.
    const tok = await mintToken({
      kind: "field_rental",
      targetId: rentalId,
      organizationId: E2E_ORG_ID,
      venueId: E2E_RENTAL_VENUE_ID,
      sentVia: "qr",
      recipientUserId: null,
      recipientEmail: "waiver-test@example.com",
      recipientPhone: null,
      createdByUserId: null,
    });
    tokenValue = tok.token;
  });

  it("returns 200 and marks waiver signed on the rental row", async () => {
    const res = await fetch(`${BASE}/api/self-serve/${tokenValue}/waiver`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ acceptedName: "Test Renter" }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty("ok", true);
    expect(typeof body.waiverSignedAt).toBe("string");

    // Verify DB was actually updated.
    const [row] = await getDb()
      .select({
        waiverSigned: fieldRentals.waiverSigned,
        waiverSignedBy: fieldRentals.waiverSignedBy,
        waiverSignedAt: fieldRentals.waiverSignedAt,
      })
      .from(fieldRentals)
      .where(eq(fieldRentals.id, rentalId))
      .limit(1);

    expect(row.waiverSigned).toBe(true);
    expect(row.waiverSignedBy).toBe("Test Renter");
    expect(row.waiverSignedAt).not.toBeNull();
  });

  it("returns 422 when acceptedName is empty", async () => {
    const res = await fetch(`${BASE}/api/self-serve/${tokenValue}/waiver`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ acceptedName: "  " }),
    });
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body).toHaveProperty("error");
  });

  it("returns 422 when acceptedName is missing", async () => {
    const res = await fetch(`${BASE}/api/self-serve/${tokenValue}/waiver`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(422);
  });

  it("returns 404 for a non-existent token", async () => {
    // Correctly shaped but not in the DB.
    const fake = "BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB";
    const res = await fetch(`${BASE}/api/self-serve/${fake}/waiver`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ acceptedName: "Nobody" }),
    });
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body).toHaveProperty("error");
  });
});
