import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  getAdminCookie,
  apiFetch,
  resetCookies,
} from "../setup/test-helpers";

const ENDPOINT = "/api/admin/registrations/export.csv";
const HEADER_ROW =
  "registration_id,status,payment_status,amount_paid_cents,amount_due_cents,player_first_name,player_last_name,parent_email,parent_first_name,parent_last_name,season_name,program_name,sport_name,waiver_signed,created_at,cancelled_at,team_name,team_fee_cents,team_deposit_cents";

describe("GET /api/admin/registrations/export.csv", () => {
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
      /^attachment; filename="registrations-\d{4}-\d{2}-\d{2}\.csv"$/,
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

  it("returns at least one data row when seed registrations exist", async () => {
    const res = await apiFetch(ENDPOINT, {
      method: "GET",
      cookie: adminCookie,
    });
    const body = await res.text();
    const lines = body.trim().split("\n");
    // header + ≥1 data row in the seeded admin org
    expect(lines.length).toBeGreaterThan(1);
  });

  it("honors the status=cancelled filter (matches ≤ unfiltered set)", async () => {
    const allRes = await apiFetch(ENDPOINT, {
      method: "GET",
      cookie: adminCookie,
    });
    const cancelledRes = await apiFetch(`${ENDPOINT}?status=cancelled`, {
      method: "GET",
      cookie: adminCookie,
    });
    const all = await allRes.text();
    const cancelled = await cancelledRes.text();
    expect(cancelled.trim().split("\n").length).toBeLessThanOrEqual(
      all.trim().split("\n").length,
    );
  });
});
