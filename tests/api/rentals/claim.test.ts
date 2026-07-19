/**
 * Integration: POST /api/rentals/claim/:token — a guest field-rental
 * booking (renterUserId null) gets claimed by an account the visitor
 * either creates or signs into. Runs over HTTP against the running dev
 * server + direct DB, mirroring claim-link.test.ts / pay.test.ts.
 */
import { describe, it, expect } from "vitest";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { fieldRentals } from "@/lib/db/schema/field-rentals";
import { users } from "@/lib/db/schema/users";
import { hashPassword } from "@/lib/auth";
import { mintRentalClaimToken } from "@/lib/rentals/claim";
import { verifyToken } from "@/lib/check-in/tokens-db";
import { apiFetch, testSlug } from "../setup/test-helpers";
import { E2E_RENTAL_VENUE_ID, E2E_ORG_ID } from "@/lib/db/seeds/seed-e2e-tests";

const orgId = E2E_ORG_ID;

// Distinct far-future day per run so concurrent CI runs never collide on the
// same field/time slot (mirrors request.test.ts / pay.test.ts / claim-link.test.ts).
const RUN_DAY_OFFSET = Math.floor(Math.random() * 3_650);
const RUN_BASE_UTC = Date.UTC(2041, 0, 1) + RUN_DAY_OFFSET * 86_400_000;
let fieldCounter = 40;

async function makeApprovedGuestRental(email: string) {
  const [r] = await getDb()
    .insert(fieldRentals)
    .values({
      organizationId: orgId,
      venueId: E2E_RENTAL_VENUE_ID,
      fieldNumber: fieldCounter++,
      startsAt: new Date(RUN_BASE_UTC + 10 * 3_600_000),
      endsAt: new Date(RUN_BASE_UTC + 11 * 3_600_000),
      status: "pending_payment",
      source: "online_booking",
      paymentMethod: "card_online",
      amountDueCents: 5000,
      renterUserId: null,
      renterName: "Claim Tester",
      renterEmail: email,
      paymentExpiresAt: new Date(Date.now() + 24 * 3_600_000),
    })
    .returning();
  return r;
}

function uniqueEmail(prefix: string): string {
  return `${testSlug(prefix)}@test.aspiresports.com`;
}

describe("POST /api/rentals/claim/:token", () => {
  it("404 for an invalid token", async () => {
    const res = await apiFetch("/api/rentals/claim/not-a-real-token", {
      method: "POST",
      body: JSON.stringify({ mode: "signup", password: "correcthorse1" }),
    });
    expect(res.status).toBe(404);
  });

  it("signup with a fresh email claims the rental, verifies the account, consumes the token", async () => {
    const email = uniqueEmail("claim-fresh");
    const rental = await makeApprovedGuestRental(email);
    const token = await mintRentalClaimToken(rental);

    const res = await apiFetch(`/api/rentals/claim/${token}`, {
      method: "POST",
      body: JSON.stringify({ mode: "signup", password: "correcthorse1", name: "Fresh Claimer" }),
    });
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(typeof body.redirect).toBe("string");

    const [afterRental] = await getDb()
      .select({ renterUserId: fieldRentals.renterUserId })
      .from(fieldRentals)
      .where(eq(fieldRentals.id, rental.id));
    expect(afterRental.renterUserId).toBeTruthy();

    const [user] = await getDb()
      .select()
      .from(users)
      .where(eq(users.id, afterRental.renterUserId as string));
    expect(user.email).toBe(email.toLowerCase());
    expect(user.emailVerified).toBe(true);
    expect(user.passwordHash).toBeTruthy();

    const v = await verifyToken(token);
    expect(v.ok).toBe(false);
    if (!v.ok) expect(v.reason).toBe("consumed");

    // A session cookie should have been minted.
    expect(res.headers.get("set-cookie")).toBeTruthy();
  });

  it("a second claim attempt on the now-claimed rental 409s", async () => {
    const email = uniqueEmail("claim-double");
    const rental = await makeApprovedGuestRental(email);
    const token1 = await mintRentalClaimToken(rental);

    const first = await apiFetch(`/api/rentals/claim/${token1}`, {
      method: "POST",
      body: JSON.stringify({ mode: "signup", password: "correcthorse1", name: "Double Claimer" }),
    });
    expect(first.status).toBe(200);

    // Mint a fresh token targeting the same (now-claimed) rental — the
    // rental's renterUserId is already set, so this should 409 before any
    // account work happens.
    const token2 = await mintRentalClaimToken({ ...rental, id: rental.id });
    const second = await apiFetch(`/api/rentals/claim/${token2}`, {
      method: "POST",
      body: JSON.stringify({ mode: "signup", password: "anotherpassword1", name: "Second Try" }),
    });
    expect(second.status).toBe(409);
  });

  it("signup where the email already has an account 409s account_exists (no duplicate, no claim)", async () => {
    const email = uniqueEmail("claim-existing");
    // Create the existing account via a real signup-shaped insert.
    const [existingUser] = await getDb()
      .insert(users)
      .values({
        email: email.toLowerCase(),
        emailCanonical: email.toLowerCase(),
        passwordHash: await hashPassword("originalpassword1"),
        firstName: "Existing",
        lastName: "Owner",
        emailVerified: true,
      })
      .returning();

    const rental = await makeApprovedGuestRental(email);
    const token = await mintRentalClaimToken(rental);

    const res = await apiFetch(`/api/rentals/claim/${token}`, {
      method: "POST",
      body: JSON.stringify({ mode: "signup", password: "somenewpassword1", name: "Impersonator" }),
    });
    const body = await res.json();
    expect(res.status).toBe(409);
    expect(body.error).toBe("account_exists");

    const [afterRental] = await getDb()
      .select({ renterUserId: fieldRentals.renterUserId })
      .from(fieldRentals)
      .where(eq(fieldRentals.id, rental.id));
    expect(afterRental.renterUserId).toBeNull();

    const matches = await getDb()
      .select()
      .from(users)
      .where(eq(users.emailCanonical, email.toLowerCase()));
    expect(matches.length).toBe(1);
    expect(matches[0].id).toBe(existingUser.id);
  });

  it("signin mode with correct password claims the rental for the existing account", async () => {
    const email = uniqueEmail("claim-signin");
    const password = "correctpassword1";
    const [existingUser] = await getDb()
      .insert(users)
      .values({
        email: email.toLowerCase(),
        emailCanonical: email.toLowerCase(),
        passwordHash: await hashPassword(password),
        firstName: "Sign",
        lastName: "Inner",
        emailVerified: true,
      })
      .returning();

    const rental = await makeApprovedGuestRental(email);
    const token = await mintRentalClaimToken(rental);

    const res = await apiFetch(`/api/rentals/claim/${token}`, {
      method: "POST",
      body: JSON.stringify({ mode: "signin", password }),
    });
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.ok).toBe(true);

    const [afterRental] = await getDb()
      .select({ renterUserId: fieldRentals.renterUserId })
      .from(fieldRentals)
      .where(eq(fieldRentals.id, rental.id));
    expect(afterRental.renterUserId).toBe(existingUser.id);
  });

  it("signin mode with the wrong password 401s and does not claim", async () => {
    const email = uniqueEmail("claim-badpw");
    await getDb()
      .insert(users)
      .values({
        email: email.toLowerCase(),
        emailCanonical: email.toLowerCase(),
        passwordHash: await hashPassword("therealpassword1"),
        firstName: "Wrong",
        lastName: "Pw",
        emailVerified: true,
      })
      .returning();

    const rental = await makeApprovedGuestRental(email);
    const token = await mintRentalClaimToken(rental);

    const res = await apiFetch(`/api/rentals/claim/${token}`, {
      method: "POST",
      body: JSON.stringify({ mode: "signin", password: "totallywrongpassword" }),
    });
    expect(res.status).toBe(401);

    const [afterRental] = await getDb()
      .select({ renterUserId: fieldRentals.renterUserId })
      .from(fieldRentals)
      .where(eq(fieldRentals.id, rental.id));
    expect(afterRental.renterUserId).toBeNull();
  });
});
