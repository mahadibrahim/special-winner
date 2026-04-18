import { describe, it, expect, beforeAll, afterAll } from "vitest"
import { getAdminCookie, apiFetch, expectJson, resetCookies } from "../setup/test-helpers"

describe("Admin: promote team group", () => {
  let adminCookie: string
  const VALID_FAKE_UUID = "00000000-0000-4000-8000-000000000001"

  beforeAll(async () => { adminCookie = await getAdminCookie() })
  afterAll(() => resetCookies())

  it("requires admin auth (401/403 without cookie)", async () => {
    const res = await apiFetch(`/api/admin/teams/${VALID_FAKE_UUID}/group/promote`, {
      method: "POST",
      body: JSON.stringify({ telegramChatId: "-1001234567890" }),
    })
    expect([401, 403]).toContain(res.status)
  })

  it("returns 400 when telegramChatId is missing", async () => {
    const res = await apiFetch(`/api/admin/teams/${VALID_FAKE_UUID}/group/promote`, {
      method: "POST",
      cookie: adminCookie,
      body: JSON.stringify({}),
    })
    expect(res.status).toBe(400)
  })

  it("returns 404 when no pending team group exists for that team", async () => {
    const res = await apiFetch(`/api/admin/teams/${VALID_FAKE_UUID}/group/promote`, {
      method: "POST",
      cookie: adminCookie,
      body: JSON.stringify({ telegramChatId: "-1001234567890" }),
    })
    expect(res.status).toBe(404)
  })
})
