import { describe, it, expect, beforeAll, afterAll } from "vitest"
import { getParentCookie, apiFetch, expectJson, resetCookies } from "../setup/test-helpers"

describe("Dashboard: nudge dismiss", () => {
  let parentCookie: string
  beforeAll(async () => { parentCookie = await getParentCookie() })
  afterAll(() => resetCookies())

  it("requires auth (401)", async () => {
    const res = await apiFetch("/api/dashboard/nudge/dismiss", {
      method: "POST",
      body: JSON.stringify({ nudgeKey: "telegram_connect_banner" }),
    })
    expect(res.status).toBe(401)
  })

  it("returns 400 on invalid nudgeKey", async () => {
    const res = await apiFetch("/api/dashboard/nudge/dismiss", {
      method: "POST",
      cookie: parentCookie,
      body: JSON.stringify({ nudgeKey: "not_a_real_nudge" }),
    })
    expect(res.status).toBe(400)
  })

  it("records dismissal (200)", async () => {
    const res = await apiFetch("/api/dashboard/nudge/dismiss", {
      method: "POST",
      cookie: parentCookie,
      body: JSON.stringify({ nudgeKey: "telegram_connect_banner" }),
    })
    await expectJson(res, 200)
  })
})
