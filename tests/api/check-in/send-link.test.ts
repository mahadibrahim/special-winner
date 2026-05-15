import { describe, it, expect, beforeAll } from "vitest";
import { getAdminCookie, apiFetch } from "../setup/test-helpers";
import { getDb } from "@/lib/db";
import { fieldRentals } from "@/lib/db/schema/field-rentals";
import { E2E_RENTAL_VENUE_ID, E2E_ORG_ID } from "@/lib/db/seeds/seed-e2e-tests";

const RUN_DAY_OFFSET = Math.floor(Math.random() * 3_650);
const RUN_BASE_UTC = Date.UTC(2035, 0, 1) + RUN_DAY_OFFSET * 86_400_000;

describe("POST /api/admin/check-in/send-link", () => {
  let cookie: string;
  let rentalId: string;
  let rentalNoPhoneId: string;

  beforeAll(async () => {
    cookie = await getAdminCookie();
    const start = new Date(RUN_BASE_UTC + 10 * 3_600_000);
    const [r1] = await getDb()
      .insert(fieldRentals)
      .values({
        organizationId: E2E_ORG_ID,
        venueId: E2E_RENTAL_VENUE_ID,
        fieldNumber: 30,
        startsAt: start,
        endsAt: new Date(start.getTime() + 3_600_000),
        status: "confirmed",
        source: "admin_created",
        renterName: "Send-Link Tester",
        renterEmail: "send-link@example.com",
        renterPhone: "5555550182",
        paymentMethod: "cash",
        amountDueCents: 8000,
        amountPaidCents: 8000,
        paymentStatus: "paid",
      })
      .returning();
    rentalId = r1.id;

    const start2 = new Date(RUN_BASE_UTC + 14 * 3_600_000);
    const [r2] = await getDb()
      .insert(fieldRentals)
      .values({
        organizationId: E2E_ORG_ID,
        venueId: E2E_RENTAL_VENUE_ID,
        fieldNumber: 31,
        startsAt: start2,
        endsAt: new Date(start2.getTime() + 3_600_000),
        status: "confirmed",
        source: "admin_created",
        renterName: "No Phone",
        renterEmail: "no-phone@example.com",
        renterPhone: null,
        paymentMethod: "cash",
        amountDueCents: 8000,
        amountPaidCents: 8000,
        paymentStatus: "paid",
      })
      .returning();
    rentalNoPhoneId = r2.id;
  });

  it("returns 200 with self-serve URL for QR channel", async () => {
    const res = await apiFetch("/api/admin/check-in/send-link", {
      method: "POST",
      cookie,
      body: JSON.stringify({ kind: "field_rental", targetId: rentalId, channel: "qr" }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(typeof body.url).toBe("string");
    expect(body.url).toMatch(/\/self-serve\//);
    expect(body.channel).toBe("qr");
  });

  it("re-uses the live token on a second QR send (idempotent)", async () => {
    const a = await apiFetch("/api/admin/check-in/send-link", {
      method: "POST",
      cookie,
      body: JSON.stringify({ kind: "field_rental", targetId: rentalId, channel: "qr" }),
    });
    const b = await apiFetch("/api/admin/check-in/send-link", {
      method: "POST",
      cookie,
      body: JSON.stringify({ kind: "field_rental", targetId: rentalId, channel: "qr" }),
    });
    const aBody = await a.json();
    const bBody = await b.json();
    expect(aBody.url).toBe(bBody.url);
  });

  it("returns 422 when channel=sms but no phone on file", async () => {
    const res = await apiFetch("/api/admin/check-in/send-link", {
      method: "POST",
      cookie,
      body: JSON.stringify({ kind: "field_rental", targetId: rentalNoPhoneId, channel: "sms" }),
    });
    expect(res.status).toBe(422);
  });

  it("returns 401/403 without admin cookie", async () => {
    const res = await apiFetch("/api/admin/check-in/send-link", {
      method: "POST",
      body: JSON.stringify({ kind: "field_rental", targetId: rentalId, channel: "qr" }),
    });
    expect([401, 403]).toContain(res.status);
  });
});
