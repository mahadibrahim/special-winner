/**
 * Integration: claim-token helpers (Task 3) for guest field-rental bookings.
 * `mintRentalClaimToken` mints a `rental_claim` self-service token targeting
 * the rental; `claimRentalForUser` attaches an unclaimed rental to a user and
 * is idempotent-safe (second call on an already-claimed rental returns
 * false). Runs against the DB directly (no HTTP), like pay.test.ts /
 * request.test.ts.
 */
import { describe, it, expect, beforeAll } from "vitest";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { fieldRentals } from "@/lib/db/schema/field-rentals";
import { mintRentalClaimToken, claimRentalForUser } from "@/lib/rentals/claim";
import { verifyToken } from "@/lib/check-in/tokens-db";
import { getParentCookie, apiFetch } from "../setup/test-helpers";
import { E2E_RENTAL_VENUE_ID, E2E_ORG_ID } from "@/lib/db/seeds/seed-e2e-tests";

const orgId = E2E_ORG_ID;
let parentUserId: string;

// Distinct far-future day per run so concurrent CI runs never collide on the
// same field/time slot (mirrors request.test.ts / pay.test.ts).
const RUN_DAY_OFFSET = Math.floor(Math.random() * 3_650);
const RUN_BASE_UTC = Date.UTC(2040, 0, 1) + RUN_DAY_OFFSET * 86_400_000;

beforeAll(async () => {
  const cookie = await getParentCookie();
  const me = await apiFetch("/api/auth/me", { method: "GET", cookie });
  const meBody = await me.json();
  parentUserId = meBody.user.id;
});

async function makeApprovedGuestRental(field: number) {
  const [r] = await getDb()
    .insert(fieldRentals)
    .values({
      organizationId: orgId,
      venueId: E2E_RENTAL_VENUE_ID,
      fieldNumber: field,
      startsAt: new Date(RUN_BASE_UTC + 10 * 3_600_000),
      endsAt: new Date(RUN_BASE_UTC + 11 * 3_600_000),
      status: "pending_payment",
      source: "online_booking",
      paymentMethod: "card_online",
      amountDueCents: 5000,
      renterUserId: null,
      renterName: "Claim Tester",
      renterEmail: "claim-tester@test.aspiresports.com",
      paymentExpiresAt: new Date(Date.now() + 24 * 3_600_000),
    })
    .returning();
  return r;
}

describe("mintRentalClaimToken / claimRentalForUser", () => {
  it("mints a rental_claim token that resolves to the rental", async () => {
    const rental = await makeApprovedGuestRental(31);
    const token = await mintRentalClaimToken(rental);
    expect(typeof token).toBe("string");
    expect(token.length).toBeGreaterThan(0);

    const v = await verifyToken(token);
    expect(v.ok).toBe(true);
    if (!v.ok) return;
    expect(v.token.kind).toBe("rental_claim");
    expect(v.token.targetId).toBe(rental.id);
    expect(v.token.recipientEmail).toBe(rental.renterEmail);
  });

  it("claims an unclaimed rental once, then reports already-claimed", async () => {
    const rental = await makeApprovedGuestRental(32);
    expect(await claimRentalForUser(rental.id, parentUserId)).toBe(true);
    expect(await claimRentalForUser(rental.id, parentUserId)).toBe(false);

    const [after] = await getDb()
      .select({ renterUserId: fieldRentals.renterUserId })
      .from(fieldRentals)
      .where(eq(fieldRentals.id, rental.id));
    expect(after.renterUserId).toBe(parentUserId);
  });
});
