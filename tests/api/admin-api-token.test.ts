/**
 * Scoped admin API tokens (x-admin-token) — the admin MCP's auth layer.
 *
 * Verifies the whole boundary without mutating shared staging data:
 *   - read scope works on wired GETs; bad/revoked/no token → 401
 *   - wrong scope → 403
 *   - write scope is accepted on wired mutations but the requests used here
 *     stop at validation (400) or ownership (404) — nothing is created
 *   - session-only endpoints (DELETE) ignore the token entirely → 401
 *
 * Tokens are inserted directly for the default org (oldest createdAt — the
 * same fallback the domain resolver uses for localhost) and deleted in
 * afterAll.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { randomBytes, randomUUID } from "node:crypto";
import { asc, inArray } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { adminApiTokens } from "@/lib/db/schema";
import { organizations } from "@/lib/db/schema/organizations";
import { users } from "@/lib/db/schema/users";
import { hashAdminApiToken } from "@/lib/auth/admin-api-token";
import { apiFetch } from "./setup/test-helpers";

let readWriteToken: string;
let opsOnlyToken: string;
let revokedToken: string;
const tokenIds: string[] = [];

function rawToken() {
  return `aspire_admin_${randomBytes(32).toString("base64url")}`;
}

beforeAll(async () => {
  const db = getDb();
  const [org] = await db
    .select({ id: organizations.id })
    .from(organizations)
    .orderBy(asc(organizations.createdAt))
    .limit(1);
  const [user] = await db.select({ id: users.id }).from(users).orderBy(asc(users.createdAt)).limit(1);
  if (!org || !user) throw new Error("No org/user in test DB");

  readWriteToken = rawToken();
  opsOnlyToken = rawToken();
  revokedToken = rawToken();

  const rows = await db
    .insert(adminApiTokens)
    .values([
      {
        organizationId: org.id,
        name: "api-test read-write",
        tokenHash: hashAdminApiToken(readWriteToken),
        scopes: ["catalog:read", "catalog:write"],
        createdByUserId: user.id,
      },
      {
        organizationId: org.id,
        name: "api-test ops-only",
        tokenHash: hashAdminApiToken(opsOnlyToken),
        scopes: ["ops:read"],
        createdByUserId: user.id,
      },
      {
        organizationId: org.id,
        name: "api-test revoked",
        tokenHash: hashAdminApiToken(revokedToken),
        scopes: ["catalog:read"],
        createdByUserId: user.id,
        revokedAt: new Date(),
      },
    ])
    .returning({ id: adminApiTokens.id });
  tokenIds.push(...rows.map((r) => r.id));
});

afterAll(async () => {
  if (tokenIds.length) {
    await getDb().delete(adminApiTokens).where(inArray(adminApiTokens.id, tokenIds));
  }
});

describe("x-admin-token on wired reads", () => {
  it("catalog:read token lists seasons", async () => {
    const res = await apiFetch("/api/admin/seasons", {
      headers: { "x-admin-token": readWriteToken },
    });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(Array.isArray(json.seasons)).toBe(true);
  });

  it("also works on programs/locations/sports GETs", async () => {
    for (const path of ["/api/admin/programs", "/api/admin/locations", "/api/admin/sports"]) {
      const res = await apiFetch(path, { headers: { "x-admin-token": readWriteToken } });
      expect(res.status, path).toBe(200);
    }
  });

  it("no token and no session → 401", async () => {
    const res = await apiFetch("/api/admin/seasons");
    expect(res.status).toBe(401);
  });

  it("garbage token → 401", async () => {
    const res = await apiFetch("/api/admin/seasons", {
      headers: { "x-admin-token": "aspire_admin_not-a-real-token" },
    });
    expect(res.status).toBe(401);
  });

  it("revoked token → 401", async () => {
    const res = await apiFetch("/api/admin/seasons", {
      headers: { "x-admin-token": revokedToken },
    });
    expect(res.status).toBe(401);
  });

  it("wrong scope (ops:read on a catalog read) → 403", async () => {
    const res = await apiFetch("/api/admin/seasons", {
      headers: { "x-admin-token": opsOnlyToken },
    });
    expect(res.status).toBe(403);
  });
});

describe("x-admin-token on wired mutations (no data touched)", () => {
  it("wrong scope on offerings POST → 403", async () => {
    const res = await apiFetch("/api/admin/offerings", {
      method: "POST",
      headers: { "x-admin-token": opsOnlyToken, "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(403);
  });

  it("write token is accepted on offerings POST; invalid payload stops at 400", async () => {
    const res = await apiFetch("/api/admin/offerings", {
      method: "POST",
      headers: { "x-admin-token": readWriteToken, "Content-Type": "application/json" },
      body: JSON.stringify({ nonsense: true }),
    });
    expect(res.status).toBe(400);
  });

  it("write token on seasons PUT stops at ownership for a foreign id (404)", async () => {
    const res = await apiFetch("/api/admin/seasons", {
      method: "PUT",
      headers: { "x-admin-token": readWriteToken, "Content-Type": "application/json" },
      body: JSON.stringify({ id: randomUUID(), name: "x" }),
    });
    expect(res.status).toBe(404);
  });
});

describe("session-only endpoints ignore tokens", () => {
  it("seasons DELETE with a valid write token → 401 (not wired, by design)", async () => {
    const res = await apiFetch(`/api/admin/seasons?id=${randomUUID()}`, {
      method: "DELETE",
      headers: { "x-admin-token": readWriteToken },
    });
    expect(res.status).toBe(401);
  });

  it("programs DELETE with a valid write token → 401 (not wired, by design)", async () => {
    const res = await apiFetch(`/api/admin/programs?id=${randomUUID()}`, {
      method: "DELETE",
      headers: { "x-admin-token": readWriteToken },
    });
    expect(res.status).toBe(401);
  });
});
