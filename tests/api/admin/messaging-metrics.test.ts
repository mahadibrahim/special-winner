import { describe, it, expect, beforeAll, afterAll } from "vitest"
import { getAdminCookie, apiFetch, expectJson, resetCookies } from "../setup/test-helpers"

describe("Admin: messaging metrics", () => {
  let adminCookie: string
  beforeAll(async () => { adminCookie = await getAdminCookie() })
  afterAll(() => resetCookies())

  it("requires admin (401/403)", async () => {
    const res = await apiFetch("/api/admin/metrics/messaging", { method: "GET" })
    expect([401, 403]).toContain(res.status)
  })

  it("returns link rate + group join rate (200)", async () => {
    const res = await apiFetch("/api/admin/metrics/messaging", {
      method: "GET",
      cookie: adminCookie,
    })
    const json = await expectJson(res, 200)
    expect(typeof json.telegramLinkRate).toBe("number")
    expect(typeof json.groupJoinRate).toBe("number")
    expect(typeof json.totalParents).toBe("number")
    expect(typeof json.linkedParents).toBe("number")
    expect(typeof json.invitedMembers).toBe("number")
    expect(typeof json.joinedMembers).toBe("number")
    // Rates should be between 0 and 1 inclusive
    expect(json.telegramLinkRate).toBeGreaterThanOrEqual(0)
    expect(json.telegramLinkRate).toBeLessThanOrEqual(1)
    expect(json.groupJoinRate).toBeGreaterThanOrEqual(0)
    expect(json.groupJoinRate).toBeLessThanOrEqual(1)
  })
})
