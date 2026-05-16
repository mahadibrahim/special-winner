import { describe, it, expect } from "vitest"
import { apiFetch, expectJson } from "../setup/test-helpers"

const ENDPOINT = "/api/cron/expire-unverified-users"

describe("Cron: expire unverified users", () => {
  it("rejects request without cron secret (401)", async () => {
    const res = await apiFetch(ENDPOINT, { method: "POST" })
    expect(res.status).toBe(401)
  })

  it("rejects request with wrong cron secret (401)", async () => {
    const res = await apiFetch(ENDPOINT, {
      method: "POST",
      headers: { "x-cron-secret": "definitely-wrong-secret" },
    })
    expect(res.status).toBe(401)
  })

  it("runs the sweep and returns a deleted count", async () => {
    const secret = process.env.CRON_SECRET ?? ""
    const res = await apiFetch(ENDPOINT, {
      method: "POST",
      headers: { "x-cron-secret": secret },
    })
    const json = await expectJson(res, 200)
    expect(typeof json.deleted).toBe("number")
    expect(json.deleted).toBeGreaterThanOrEqual(0)
    expect(typeof json.elapsedMs).toBe("number")
  })

  it("GET returns description without triggering the job", async () => {
    const res = await apiFetch(ENDPOINT, { method: "GET" })
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(typeof json.description).toBe("string")
  })
})
