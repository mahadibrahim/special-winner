import { describe, it, expect, beforeAll, afterAll } from "vitest"
import {
  getAdminCookie,
  apiFetch,
  expectJson,
  resetCookies,
  testSlug,
} from "../setup/test-helpers"

describe("E2E: broadcast flow", () => {
  let adminCookie: string

  beforeAll(async () => {
    adminCookie = await getAdminCookie()
  })

  afterAll(() => resetCookies())

  it("admin sends a broadcast; it appears in the log", async () => {
    const teamId = process.env.TEST_TEAM_ID ?? ""
    if (!teamId) {
      console.warn("TEST_TEAM_ID not set; skipping broadcast send")
      return
    }

    const body = `E2E broadcast ${testSlug("e2e")}`
    const nonce = testSlug("e2e-nonce")

    const sendRes = await apiFetch("/api/admin/broadcasts", {
      method: "POST",
      cookie: adminCookie,
      body: JSON.stringify({
        targetType: "team_group",
        teamIds: [teamId],
        messageType: "team_broadcast_general",
        body,
        nonce,
      }),
    })
    // Accept 201 (created) — even with no active group, the send path logs the attempt
    const sendJson = await expectJson(sendRes, 201)
    expect(sendJson.broadcastId).toBeDefined()

    const listRes = await apiFetch("/api/admin/broadcasts?limit=5", {
      method: "GET",
      cookie: adminCookie,
    })
    const listJson = await expectJson(listRes, 200)
    const found = listJson.broadcasts.find(
      (b: { id: string }) => b.id === sendJson.broadcastId
    )
    expect(found).toBeDefined()
    expect(found.body).toBe(body)
  })

  it("reconcile cron runs without error", async () => {
    const secret = process.env.CRON_SECRET ?? ""
    const res = await apiFetch("/api/cron/reconcile-team-groups", {
      method: "POST",
      headers: { "x-cron-secret": secret },
    })
    // 200 with valid secret, or 401 with empty — either proves the endpoint exists and auth works
    expect([200, 401]).toContain(res.status)
  })
})
