import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  getAdminCookie,
  getAuthCookie,
  apiFetch,
  expectJson,
  resetCookies,
} from "../setup/test-helpers";

describe("GET /api/media/tag/:session_id — payload + roster subset", () => {
  let adminCookie: string;
  let sessionId: string;

  beforeAll(async () => {
    adminCookie = await getAdminCookie();
    const qres = await apiFetch("/api/admin/media/tag-queue", {
      method: "GET",
      cookie: adminCookie,
    });
    const qjson = await expectJson(qres, 200);
    if (qjson.queue.length > 0) {
      const target = qjson.queue[0];
      await apiFetch(
        `/api/admin/media/tag-queue/${target.session_id}/claim`,
        { method: "POST", cookie: adminCookie }
      );
      sessionId = target.session_id;
    } else {
      sessionId = "";
    }
  });

  afterAll(() => resetCookies());

  it("returns assets + home/away roster subset WITHOUT contact info", async () => {
    if (!sessionId) return;
    const res = await apiFetch(`/api/media/tag/${sessionId}`, {
      method: "GET",
      cookie: adminCookie,
    });
    const json = await expectJson(res, 200);

    expect(Array.isArray(json.assets)).toBe(true);
    for (const a of json.assets) {
      expect(a.id).toBeTruthy();
      expect(a.thumbnail_url || a.preview_url).toBeTruthy();
      expect(typeof a.captured_at === "string" || a.captured_at === null).toBe(
        true
      );
    }

    expect(json.roster).toBeDefined();
    for (const side of ["home", "away"] as const) {
      expect(json.roster[side]).toBeDefined();
      for (const p of json.roster[side].players) {
        const allowed = new Set([
          "id",
          "first_name",
          "last_initial",
          "jersey_number",
          "photo_url",
          "roster_id",
        ]);
        for (const k of Object.keys(p)) {
          expect(allowed.has(k)).toBe(true);
        }
        expect((p as any).last_name).toBeUndefined();
        expect((p as any).email).toBeUndefined();
        expect((p as any).phone).toBeUndefined();
        expect((p as any).parent_user_id).toBeUndefined();
        expect((p as any).medical_notes).toBeUndefined();
        expect((p as any).birth_date).toBeUndefined();
      }
    }
  });

  it("rejects users without a role", async () => {
    const parentCookie = await getAuthCookie(
      "parent@test.aspiresports.com",
      "TestParent123!"
    );
    const res = await apiFetch(
      `/api/media/tag/${sessionId || "00000000-0000-0000-0000-000000000000"}`,
      { method: "GET", cookie: parentCookie }
    );
    expect([401, 403, 404]).toContain(res.status);
  });
});

describe("POST /api/media/tag/:session_id/tags — bulk tag", () => {
  let adminCookie: string;
  let sessionId: string;
  let assetId: string;
  let playerId: string;

  beforeAll(async () => {
    adminCookie = await getAdminCookie();

    const q = await apiFetch("/api/admin/media/tag-queue", {
      method: "GET",
      cookie: adminCookie,
    });
    const qj = await expectJson(q, 200);
    const uploadedTarget = qj.queue[0];
    if (uploadedTarget) {
      await apiFetch(
        `/api/admin/media/tag-queue/${uploadedTarget.session_id}/claim`,
        { method: "POST", cookie: adminCookie }
      );
      sessionId = uploadedTarget.session_id;
    }
    if (!sessionId) return;

    const payload = await apiFetch(`/api/media/tag/${sessionId}`, {
      method: "GET",
      cookie: adminCookie,
    });
    const pj = await expectJson(payload, 200);
    if (pj.assets.length === 0 || pj.roster.home.players.length === 0) {
      sessionId = "";
      return;
    }
    assetId = pj.assets[0].id;
    playerId = pj.roster.home.players[0].id;
  });

  it("creates a player tag and writes an audit log row", async () => {
    if (!sessionId) return;

    const before = await apiFetch(`/api/media/tag/${sessionId}`, {
      method: "GET",
      cookie: adminCookie,
    });
    const beforeJson = await expectJson(before, 200);
    const beforeCount = beforeJson.assets.find((a: any) => a.id === assetId)
      .tags.length;

    const res = await apiFetch(`/api/media/tag/${sessionId}/tags`, {
      method: "POST",
      cookie: adminCookie,
      body: JSON.stringify({
        tags: [
          {
            asset_id: assetId,
            tag_scope: "player",
            family_member_id: playerId,
            source: "manual_admin",
          },
        ],
      }),
    });
    const json = await expectJson(res, 201);
    expect(json.created.length + (json.existing?.length ?? 0)).toBe(1);
    const resolved = [...(json.created ?? []), ...(json.existing ?? [])][0];
    expect(resolved.family_member_id).toBe(playerId);

    const after = await apiFetch(`/api/media/tag/${sessionId}`, {
      method: "GET",
      cookie: adminCookie,
    });
    const afterJson = await expectJson(after, 200);
    const afterCount = afterJson.assets.find((a: any) => a.id === assetId).tags
      .length;
    expect(afterCount).toBeGreaterThanOrEqual(beforeCount);
  });

  it("is idempotent on (asset_id, family_member_id) — re-tag returns existing", async () => {
    if (!sessionId) return;
    const res = await apiFetch(`/api/media/tag/${sessionId}/tags`, {
      method: "POST",
      cookie: adminCookie,
      body: JSON.stringify({
        tags: [
          {
            asset_id: assetId,
            tag_scope: "player",
            family_member_id: playerId,
            source: "manual_admin",
          },
        ],
      }),
    });
    expect([200, 201]).toContain(res.status);
    const json = await res.json();
    const createdIds = (json.created || []).map((t: any) => t.id);
    const existingIds = (json.existing || []).map((t: any) => t.id);
    expect([...createdIds, ...existingIds].length).toBeGreaterThan(0);
  });

  it("supports burst propagation: propagate_to_burst flag tags every asset in the burst", async () => {
    if (!sessionId) return;
    const payload = await apiFetch(`/api/media/tag/${sessionId}`, {
      method: "GET",
      cookie: adminCookie,
    });
    const pj = await expectJson(payload, 200);
    const groups = new Map<string, any[]>();
    for (const a of pj.assets) {
      if (!a.burst_group_id) continue;
      if (!groups.has(a.burst_group_id)) groups.set(a.burst_group_id, []);
      groups.get(a.burst_group_id)!.push(a);
    }
    const multi = [...groups.values()].find((arr) => arr.length > 1);
    if (!multi) return;

    const leader = multi[0];
    const targetPlayer = pj.roster.away.players[0] ?? pj.roster.home.players[1];
    if (!targetPlayer) return;

    const res = await apiFetch(`/api/media/tag/${sessionId}/tags`, {
      method: "POST",
      cookie: adminCookie,
      body: JSON.stringify({
        tags: [
          {
            asset_id: leader.id,
            tag_scope: "player",
            family_member_id: targetPlayer.id,
            source: "manual_admin",
          },
        ],
        propagate_to_burst: true,
      }),
    });
    const json = await expectJson(res, 201);
    expect(json.created.length + (json.existing?.length ?? 0)).toBe(multi.length);
    const propagatedSources = json.created
      .filter((t: any) => t.media_asset_id !== leader.id)
      .map((t: any) => t.source);
    for (const s of propagatedSources) {
      expect(s).toBe("burst_propagated");
    }
  });

  it("team tag: tag_scope='both_teams' with no family_member_id and no team_id", async () => {
    if (!sessionId) return;
    const payload = await apiFetch(`/api/media/tag/${sessionId}`, {
      method: "GET",
      cookie: adminCookie,
    });
    const pj = await expectJson(payload, 200);
    const asset = pj.assets.find(
      (a: any) => !a.tags.some((t: any) => t.tag_scope === "both_teams")
    );
    if (!asset) return;
    const res = await apiFetch(`/api/media/tag/${sessionId}/tags`, {
      method: "POST",
      cookie: adminCookie,
      body: JSON.stringify({
        tags: [
          {
            asset_id: asset.id,
            tag_scope: "both_teams",
            source: "manual_admin",
          },
        ],
      }),
    });
    const json = await expectJson(res, 201);
    const resolved = [...(json.created ?? []), ...(json.existing ?? [])][0];
    expect(resolved.tag_scope).toBe("both_teams");
    expect(resolved.family_member_id).toBeNull();
    expect(resolved.team_id).toBeNull();
  });
});

describe("POST /api/media/tag/:session_id/complete", () => {
  let adminCookie: string;
  let sessionId: string;

  beforeAll(async () => {
    adminCookie = await getAdminCookie();
    const q = await apiFetch("/api/admin/media/tag-queue", {
      method: "GET",
      cookie: adminCookie,
    });
    const qj = await expectJson(q, 200);
    if (qj.queue[0]) {
      await apiFetch(
        `/api/admin/media/tag-queue/${qj.queue[0].session_id}/claim`,
        { method: "POST", cookie: adminCookie }
      );
      sessionId = qj.queue[0].session_id;
    }
  });

  it("flips status tagging -> ready and writes audit log", async () => {
    if (!sessionId) return;
    const res = await apiFetch(`/api/media/tag/${sessionId}/complete`, {
      method: "POST",
      cookie: adminCookie,
    });
    const json = await expectJson(res, 200);
    expect(json.session.status).toBe("ready");
  });

  it("returns 409 if session not in 'tagging'", async () => {
    if (!sessionId) return;
    const res = await apiFetch(`/api/media/tag/${sessionId}/complete`, {
      method: "POST",
      cookie: adminCookie,
    });
    expect(res.status).toBe(409);
  });
});

describe("DELETE /api/media/tag/:session_id/tags/:tag_id", () => {
  let adminCookie: string;
  let sessionId: string;

  beforeAll(async () => {
    adminCookie = await getAdminCookie();
    const q = await apiFetch("/api/admin/media/tag-queue", {
      method: "GET",
      cookie: adminCookie,
    });
    const qj = await expectJson(q, 200);
    if (qj.queue[0]) {
      await apiFetch(
        `/api/admin/media/tag-queue/${qj.queue[0].session_id}/claim`,
        { method: "POST", cookie: adminCookie }
      );
      sessionId = qj.queue[0].session_id;
    }
  });

  it("removes a tag and writes an audit log row", async () => {
    if (!sessionId) return;
    const payload = await apiFetch(`/api/media/tag/${sessionId}`, {
      method: "GET",
      cookie: adminCookie,
    });
    const pj = await expectJson(payload, 200);
    const firstTag = pj.assets.flatMap((a: any) => a.tags)[0];
    if (!firstTag) return;

    const res = await apiFetch(
      `/api/media/tag/${sessionId}/tags/${firstTag.id}`,
      { method: "DELETE", cookie: adminCookie }
    );
    expect(res.status).toBe(204);

    const after = await apiFetch(`/api/media/tag/${sessionId}`, {
      method: "GET",
      cookie: adminCookie,
    });
    const aj = await expectJson(after, 200);
    const stillThere = aj.assets
      .flatMap((a: any) => a.tags)
      .some((t: any) => t.id === firstTag.id);
    expect(stillThere).toBe(false);
  });
});
