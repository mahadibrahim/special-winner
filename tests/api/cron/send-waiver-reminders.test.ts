import { describe, it, expect } from "vitest"
import { and, eq } from "drizzle-orm"
import { apiFetch, expectJson } from "../setup/test-helpers"
import { getDb } from "@/lib/db"
import { consents, emailLogs, registrations } from "@/lib/db/schema"
import {
  WAIVER_ON_FILE_ATTRIBUTION,
  WAIVER_VALID_DAYS,
} from "@/lib/consents/liability"
import { seedWaiverReminderCandidate } from "../../utils/registration-context"

const ENDPOINT = "/api/cron/send-waiver-reminders"
const DAY_MS = 24 * 60 * 60 * 1000

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

  // ANNUAL WAIVER. Rows created after the change are born stamped
  // `waiverSigned: true` when the participant is covered, so they never reach
  // `baseEligibility` at all (asserted in registrations-annual-waiver.test.ts).
  // These two cover the TRANSITION population the born-stamp cannot reach:
  // registrations that already existed, or whose family signed at another door
  // afterwards. Both seed their own org/season/registration graph because the
  // cron sweeps the whole database.
  describe("participants already covered by an annual waiver", () => {
    it("is skipped and stamped on-file instead of emailed", async () => {
      const db = getDb()
      const seeded = await seedWaiverReminderCandidate()

      // The signature lives on the PERSON at this org, not on this
      // registration — exactly the case the row-level flag cannot see.
      const signedAt = new Date(Date.now() - 30 * DAY_MS)
      await db.insert(consents).values({
        familyMemberId: seeded.familyMemberId,
        organizationId: seeded.organizationId,
        type: "liability",
        status: "granted",
        signedByUserId: seeded.userId,
        signedByName: "Wanda Waiver",
        signedAt,
        expiresAt: new Date(signedAt.getTime() + WAIVER_VALID_DAYS * DAY_MS),
      })

      const res = await apiFetch(ENDPOINT, {
        method: "POST",
        headers: { "x-cron-secret": process.env.CRON_SECRET ?? "" },
      })
      await expectJson(res, 200)

      const [row] = await db
        .select({
          waiverSigned: registrations.waiverSigned,
          waiverSignedBy: registrations.waiverSignedBy,
          waiverSignedAt: registrations.waiverSignedAt,
        })
        .from(registrations)
        .where(eq(registrations.id, seeded.registrationId))
      expect(row.waiverSigned).toBe(true)
      expect(row.waiverSignedBy).toBe(WAIVER_ON_FILE_ATTRIBUTION)
      // Derived copy, not a signature — dating it would let the cron renew
      // the very window it just read.
      expect(row.waiverSignedAt).toBeNull()

      const logs = await db
        .select({ id: emailLogs.id })
        .from(emailLogs)
        .where(eq(emailLogs.registrationId, seeded.registrationId))
      expect(logs, "a covered family must not be chased").toHaveLength(0)
    })

    it("still chases a participant whose only signature has expired", async () => {
      const db = getDb()
      const seeded = await seedWaiverReminderCandidate()

      const signedAt = new Date(Date.now() - (WAIVER_VALID_DAYS + 10) * DAY_MS)
      await db.insert(consents).values({
        familyMemberId: seeded.familyMemberId,
        organizationId: seeded.organizationId,
        type: "liability",
        status: "granted",
        signedByUserId: seeded.userId,
        signedByName: "Wanda Waiver",
        signedAt,
        expiresAt: new Date(signedAt.getTime() + WAIVER_VALID_DAYS * DAY_MS),
      })

      const res = await apiFetch(ENDPOINT, {
        method: "POST",
        headers: { "x-cron-secret": process.env.CRON_SECRET ?? "" },
      })
      await expectJson(res, 200)

      const [row] = await db
        .select({ waiverSigned: registrations.waiverSigned })
        .from(registrations)
        .where(eq(registrations.id, seeded.registrationId))
      expect(row.waiverSigned).toBe(false)

      const logs = await db
        .select({ id: emailLogs.id })
        .from(emailLogs)
        .where(
          and(
            eq(emailLogs.registrationId, seeded.registrationId),
            eq(emailLogs.emailType, "waiver_reminder_1"),
          ),
        )
      expect(logs.length, "an expired waiver is still owed").toBeGreaterThan(0)
    })
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
