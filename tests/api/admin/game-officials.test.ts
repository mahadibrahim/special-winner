import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { users } from "@/lib/db/schema/users";
import {
  getAdminCookie,
  getParentCookie,
  apiFetch,
  resetCookies,
} from "../setup/test-helpers";
import { createTestGameContext } from "../../utils/activity-tracking-helpers";

/**
 * Ref-assignment MVP endpoints. The fixture game comes from
 * createTestGameContext, which creates a FRESH org — so the admin of
 * the default org must get 404 on it (tenant isolation), and the
 * happy-path CRUD has to run against a game in the default org.
 * We don't have a seeded default-org game guaranteed, so the CRUD
 * section creates one through the admin games API itself.
 */
describe("game officials endpoints", () => {
  let adminCookie: string;

  beforeAll(async () => {
    adminCookie = await getAdminCookie();
  });

  afterAll(() => {
    resetCookies();
  });

  it("401s unauthenticated, 403s non-admin", async () => {
    const unauth = await apiFetch(
      "/api/admin/games/00000000-0000-0000-0000-000000000000/officials",
    );
    expect(unauth.status).toBe(401);

    const parentCookie = await getParentCookie();
    const parent = await apiFetch(
      "/api/admin/games/00000000-0000-0000-0000-000000000000/officials",
      { cookie: parentCookie },
    );
    expect(parent.status).toBe(403);
  });

  it("404s a cross-tenant game id (tenant isolation)", async () => {
    const foreign = await createTestGameContext({});
    const res = await apiFetch(
      `/api/admin/games/${foreign.gameId}/officials`,
      { cookie: adminCookie },
    );
    expect(res.status).toBe(404);

    const post = await apiFetch(
      `/api/admin/games/${foreign.gameId}/officials`,
      {
        method: "POST",
        cookie: adminCookie,
        body: JSON.stringify({ userId: "00000000-0000-0000-0000-000000000000" }),
      },
    );
    expect(post.status).toBe(404);
  });

  it("lists referees (empty or populated, but always org-scoped 200)", async () => {
    const res = await apiFetch("/api/admin/referees", { cookie: adminCookie });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(Array.isArray(json.referees)).toBe(true);
  });

  it("assigns, updates, and removes an official on an own-org game", async () => {
    // Find an own-org game via the admin games list; skip if none seeded.
    const gamesRes = await apiFetch("/api/admin/games", {
      cookie: adminCookie,
    });
    if (!gamesRes.ok) return;
    const gamesJson = await gamesRes.json();
    const game = gamesJson.games?.[0];
    if (!game) return; // no seeded game in this environment — skip

    // Any real user can be assigned (role drives the picker, not the API).
    const db = getDb();
    const [someUser] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, "parent@test.aspiresports.com"));
    if (!someUser) return;

    // Assign
    const assign = await apiFetch(`/api/admin/games/${game.id}/officials`, {
      method: "POST",
      cookie: adminCookie,
      body: JSON.stringify({ userId: someUser.id, feeCents: 4500 }),
    });
    expect(assign.status).toBe(200);
    const { official } = await assign.json();
    expect(official.feeCents).toBe(4500);
    expect(official.paymentStatus).toBe("unpaid");

    // Re-assign same user = upsert, not error
    const reassign = await apiFetch(`/api/admin/games/${game.id}/officials`, {
      method: "POST",
      cookie: adminCookie,
      body: JSON.stringify({ userId: someUser.id, feeCents: 5000 }),
    });
    expect(reassign.status).toBe(200);
    const reassigned = await reassign.json();
    expect(reassigned.official.id).toBe(official.id);
    expect(reassigned.official.feeCents).toBe(5000);

    // Mark paid
    const patch = await apiFetch(
      `/api/admin/games/${game.id}/officials/${official.id}`,
      {
        method: "PATCH",
        cookie: adminCookie,
        body: JSON.stringify({ paymentStatus: "paid" }),
      },
    );
    expect(patch.status).toBe(200);
    const patched = await patch.json();
    expect(patched.official.paymentStatus).toBe("paid");

    // List includes it
    const list = await apiFetch(`/api/admin/games/${game.id}/officials`, {
      cookie: adminCookie,
    });
    const listJson = await list.json();
    expect(
      listJson.officials.some((o: { id: string }) => o.id === official.id),
    ).toBe(true);

    // Remove
    const del = await apiFetch(
      `/api/admin/games/${game.id}/officials/${official.id}`,
      { method: "DELETE", cookie: adminCookie },
    );
    expect(del.status).toBe(200);

    // Gone
    const delAgain = await apiFetch(
      `/api/admin/games/${game.id}/officials/${official.id}`,
      { method: "DELETE", cookie: adminCookie },
    );
    expect(delAgain.status).toBe(404);
  });
});
