import { describe, it, expect } from "vitest";
import { apiFetch, expectJson } from "./setup/test-helpers";
import { getDb } from "@/lib/db";
import { and, eq } from "drizzle-orm";
import { seasons, programs } from "@/lib/db/schema/programs";
import { sports } from "@/lib/db/schema/sports";
import { organizations } from "@/lib/db/schema/organizations";
import { phoneOptIns } from "@/lib/db/schema/phone-verifications";
import { normalizeUsPhone } from "@/lib/sms/send";

const ENDPOINT = "/api/public/register-recapture";

describe("POST /api/public/register-recapture", () => {
  it("rejects a missing/invalid email (400)", async () => {
    const res = await apiFetch(ENDPOINT, {
      method: "POST",
      body: JSON.stringify({
        seasonId: "00000000-0000-0000-0000-000000000000",
        email: "not-an-email",
      }),
    });
    expect(res.status).toBe(400);
  });

  it("404s for an unknown season", async () => {
    const res = await apiFetch(ENDPOINT, {
      method: "POST",
      body: JSON.stringify({
        seasonId: "00000000-0000-0000-0000-000000000000",
        email: "fan@example.com",
      }),
    });
    expect(res.status).toBe(404);
  });

  it("responds { sent: true } for a real season, and again on resubmit (dedupe-suppressed but never disclosed)", async () => {
    const list = await apiFetch("/api/public/seasons", { method: "GET" });
    const body = await expectJson(list, 200);
    const anySeason = body.seasons[0];
    if (!anySeason) return; // seed has no season fixture — skip, not fail

    const payload = JSON.stringify({
      seasonId: anySeason.id,
      email: "recapture-test@example.com",
    });

    const first = await apiFetch(ENDPOINT, { method: "POST", body: payload });
    const firstBody = await expectJson(first, 200);
    expect(firstBody).toEqual({ sent: true });

    const second = await apiFetch(ENDPOINT, { method: "POST", body: payload });
    const secondBody = await expectJson(second, 200);
    // Still { sent: true } even though email_logs dedupe suppressed the
    // actual resend — the response must never leak "we already emailed you".
    expect(secondBody).toEqual({ sent: true });
  });

  it("rejects a phone that doesn't normalize to 10 digits (400)", async () => {
    const res = await apiFetch(ENDPOINT, {
      method: "POST",
      body: JSON.stringify({
        seasonId: "00000000-0000-0000-0000-000000000000",
        phone: "12345",
      }),
    });
    expect(res.status).toBe(400);
  });

  it("404s for an unknown season on the phone path", async () => {
    const res = await apiFetch(ENDPOINT, {
      method: "POST",
      body: JSON.stringify({
        seasonId: "00000000-0000-0000-0000-000000000000",
        phone: "6145550100",
      }),
    });
    expect(res.status).toBe(404);
  });

  it("responds { sent: true } for a valid phone + real season (never discloses whether the number is known)", async () => {
    const list = await apiFetch("/api/public/seasons", { method: "GET" });
    const body = await expectJson(list, 200);
    const anySeason = body.seasons[0];
    if (!anySeason) return; // seed has no season fixture — skip, not fail

    const payload = JSON.stringify({
      seasonId: anySeason.id,
      phone: "(614) 555-0100",
    });

    const res = await apiFetch(ENDPOINT, { method: "POST", body: payload });
    const resBody = await expectJson(res, 200);
    expect(resBody).toEqual({ sent: true });
  });

  // Regression coverage for the STOP-suppression fix: register-recapture
  // sends its link SMS with bypassOptInCheck: true (see the module doc
  // comment — it's a single user-requested transactional text, the same
  // carve-out phone-otp.ts uses). Before the fix, sendSms's consent gate
  // ran the opted_out check ONLY when bypassOptInCheck was false, so this
  // endpoint (and every other bypassOptInCheck: true caller) could text a
  // number that had already replied STOP. STOP suppression must be
  // absolute regardless of the bypass flag.
  it("never sends to a number that has replied STOP, even via the bypass-gated recapture text", async () => {
    const list = await apiFetch("/api/public/seasons", { method: "GET" });
    const body = await expectJson(list, 200);
    const anySeason = body.seasons[0];
    if (!anySeason) return; // seed has no season fixture — skip, not fail

    const db = getDb();
    const [row] = await db
      .select({ organizationId: organizations.id })
      .from(seasons)
      .innerJoin(programs, eq(seasons.programId, programs.id))
      .innerJoin(sports, eq(programs.sportId, sports.id))
      .innerJoin(organizations, eq(organizations.id, sports.organizationId))
      .where(eq(seasons.id, anySeason.id))
      .limit(1);
    if (!row) return; // couldn't resolve the org chain for this season — skip, not fail

    // Unique per-run 10-digit number so the shared CI/staging DB never
    // collides on the (org, phone, channel) unique index across reruns.
    const suffix = `${Date.now()}`.slice(-7);
    const stopPhoneRaw = `619${suffix}`;
    const stopPhoneE164 = normalizeUsPhone(stopPhoneRaw)!;

    await db.insert(phoneOptIns).values({
      organizationId: row.organizationId,
      phone: stopPhoneE164,
      channel: "sms",
      status: "opted_out",
      optedInAt: new Date("2026-01-01T00:00:00Z"),
      optedOutAt: new Date("2026-01-02T00:00:00Z"),
      optInSource: "recapture_request",
      stopKeywordTriggered: "STOP",
    });

    const since = new Date(Date.now() - 5_000).toISOString();

    const res = await apiFetch(ENDPOINT, {
      method: "POST",
      body: JSON.stringify({ seasonId: anySeason.id, phone: stopPhoneRaw }),
    });
    // The response must never become an oracle for "did we actually text
    // this number" — {sent: true} regardless of the STOP suppression.
    const resBody = await expectJson(res, 200);
    expect(resBody).toEqual({ sent: true });

    // The STOP row itself must be untouched (still opted_out, not
    // resurrected or overwritten by the endpoint's evidence-only
    // recordPhoneOptIn(consented: false) write, which uses onConflictDoNothing).
    const [optInRow] = await db
      .select({ status: phoneOptIns.status })
      .from(phoneOptIns)
      .where(
        and(eq(phoneOptIns.phone, stopPhoneE164), eq(phoneOptIns.channel, "sms")),
      );
    expect(optInRow?.status).toBe("opted_out");

    // And no SMS must have actually been dispatched to the number.
    const mockRes = await apiFetch(
      `/api/test/messaging-mock?to=${encodeURIComponent(stopPhoneE164)}&channel=sms&since=${encodeURIComponent(since)}`,
    );
    if (mockRes.status !== 200) return; // test endpoints not enabled — skip strict assertion
    const mockBody = (await mockRes.json()) as {
      enabled: boolean;
      messages: Array<{ to: string; body: string }>;
    };
    if (!mockBody.enabled) {
      console.warn(
        "[register-recapture] MESSAGING_MOCK not enabled — skipping strict no-send assertion",
      );
      return;
    }
    expect(
      mockBody.messages.length,
      "a STOPped number must never receive the recapture SMS, bypassOptInCheck notwithstanding",
    ).toBe(0);
  });
});
