import { describe, it, expect, beforeAll } from "vitest";
import { apiFetch } from "../setup/test-helpers";
import { getDb } from "@/lib/db";
import { fieldRentals } from "@/lib/db/schema/field-rentals";
import { mintToken, consumeToken } from "@/lib/check-in/tokens-db";
import { E2E_RENTAL_VENUE_ID, E2E_ORG_ID } from "@/lib/db/seeds/seed-e2e-tests";

const BASE = process.env.TEST_BASE_URL ?? "http://localhost:4321";

// Unique slot per run to avoid collisions with other test files.
const RUN_DAY_OFFSET = Math.floor(Math.random() * 3_650);
const RUN_BASE_UTC = Date.UTC(2035, 0, 1) + RUN_DAY_OFFSET * 86_400_000;

describe("GET /api/self-serve/[token] (context)", () => {
  let rentalId: string;
  let tokenValue: string;
  let tokenId: string;

  beforeAll(async () => {
    // Seed a field_rental row.
    const start = new Date(RUN_BASE_UTC + 11 * 3_600_000);
    const [rental] = await getDb()
      .insert(fieldRentals)
      .values({
        organizationId: E2E_ORG_ID,
        venueId: E2E_RENTAL_VENUE_ID,
        fieldNumber: 50,
        startsAt: start,
        endsAt: new Date(start.getTime() + 3_600_000),
        status: "confirmed",
        source: "admin_created",
        renterName: "Context Test Renter",
        renterEmail: "context-test@example.com",
        renterPhone: null,
        paymentMethod: "cash",
        amountDueCents: 8000,
        amountPaidCents: 8000,
        paymentStatus: "paid",
      })
      .returning();
    rentalId = rental.id;

    // Mint a token for the rental.
    const tok = await mintToken({
      kind: "field_rental",
      targetId: rentalId,
      organizationId: E2E_ORG_ID,
      venueId: E2E_RENTAL_VENUE_ID,
      sentVia: "qr",
      recipientUserId: null,
      recipientEmail: "context-test@example.com",
      recipientPhone: null,
      createdByUserId: null,
    });
    tokenValue = tok.token;
    tokenId = tok.id;
  });

  it("returns 200 with context payload for a valid token", async () => {
    const res = await fetch(`${BASE}/api/self-serve/${tokenValue}`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty("tokenKind", "field_rental");
    expect(typeof body.displayName).toBe("string");
    expect(body.displayName.length).toBeGreaterThan(0);
    expect(body).toHaveProperty("summary");
    expect(typeof body.summary).toBe("string");
    expect(body).toHaveProperty("outstanding");
    expect(body.outstanding.waiver).toBe(true);
    expect(body).toHaveProperty("expiresAt");
  });

  it("returns 410 for a consumed token", async () => {
    // Consume the token directly via DB helper.
    await consumeToken(tokenId, null);
    const res = await fetch(`${BASE}/api/self-serve/${tokenValue}`);
    expect(res.status).toBe(410);
    const body = await res.json();
    expect(body).toHaveProperty("error", "consumed");
  });

  it("returns 404 for a bad-shape token value", async () => {
    // "short" is only 5 chars — fails isTokenShape() with reason bad_shape.
    const res = await fetch(`${BASE}/api/self-serve/short`);
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body).toHaveProperty("error", "bad_shape");
  });

  it("returns 404 for a correctly-shaped but non-existent token", async () => {
    // 43 valid base64url chars that don't exist in the DB.
    const fake = "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";
    const res = await fetch(`${BASE}/api/self-serve/${fake}`);
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body).toHaveProperty("error", "not_found");
  });
});
