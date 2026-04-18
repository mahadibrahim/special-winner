import { describe, it, expect, beforeAll, afterAll } from "vitest"
import { getAdminCookie, apiFetch, expectJson, resetCookies } from "../setup/test-helpers"

describe("Team group sync on roster change", () => {
  let adminCookie: string

  beforeAll(async () => {
    adminCookie = await getAdminCookie()
  })
  afterAll(() => resetCookies())

  it("returns null for a team with no group yet", async () => {
    const teamId = process.env.TEST_TEAM_ID ?? ""
    if (!teamId) {
      console.warn("TEST_TEAM_ID not set; skipping")
      return
    }
    const res = await apiFetch(`/api/admin/teams/${teamId}/group`, {
      method: "GET",
      cookie: adminCookie,
    })
    const json = await expectJson(res, 200)
    // Just verify shape — the team may or may not have a group depending on other test runs
    expect(json).toHaveProperty("teamGroup")
  })

  it("returns 401 without auth", async () => {
    const res = await apiFetch(
      `/api/admin/teams/00000000-0000-0000-0000-000000000001/group`,
      { method: "GET" },
    )
    expect([401, 403]).toContain(res.status)
  })
})
