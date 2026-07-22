import { describe, it, expect } from "vitest"
import { apiFetch, expectJson } from "../setup/test-helpers"

const ENDPOINT = "/api/cron/send-waiver-reminders"

describe("Cron: send waiver reminders", () => {
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

  it("authenticated POST returns per-window summary with all eleven windows", async () => {
    const secret = process.env.CRON_SECRET ?? ""
    const res = await apiFetch(ENDPOINT, {
      method: "POST",
      headers: { "x-cron-secret": secret },
    })
    const json = await expectJson(res, 200)

    expect(json.success).toBe(true)
    expect(typeof json.totalSent).toBe("number")
    expect(typeof json.totalSkipped).toBe("number")
    expect(typeof json.totalErrored).toBe("number")
    expect(typeof json.elapsedMs).toBe("number")

    expect(Array.isArray(json.windows)).toBe(true)
    expect(json.windows).toHaveLength(11)
    const types = json.windows.map((w: { type: string }) => w.type).sort()
    expect(types).toEqual(
      ["1", "2", "final", "w1", "w2", "w3", "w4", "w5", "w6", "w7", "w8"].sort(),
    )
    for (const w of json.windows) {
      expect(typeof w.sent).toBe("number")
      expect(typeof w.skipped).toBe("number")
      expect(typeof w.errored).toBe("number")
      expect(typeof w.reminderNumber).toBe("number")
    }
  })

  it("second authenticated run is idempotent — sent counts do not double", async () => {
    const secret = process.env.CRON_SECRET ?? ""
    // First run captures any in-window registrations.
    const first = await apiFetch(ENDPOINT, {
      method: "POST",
      headers: { "x-cron-secret": secret },
    })
    const firstJson = await expectJson(first, 200)

    // Second run immediately after should send 0 (email_logs gate trips).
    const second = await apiFetch(ENDPOINT, {
      method: "POST",
      headers: { "x-cron-secret": secret },
    })
    const secondJson = await expectJson(second, 200)

    expect(secondJson.totalSent).toBe(0)
    // First-run total may be 0 too (no fixtures in window) — the contract is
    // that the second never exceeds the first, and is 0 when nothing
    // remains. We don't assert the first count.
    expect(firstJson.totalSent).toBeGreaterThanOrEqual(0)
  })

  it("GET returns description + window definitions without sending", async () => {
    const res = await apiFetch(ENDPOINT, { method: "GET" })
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(typeof json.description).toBe("string")
    expect(Array.isArray(json.windows)).toBe(true)
    expect(json.windows).toHaveLength(11)
  })
})
