import { describe, it, expect } from "vitest"
import { apiFetch, expectJson } from "../setup/test-helpers"

const ENDPOINT = "/api/cron/poll-lulu-jobs"

describe("Cron: poll Lulu print jobs", () => {
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

  it("authenticated POST returns job-poll counts", async () => {
    const secret = process.env.CRON_SECRET ?? ""
    const res = await apiFetch(ENDPOINT, {
      method: "POST",
      headers: { "x-cron-secret": secret },
    })
    const json = await expectJson(res, 200)

    expect(typeof json.checked).toBe("number")
    expect(typeof json.shipped).toBe("number")
    expect(typeof json.failed).toBe("number")
    expect(typeof json.elapsedMs).toBe("number")
  })

  it("GET returns description without polling", async () => {
    const res = await apiFetch(ENDPOINT, { method: "GET" })
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(typeof json.description).toBe("string")
    expect(typeof json.usage).toBe("string")
  })
})
