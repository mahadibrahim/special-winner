/**
 * Integration: GET /api/rentals/blocks/:token - the public, no-account read
 * behind the renter-facing quote page.
 *
 * The token is the only credential, so this suite also pins the payload's
 * allow-list: internal notes and createdByUserId must never cross the boundary.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { eq, inArray } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { fieldRentals } from "@/lib/db/schema/field-rentals";
import { fieldRentalBlocks } from "@/lib/db/schema/field-rental-blocks";
import { selfServiceTokens } from "@/lib/db/schema/self-service-tokens";
import { mintBlockToken } from "@/lib/rentals/blocks/tokens";
import { apiFetch } from "../../setup/test-helpers";
import {
  E2E_ORG_ID,
  E2E_RENTAL_VENUE_ID,
  resolveE2ELocationId,
  resolveE2EAdminUserId,
} from "@/lib/db/seeds/seed-e2e-tests";

let locationId: string;
let adminUserId: string;
const blockIds: string[] = [];

// Far-future so nothing seeded collides, and a per-run offset so concurrent
// CI runs never fight over the same field/time slot.
const RUN_DAY_OFFSET = Math.floor(Math.random() * 3_650);
const RUN_BASE_UTC = Date.UTC(2044, 0, 5) + RUN_DAY_OFFSET * 86_400_000;

interface BlockShape {
  status: "draft" | "awaiting_deposit" | "active" | "completed" | "cancelled";
  depositPaidAt?: Date | null;
  balancePaidAt?: Date | null;
  sessionCount?: number;
}

async function makeBlock(shape: BlockShape) {
  const db = getDb();
  const [block] = await db
    .insert(fieldRentalBlocks)
    .values({
      organizationId: E2E_ORG_ID,
      locationId,
      brand: "soccerone",
      label: `Public Token Block ${Math.random().toString(36).slice(2, 8)}`,
      renterName: "Token Tester",
      renterEmail: "token-tester@test.aspiresports.com",
      partySize: 12,
      // The two fields the payload must never leak.
      notes: "INTERNAL ONLY do not leak",
      createdByUserId: adminUserId,
      subtotalCents: 312_000,
      discountKind: "percent",
      discountValue: 10,
      totalCents: 280_800,
      depositPctSnapshot: 25,
      depositDueCents: 70_200,
      balanceDueCents: 210_600,
      status: shape.status,
      depositPaidAt: shape.depositPaidAt ?? null,
      balancePaidAt: shape.balancePaidAt ?? null,
      depositExpiresAt: new Date(Date.now() + 72 * 3_600_000),
      balanceDueAt: new Date(RUN_BASE_UTC - 30 * 86_400_000),
    })
    .returning();
  blockIds.push(block.id);

  const count = shape.sessionCount ?? 3;
  for (let i = 0; i < count; i += 1) {
    await db.insert(fieldRentals).values({
      blockId: block.id,
      organizationId: E2E_ORG_ID,
      venueId: E2E_RENTAL_VENUE_ID,
      fieldNumber: 9,
      startsAt: new Date(RUN_BASE_UTC + i * 7 * 86_400_000),
      endsAt: new Date(RUN_BASE_UTC + i * 7 * 86_400_000 + 3_600_000),
      source: "admin_created",
      brand: "soccerone",
      status: shape.status === "awaiting_deposit" ? "pending_payment" : "confirmed",
      paymentMethod: "card_online",
      paymentStatus: "unpaid",
      amountDueCents: 93_600,
      renterName: "Token Tester",
    });
  }

  return block;
}

beforeAll(async () => {
  locationId = await resolveE2ELocationId();
  adminUserId = await resolveE2EAdminUserId();
});

afterAll(async () => {
  const db = getDb();
  if (blockIds.length) {
    await db.delete(selfServiceTokens).where(inArray(selfServiceTokens.targetId, blockIds));
    await db.delete(fieldRentals).where(inArray(fieldRentals.blockId, blockIds));
    await db.delete(fieldRentalBlocks).where(inArray(fieldRentalBlocks.id, blockIds));
  }
});

describe("GET /api/rentals/blocks/:token", () => {
  it("resolves without any auth cookie and returns the full session list", async () => {
    const block = await makeBlock({ status: "awaiting_deposit", sessionCount: 4 });
    const token = await mintBlockToken(block);

    // Deliberately no cookie: these renters never have an account.
    const res = await apiFetch(`/api/rentals/blocks/${token}`, { method: "GET" });
    expect(res.status).toBe(200);
    const body = await res.json();

    expect(body.block.id).toBe(block.id);
    expect(body.block.label).toBe(block.label);
    expect(body.sessions).toHaveLength(4);
    expect(body.timeZone).toBeTruthy();
  });

  it("reports the deposit as owed while the block awaits it", async () => {
    const block = await makeBlock({ status: "awaiting_deposit" });
    const token = await mintBlockToken(block);
    const res = await apiFetch(`/api/rentals/blocks/${token}`, { method: "GET" });
    const body = await res.json();
    expect(body.owed.kind).toBe("deposit");
    expect(body.owed.cents).toBe(70_200);
  });

  it("reports the balance as owed once the deposit is paid", async () => {
    const block = await makeBlock({ status: "active", depositPaidAt: new Date() });
    const token = await mintBlockToken(block);
    const res = await apiFetch(`/api/rentals/blocks/${token}`, { method: "GET" });
    const body = await res.json();
    expect(body.owed.kind).toBe("balance");
    expect(body.owed.cents).toBe(210_600);
  });

  it("reports nothing owed once the block is settled", async () => {
    const block = await makeBlock({
      status: "active",
      depositPaidAt: new Date(),
      balancePaidAt: new Date(),
    });
    const token = await mintBlockToken(block);
    const res = await apiFetch(`/api/rentals/blocks/${token}`, { method: "GET" });
    const body = await res.json();
    expect(body.owed.kind).toBe("none");
    expect(body.owed.cents).toBe(0);
  });

  it("never leaks internal notes or createdByUserId", async () => {
    const block = await makeBlock({ status: "awaiting_deposit" });
    const token = await mintBlockToken(block);
    const res = await apiFetch(`/api/rentals/blocks/${token}`, { method: "GET" });
    const raw = await res.text();
    expect(raw).not.toContain("INTERNAL ONLY");
    expect(raw).not.toContain("createdByUserId");
    expect(raw).not.toContain(adminUserId);
    const body = JSON.parse(raw);
    expect(body.block.notes).toBeUndefined();
    expect(body.block.pattern).toBeUndefined();
  });

  it("404s an unknown token", async () => {
    const res = await apiFetch(
      "/api/rentals/blocks/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      { method: "GET" },
    );
    expect(res.status).toBe(404);
  });

  it("410s an expired token", async () => {
    const block = await makeBlock({ status: "awaiting_deposit" });
    const token = await mintBlockToken(block);
    await getDb()
      .update(selfServiceTokens)
      .set({ expiresAt: new Date(Date.now() - 60_000) })
      .where(eq(selfServiceTokens.token, token));

    const res = await apiFetch(`/api/rentals/blocks/${token}`, { method: "GET" });
    expect(res.status).toBe(410);
  });
});
