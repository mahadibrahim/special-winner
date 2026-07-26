import { describe, it, expect, beforeAll } from "vitest";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { users } from "@/lib/db/schema/users";
import { dropInBookings } from "@/lib/db/schema/drop-in";
import { apiFetch, getAuthCookie } from "../setup/test-helpers";
import {
  createTestDropInSession,
  resolveDefaultOrgForHttpTests,
} from "../../utils/dropin-helpers";

const ENDPOINT = "/api/dropin/guest-checkout";

// HTTP requests to localhost resolve the DEFAULT org via the domain
// resolver; a session created under a fresh fixture org trips the
// endpoint's multi-tenant guard (403). Free-path fixtures must live
// under the default org.
let defaultOrg: { organizationId: string; venueId: string };

beforeAll(async () => {
  defaultOrg = await resolveDefaultOrgForHttpTests();
});

const freeSessionInDefaultOrg = () =>
  createTestDropInSession({
    organizationId: defaultOrg.organizationId,
    venueId: defaultOrg.venueId,
    sessionRateCents: 0,
    memberRateCents: 0,
  });

const guestBody = (sessionId: string, email: string) => ({
  sessionId,
  firstName: "Guest",
  lastName: "Booker",
  email,
  waiverAccepted: true,
  waiverName: "Guest Booker",
});

describe("POST /api/dropin/guest-checkout", () => {
  it("400s on invalid body", async () => {
    const res = await apiFetch(ENDPOINT, {
      method: "POST",
      body: JSON.stringify({ sessionId: "not-a-uuid" }),
    });
    expect(res.status).toBe(400);
  });

  it("409s for signed-in users (they have the authed flow)", async () => {
    let cookie: string;
    try {
      cookie = await getAuthCookie(
        "parent@test.aspiresports.com",
        "TestParent123!",
      );
    } catch {
      return; // fixture not present in this environment — skip
    }
    const ctx = await createTestDropInSession({});
    const res = await apiFetch(ENDPOINT, {
      method: "POST",
      body: JSON.stringify(guestBody(ctx.sessionId, "anyone@example.com")),
      headers: { Cookie: cookie },
    });
    expect(res.status).toBe(409);
  });

  it("books a free session for a brand-new email, creating a passwordless user", async () => {
    const ctx = await freeSessionInDefaultOrg();
    const email = `guest-dropin-${Date.now()}@example.com`;

    const res = await apiFetch(ENDPOINT, {
      method: "POST",
      body: JSON.stringify(guestBody(ctx.sessionId, email)),
    });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.paymentRequired).toBe(false);
    expect(json.wasNewUser).toBe(true);
    expect(json.bookingId).toBeTruthy();

    // New guest users get a session cookie so the dashboard works.
    expect(res.headers.get("set-cookie") ?? "").toContain("auth_session");

    const db = getDb();
    const [userRow] = await db
      .select()
      .from(users)
      .where(eq(users.email, email));
    expect(userRow).toBeTruthy();
    expect(userRow.passwordHash).toBeNull();

    const [booking] = await db
      .select()
      .from(dropInBookings)
      .where(eq(dropInBookings.id, json.bookingId));
    expect(booking.userId).toBe(userRow.id);
    expect(booking.status).toBe("confirmed");
    expect(booking.waiverSignedBy).toBe("Guest Booker");
  });

  it("books WITHOUT waiver fields — unsigned row, waiver deferred to post-payment", async () => {
    const ctx = await freeSessionInDefaultOrg();
    const email = `guest-dropin-nowaiver-${Date.now()}@example.com`;

    const res = await apiFetch(ENDPOINT, {
      method: "POST",
      body: JSON.stringify({
        sessionId: ctx.sessionId,
        firstName: "Guest",
        lastName: "Booker",
        email,
      }),
    });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.paymentRequired).toBe(false);
    expect(json.bookingId).toBeTruthy();

    const db = getDb();
    const [booking] = await db
      .select()
      .from(dropInBookings)
      .where(eq(dropInBookings.id, json.bookingId));
    expect(booking.waiverSigned).toBe(false);
    expect(booking.waiverSignedAt).toBeNull();
    expect(booking.waiverSignedBy).toBeNull();
  });

  it("400s waiverAccepted:true without a typed name (malformed signature)", async () => {
    const ctx = await freeSessionInDefaultOrg();
    const res = await apiFetch(ENDPOINT, {
      method: "POST",
      body: JSON.stringify({
        sessionId: ctx.sessionId,
        firstName: "Guest",
        lastName: "Booker",
        email: `guest-dropin-badwaiver-${Date.now()}@example.com`,
        waiverAccepted: true,
      }),
    });
    expect(res.status).toBe(400);
  });

  it("409s when the same email already holds an active booking for the session", async () => {
    const ctx = await freeSessionInDefaultOrg();
    const email = `guest-dropin-dupe-${Date.now()}@example.com`;

    const first = await apiFetch(ENDPOINT, {
      method: "POST",
      body: JSON.stringify(guestBody(ctx.sessionId, email)),
    });
    expect(first.status).toBe(200);

    const second = await apiFetch(ENDPOINT, {
      method: "POST",
      body: JSON.stringify(guestBody(ctx.sessionId, email)),
    });
    expect(second.status).toBe(409);
  });

  it("attaches the booking to an existing account WITHOUT setting a session cookie", async () => {
    const ctx = await freeSessionInDefaultOrg();
    // parent@test fixture user exists; book as guest with their email.
    const email = "parent@test.aspiresports.com";
    const db = getDb();
    const [existing] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, email));
    if (!existing) return; // fixture not present — skip

    const res = await apiFetch(ENDPOINT, {
      method: "POST",
      body: JSON.stringify(guestBody(ctx.sessionId, email)),
    });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.wasNewUser).toBe(false);
    // Account-takeover prevention: no session for pre-existing accounts.
    expect(res.headers.get("set-cookie") ?? "").not.toContain("auth_session");

    const [booking] = await db
      .select()
      .from(dropInBookings)
      .where(eq(dropInBookings.id, json.bookingId));
    expect(booking.userId).toBe(existing.id);
  });
});
