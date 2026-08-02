/**
 * /api/admin/api-tokens — the UI mint/list/revoke endpoint.
 *
 * Lifecycle: create via admin session → minted token WORKS on a wired
 * endpoint → list shows it (never the hash) → revoke → token stops working.
 * Boundary: unauthenticated 401; a valid MACHINE token cannot list or mint
 * (session-only endpoint — tokens must not mint tokens).
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { inArray } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { adminApiTokens } from "@/lib/db/schema";
import { apiFetch, getAdminCookie } from "./setup/test-helpers";

let cookie: string;
const createdIds: string[] = [];

beforeAll(async () => {
  cookie = await getAdminCookie();
});

afterAll(async () => {
  if (createdIds.length) {
    await getDb().delete(adminApiTokens).where(inArray(adminApiTokens.id, createdIds));
  }
});

describe("token lifecycle via the UI endpoint", () => {
  let raw: string;
  let id: string;

  it("creates a token and returns the raw value exactly once", async () => {
    const res = await apiFetch("/api/admin/api-tokens", {
      method: "POST",
      headers: { cookie, "Content-Type": "application/json" },
      body: JSON.stringify({ name: "ui-test token", scopes: ["catalog:read"], expiresDays: 1 }),
    });
    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.token).toMatch(/^aspire_admin_/);
    expect(json.row.id).toBeTruthy();
    raw = json.token;
    id = json.row.id;
    createdIds.push(id);
  });

  it("the minted token works on a wired endpoint", async () => {
    const res = await apiFetch("/api/admin/seasons", { headers: { "x-admin-token": raw } });
    expect(res.status).toBe(200);
  });

  it("list shows the token without any hash material", async () => {
    const res = await apiFetch("/api/admin/api-tokens", { headers: { cookie } });
    expect(res.status).toBe(200);
    const { tokens } = await res.json();
    const mine = tokens.find((t: { id: string }) => t.id === id);
    expect(mine).toBeTruthy();
    expect(mine.name).toBe("ui-test token");
    expect(mine.revokedAt).toBeNull();
    expect(JSON.stringify(mine)).not.toContain("Hash");
    expect(JSON.stringify(tokens)).not.toContain(raw.slice(-20));
  });

  it("revoke stops the token immediately", async () => {
    const res = await apiFetch("/api/admin/api-tokens", {
      method: "PATCH",
      headers: { cookie, "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    expect(res.status).toBe(200);

    const after = await apiFetch("/api/admin/seasons", { headers: { "x-admin-token": raw } });
    expect(after.status).toBe(401);
  });

  it("rejects invalid scopes and empty names", async () => {
    for (const body of [
      { name: "x", scopes: ["payments:write"] },
      { name: "", scopes: ["catalog:read"] },
      { name: "x", scopes: [] },
    ]) {
      const res = await apiFetch("/api/admin/api-tokens", {
        method: "POST",
        headers: { cookie, "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      expect(res.status, JSON.stringify(body)).toBe(400);
    }
  });
});

describe("boundaries", () => {
  it("unauthenticated → 401", async () => {
    const res = await apiFetch("/api/admin/api-tokens");
    expect(res.status).toBe(401);
  });

  it("a machine token cannot list or mint tokens (session-only endpoint)", async () => {
    const create = await apiFetch("/api/admin/api-tokens", {
      method: "POST",
      headers: { cookie, "Content-Type": "application/json" },
      body: JSON.stringify({ name: "ui-test escalation probe", scopes: ["catalog:read", "catalog:write"] }),
    });
    expect(create.status).toBe(201);
    const json = await create.json();
    createdIds.push(json.row.id);

    const list = await apiFetch("/api/admin/api-tokens", {
      headers: { "x-admin-token": json.token },
    });
    expect(list.status).toBe(401);

    const mint = await apiFetch("/api/admin/api-tokens", {
      method: "POST",
      headers: { "x-admin-token": json.token, "Content-Type": "application/json" },
      body: JSON.stringify({ name: "escalated", scopes: ["catalog:write"] }),
    });
    expect(mint.status).toBe(401);
  });
});
