/**
 * Integration: GET /api/rentals/bookings groups a renter's block sessions
 * under the block that owns them, with the money and the pay link the
 * dashboard's "Pay balance" action needs.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { eq, inArray } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { users } from "@/lib/db/schema/users";
import { fieldRentals } from "@/lib/db/schema/field-rentals";
import { fieldRentalBlocks } from "@/lib/db/schema/field-rental-blocks";
import { apiFetch, getParentCookie, getCoachCookie } from "../../setup/test-helpers";
import {
  E2E_ORG_ID,
  E2E_RENTAL_VENUE_ID,
  resolveE2ELocationId,
} from "@/lib/db/seeds/seed-e2e-tests";

let parent: string;
let coach: string;
let locationId: string;
let parentUserId: string;

const blockIds: string[] = [];
const rentalIds: string[] = [];

// Far future plus a per-run offset so concurrent CI runs never contend for the
// same field and time.
const RUN_DAY_OFFSET = Math.floor(Math.random() * 3_650);
const RUN_BASE_UTC = Date.UTC(2045, 0, 5) + RUN_DAY_OFFSET * 86_400_000;

interface BookingsBody {
  rentals: Array<{
    id: string;
    blockId: string | null;
    blockLabel: string | null;
  }>;
  blocks: Array<{
    id: string;
    label: string;
    sessionCount: number;
    firstSessionAt: string | null;
    lastSessionAt: string | null;
    totalCents: number;
    paidCents: number;
    depositDueCents: number;
    balanceDueCents: number;
    balanceDueAt: string | null;
    owed: { kind: string; cents: number; dueAt: string | null };
    payUrl: string | null;
  }>;
}

async function resolveParentUserId(): Promise<string> {
  const [row] = await getDb()
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, "parent@test.aspiresports.com"))
    .limit(1);
  if (!row) throw new Error("E2E parent user is not seeded - run `npm run db:seed:e2e`");
  return row.id;
}

beforeAll(async () => {
  parent = await getParentCookie();
  coach = await getCoachCookie();
  locationId = await resolveE2ELocationId();
  parentUserId = await resolveParentUserId();

  const db = getDb();

  // An active block owed a balance, attached to the parent account.
  const [block] = await db
    .insert(fieldRentalBlocks)
    .values({
      organizationId: E2E_ORG_ID,
      locationId,
      brand: "soccerone",
      label: `Dashboard Block ${Math.random().toString(36).slice(2, 8)}`,
      renterUserId: parentUserId,
      renterName: "Dashboard Tester",
      renterEmail: "parent@test.aspiresports.com",
      partySize: 12,
      subtotalCents: 312_000,
      totalCents: 280_800,
      depositPctSnapshot: 25,
      depositDueCents: 70_200,
      depositPaidAt: new Date(),
      balanceDueCents: 210_600,
      balanceDueAt: new Date(RUN_BASE_UTC - 30 * 86_400_000),
      status: "active",
    })
    .returning();
  blockIds.push(block.id);

  for (let i = 0; i < 2; i++) {
    const startsAt = new Date(RUN_BASE_UTC + i * 7 * 86_400_000 + 3_600_000);
    const [row] = await db
      .insert(fieldRentals)
      .values({
        organizationId: E2E_ORG_ID,
        venueId: E2E_RENTAL_VENUE_ID,
        fieldNumber: 1,
        startsAt,
        endsAt: new Date(startsAt.getTime() + 3_600_000),
        status: "confirmed",
        source: "admin_created",
        paymentMethod: "card_online",
        amountDueCents: 140_400,
        renterUserId: parentUserId,
        renterName: "Dashboard Tester",
        blockId: block.id,
      })
      .returning();
    rentalIds.push(row.id);
  }

  // A standalone rental for the same user - it must keep coming back ungrouped.
  const soloStart = new Date(RUN_BASE_UTC + 21 * 86_400_000 + 3_600_000);
  const [solo] = await db
    .insert(fieldRentals)
    .values({
      organizationId: E2E_ORG_ID,
      venueId: E2E_RENTAL_VENUE_ID,
      fieldNumber: 2,
      startsAt: soloStart,
      endsAt: new Date(soloStart.getTime() + 3_600_000),
      status: "confirmed",
      source: "admin_created",
      paymentMethod: "cash",
      amountDueCents: 26_000,
      renterUserId: parentUserId,
      renterName: "Dashboard Tester",
    })
    .returning();
  rentalIds.push(solo.id);
});

afterAll(async () => {
  const db = getDb();
  if (rentalIds.length) {
    await db.delete(fieldRentals).where(inArray(fieldRentals.id, rentalIds));
  }
  if (blockIds.length) {
    await db.delete(fieldRentalBlocks).where(inArray(fieldRentalBlocks.id, blockIds));
  }
});

describe("GET /api/rentals/bookings - block grouping", () => {
  it("groups the renter's sessions under their block", async () => {
    const res = await apiFetch("/api/rentals/bookings", { headers: { Cookie: parent } });
    expect(res.status).toBe(200);
    const body: BookingsBody = await res.json();

    const block = body.blocks.find((b) => b.id === blockIds[0]);
    expect(block).toBeTruthy();
    expect(block!.sessionCount).toBe(2);
    expect(block!.totalCents).toBe(280_800);
    // The deposit is paid, the balance is not - blockPaidCents is deposit only.
    expect(block!.paidCents).toBe(70_200);
    expect(block!.balanceDueCents).toBe(210_600);
    expect(block!.owed.kind).toBe("balance");
    expect(block!.owed.cents).toBe(210_600);
    expect(block!.payUrl).toMatch(/^\/rentals\/blocks\/.+/);
    expect(block!.firstSessionAt).toBeTruthy();
    expect(block!.lastSessionAt).toBeTruthy();

    // The sessions themselves carry the block back so the UI can bucket them.
    const grouped = body.rentals.filter((r) => r.blockId === blockIds[0]);
    expect(grouped).toHaveLength(2);
    expect(grouped[0].blockLabel).toBe(block!.label);
  });

  it("leaves standalone rentals ungrouped", async () => {
    const res = await apiFetch("/api/rentals/bookings", { headers: { Cookie: parent } });
    const body: BookingsBody = await res.json();
    const solo = body.rentals.find((r) => r.id === rentalIds[rentalIds.length - 1]);
    expect(solo).toBeTruthy();
    expect(solo!.blockId).toBeNull();
    expect(solo!.blockLabel).toBeNull();
  });

  it("reuses one token across calls rather than minting a new one", async () => {
    const first: BookingsBody = await (
      await apiFetch("/api/rentals/bookings", { headers: { Cookie: parent } })
    ).json();
    const second: BookingsBody = await (
      await apiFetch("/api/rentals/bookings", { headers: { Cookie: parent } })
    ).json();
    const a = first.blocks.find((b) => b.id === blockIds[0])?.payUrl;
    const b = second.blocks.find((b) => b.id === blockIds[0])?.payUrl;
    expect(a).toBeTruthy();
    expect(b).toBe(a);
  });

  it("never shows another user's block", async () => {
    const res = await apiFetch("/api/rentals/bookings", { headers: { Cookie: coach } });
    expect(res.status).toBe(200);
    const body: BookingsBody = await res.json();
    expect(body.blocks.some((b) => b.id === blockIds[0])).toBe(false);
    expect(body.rentals.some((r) => r.blockId === blockIds[0])).toBe(false);
  });

  it("rejects an anonymous caller with 401", async () => {
    const res = await apiFetch("/api/rentals/bookings");
    expect(res.status).toBe(401);
  });
});
