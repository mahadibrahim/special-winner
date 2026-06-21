import { describe, it, expect, beforeAll } from "vitest";
import { getAdminCookie, apiFetch } from "../setup/test-helpers";
import { getDb } from "@/lib/db";
import { dropInBookings } from "@/lib/db/schema/drop-in";
import { fieldRentals } from "@/lib/db/schema/field-rentals";
import { users } from "@/lib/db/schema/users";
import {
  createTestDropInSession,
  resolveDefaultOrgForHttpTests,
} from "../../utils/dropin-helpers";
import { E2E_RENTAL_VENUE_ID, E2E_ORG_ID } from "@/lib/db/seeds/seed-e2e-tests";

const RUN_DAY_OFFSET = Math.floor(Math.random() * 3_650);
const RUN_BASE_UTC = Date.UTC(2035, 0, 1) + RUN_DAY_OFFSET * 86_400_000;

describe("GET /api/admin/check-in/event", () => {
  let cookie: string;

  beforeAll(async () => {
    cookie = await getAdminCookie();
  });

  it("returns 400 without kind/id params", async () => {
    const res = await apiFetch("/api/admin/check-in/event", { cookie });
    expect(res.status).toBe(400);
  });

  it("returns 400 for unknown kind", async () => {
    const res = await apiFetch(
      "/api/admin/check-in/event?kind=unknown&id=00000000-0000-0000-0000-000000000000",
      { cookie },
    );
    expect(res.status).toBe(400);
  });

  it("returns 401/403 without admin cookie", async () => {
    const res = await apiFetch(
      "/api/admin/check-in/event?kind=field_rental&id=00000000-0000-0000-0000-000000000000",
    );
    expect([401, 403]).toContain(res.status);
  });

  // ── field_rental ────────────────────────────────────────────────────────────

  describe("field_rental", () => {
    let rentalId: string;

    beforeAll(async () => {
      const start = new Date(RUN_BASE_UTC + 11 * 3_600_000);
      const [r] = await getDb()
        .insert(fieldRentals)
        .values({
          organizationId: E2E_ORG_ID,
          venueId: E2E_RENTAL_VENUE_ID,
          fieldNumber: 41,
          startsAt: start,
          endsAt: new Date(start.getTime() + 3_600_000),
          status: "confirmed",
          source: "admin_created",
          renterName: "Event Endpoint Tester",
          paymentMethod: "cash",
          amountDueCents: 8000,
          amountPaidCents: 8000,
          paymentStatus: "paid",
        })
        .returning();
      rentalId = r.id;
    });

    it("returns event + rows with paid: true for a field rental", async () => {
      const res = await apiFetch(
        `/api/admin/check-in/event?kind=field_rental&id=${rentalId}`,
        { cookie },
      );
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.event.kind).toBe("field_rental");
      expect(Array.isArray(body.rows)).toBe(true);
      expect(body.rows).toHaveLength(1);
      const row = body.rows[0];
      expect(row.rowKind).toBe("field_rental");
      expect(typeof row.paid).toBe("boolean");
      expect(row.paid).toBe(true); // field_rental always paid
    });

    it("returns 404 for a non-existent rental", async () => {
      const res = await apiFetch(
        "/api/admin/check-in/event?kind=field_rental&id=00000000-0000-0000-0000-000000000000",
        { cookie },
      );
      expect(res.status).toBe(404);
    });
  });

  // ── drop_in_session ─────────────────────────────────────────────────────────

  describe("drop_in_session — paid boolean per booking", () => {
    it("paid=true when amountPaidCents > 0 (rate-bearing booking)", async () => {
      const orgCtx = await resolveDefaultOrgForHttpTests();
      const ctx = await createTestDropInSession({
        organizationId: orgCtx.organizationId,
        venueId: orgCtx.venueId,
        sessionRateCents: 1500,
      });

      const [u] = await getDb()
        .insert(users)
        .values({
          email: `event-test-paid-${Date.now()}@t.example`,
          firstName: "Paid",
          lastName: "User",
        })
        .returning();

      await getDb()
        .insert(dropInBookings)
        .values({
          sessionId: ctx.sessionId,
          userId: u.id,
          status: "confirmed",
          source: "online_booking",
          paymentMethod: "card_online",
          amountPaidCents: 1500,
        });

      const res = await apiFetch(
        `/api/admin/check-in/event?kind=drop_in_session&id=${ctx.sessionId}`,
        { cookie },
      );
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.rows).toHaveLength(1);
      const row = body.rows[0];
      expect(typeof row.paid).toBe("boolean");
      expect(row.paid).toBe(true);
    });

    it("paid=false when amountPaidCents=0 on a paid-rate session (walk-up link not yet paid)", async () => {
      const orgCtx = await resolveDefaultOrgForHttpTests();
      const ctx = await createTestDropInSession({
        organizationId: orgCtx.organizationId,
        venueId: orgCtx.venueId,
        sessionRateCents: 1500,
      });

      const [u] = await getDb()
        .insert(users)
        .values({
          email: `event-test-unpaid-${Date.now()}@t.example`,
          firstName: "Unpaid",
          lastName: "Walkup",
        })
        .returning();

      // Walk-up added but payment link not yet completed (amountPaidCents = 0)
      await getDb()
        .insert(dropInBookings)
        .values({
          sessionId: ctx.sessionId,
          userId: u.id,
          status: "confirmed",
          source: "walk_up",
          paymentMethod: "card_online",
          amountPaidCents: 0,
        });

      const res = await apiFetch(
        `/api/admin/check-in/event?kind=drop_in_session&id=${ctx.sessionId}`,
        { cookie },
      );
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.rows).toHaveLength(1);
      const row = body.rows[0];
      expect(typeof row.paid).toBe("boolean");
      expect(row.paid).toBe(false);
    });

    it("paid=true when session rate is 0 (free session)", async () => {
      const orgCtx = await resolveDefaultOrgForHttpTests();
      const ctx = await createTestDropInSession({
        organizationId: orgCtx.organizationId,
        venueId: orgCtx.venueId,
        sessionRateCents: 0,
      });

      const [u] = await getDb()
        .insert(users)
        .values({
          email: `event-test-free-${Date.now()}@t.example`,
          firstName: "Free",
          lastName: "Session",
        })
        .returning();

      await getDb()
        .insert(dropInBookings)
        .values({
          sessionId: ctx.sessionId,
          userId: u.id,
          status: "confirmed",
          source: "online_booking",
          paymentMethod: "card_online",
          amountPaidCents: 0, // free session → paid implicitly
        });

      const res = await apiFetch(
        `/api/admin/check-in/event?kind=drop_in_session&id=${ctx.sessionId}`,
        { cookie },
      );
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.rows).toHaveLength(1);
      const row = body.rows[0];
      expect(typeof row.paid).toBe("boolean");
      expect(row.paid).toBe(true); // free session → paid
    });

    it("returns 404 for a non-existent session", async () => {
      const res = await apiFetch(
        "/api/admin/check-in/event?kind=drop_in_session&id=00000000-0000-0000-0000-000000000000",
        { cookie },
      );
      expect(res.status).toBe(404);
    });
  });
});
