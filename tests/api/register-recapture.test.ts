import { describe, it, expect } from "vitest";
import { apiFetch, expectJson } from "./setup/test-helpers";

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
});
