import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  getAdminCookie,
  apiFetch,
  resetCookies,
} from "../setup/test-helpers";

const ENDPOINT = "/api/admin/payments/export.csv";
const HEADER_ROW =
  "payment_id,amount_cents,payment_type,status,stripe_payment_intent_id,player_first_name,player_last_name,payer_email,payer_first_name,payer_last_name,season_name,program_name,registration_id,created_at";

describe("GET /api/admin/payments/export.csv", () => {
  let adminCookie: string;

  beforeAll(async () => {
    adminCookie = await getAdminCookie();
  });

  afterAll(() => {
    resetCookies();
  });

  it("returns 401 without admin auth", async () => {
    const res = await apiFetch(ENDPOINT, { method: "GET" });
    expect(res.status).toBe(401);
  });

  it("returns text/csv with the right headers when authed", async () => {
    const res = await apiFetch(ENDPOINT, {
      method: "GET",
      cookie: adminCookie,
    });
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toMatch(/^text\/csv/);
    expect(res.headers.get("content-disposition")).toMatch(
      /^attachment; filename="payments-\d{4}-\d{2}-\d{2}\.csv"$/,
    );
  });

  it("includes the canonical header row as the first line", async () => {
    const res = await apiFetch(ENDPOINT, {
      method: "GET",
      cookie: adminCookie,
    });
    const body = await res.text();
    const firstLine = body.split("\n")[0];
    expect(firstLine).toBe(HEADER_ROW);
  });

  it("honors filters (filtered set ≤ unfiltered set)", async () => {
    const allRes = await apiFetch(ENDPOINT, {
      method: "GET",
      cookie: adminCookie,
    });
    const refundsRes = await apiFetch(`${ENDPOINT}?paymentType=refund`, {
      method: "GET",
      cookie: adminCookie,
    });
    const all = await allRes.text();
    const refunds = await refundsRes.text();
    expect(refunds.trim().split("\n").length).toBeLessThanOrEqual(
      all.trim().split("\n").length,
    );
  });
});
