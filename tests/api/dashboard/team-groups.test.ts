import { describe, it, expect, beforeAll, afterAll } from "vitest"
import { getParentCookie, apiFetch, expectJson, resetCookies } from "../setup/test-helpers"

const VALID_FAKE_UUID = "00000000-0000-4000-8000-000000000001"

describe("Dashboard: team groups", () => {
  let parentCookie: string

  beforeAll(async () => { parentCookie = await getParentCookie() })
  afterAll(() => resetCookies())

  it("GET requires parent auth (401)", async () => {
    const res = await apiFetch("/api/dashboard/team-groups", { method: "GET" })
    expect(res.status).toBe(401)
  })

  it("GET returns an array (200)", async () => {
    const res = await apiFetch("/api/dashboard/team-groups", { method: "GET", cookie: parentCookie })
    const json = await expectJson(res, 200)
    expect(Array.isArray(json.teamGroups)).toBe(true)
  })

  it("POST leave requires auth (401)", async () => {
    const res = await apiFetch(`/api/dashboard/team-groups/${VALID_FAKE_UUID}/leave`, { method: "POST" })
    expect(res.status).toBe(401)
  })

  it("POST leave on nonexistent returns 404", async () => {
    const res = await apiFetch(`/api/dashboard/team-groups/${VALID_FAKE_UUID}/leave`, {
      method: "POST",
      cookie: parentCookie,
    })
    expect(res.status).toBe(404)
  })

  it("POST rejoin on nonexistent returns 404", async () => {
    const res = await apiFetch(`/api/dashboard/team-groups/${VALID_FAKE_UUID}/rejoin`, {
      method: "POST",
      cookie: parentCookie,
    })
    expect(res.status).toBe(404)
  })
})
