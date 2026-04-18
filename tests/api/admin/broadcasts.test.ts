import { describe, it, expect, beforeAll, afterAll } from "vitest"
import {
  getAdminCookie,
  getCoachCookie,
  apiFetch,
  expectJson,
  resetCookies,
} from "../setup/test-helpers"

const ENDPOINT = "/api/admin/broadcasts"

describe("Admin Broadcasts API", () => {
  let adminCookie: string
  let coachCookie: string

  beforeAll(async () => {
    adminCookie = await getAdminCookie()
    coachCookie = await getCoachCookie()
  })

  afterAll(() => resetCookies())

  // Valid v4-style UUID for payloads that need to pass zod validation without
  // being a real team (auth/403 checks don't care if the team exists).
  const VALID_FAKE_UUID = "00000000-0000-4000-8000-000000000001"

  it("requires authentication (401 with valid payload but no cookie)", async () => {
    const res = await apiFetch(ENDPOINT, {
      method: "POST",
      body: JSON.stringify({
        targetType: "team_group",
        teamIds: [VALID_FAKE_UUID],
        messageType: "team_broadcast_general",
        body: "test",
      }),
    })
    // Endpoint validates body first (by design — needs targetType to pick auth path),
    // then falls through to coach auth which returns 401 when no cookie present.
    expect(res.status).toBe(401)
  })

  it("rejects coach for multi-team target (403)", async () => {
    const res = await apiFetch(ENDPOINT, {
      method: "POST",
      cookie: coachCookie,
      body: JSON.stringify({
        targetType: "multi_team",
        teamIds: [VALID_FAKE_UUID],
        messageType: "team_broadcast_general",
        body: "test",
      }),
    })
    expect(res.status).toBe(403)
  })

  it("returns 400 on invalid payload (missing body field)", async () => {
    const res = await apiFetch(ENDPOINT, {
      method: "POST",
      cookie: adminCookie,
      body: JSON.stringify({
        targetType: "team_group",
        teamIds: [VALID_FAKE_UUID],
        messageType: "team_broadcast_general",
        // body is missing
      }),
    })
    expect(res.status).toBe(400)
  })

  it("lists sent broadcasts via GET", async () => {
    const res = await apiFetch(ENDPOINT, { method: "GET", cookie: adminCookie })
    const json = await expectJson(res, 200)
    expect(Array.isArray(json.broadcasts)).toBe(true)
  })

  it("GET respects limit query param", async () => {
    const res = await apiFetch(`${ENDPOINT}?limit=5`, {
      method: "GET",
      cookie: adminCookie,
    })
    const json = await expectJson(res, 200)
    expect(Array.isArray(json.broadcasts)).toBe(true)
    expect(json.broadcasts.length).toBeLessThanOrEqual(5)
  })

  it("GET requires authentication (401 without cookie)", async () => {
    const res = await apiFetch(ENDPOINT, { method: "GET" })
    expect(res.status).toBe(401)
  })
})
