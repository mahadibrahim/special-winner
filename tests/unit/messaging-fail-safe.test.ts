/**
 * The transport default is a safety property, not a preference.
 *
 * Real sending used to be the default and MESSAGING_MOCK=1 the opt-out. CI was
 * the only environment that remembered to opt out — so every local test run
 * really emailed the owner (the careers endpoint notifies a hardcoded real
 * inbox on each application, and the fixtures are literally named "Api
 * Applicant" / "Playwright Applicant"), and the staging Netlify site drove the
 * production crons against a seeded database, sending ~750/day to RFC-reserved
 * undeliverable domains like @test.example — guaranteed hard bounces against
 * the real sending domain.
 *
 * These tests pin the inverted default so nobody can quietly flip it back.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { isMessagingLive, isMessagingMockEnabled } from "@/lib/messaging/mock";

const ENV_KEYS = ["MESSAGING_LIVE", "MESSAGING_MOCK", "PUBLIC_APP_URL"] as const;

describe("messaging transport is fail-safe", () => {
  let saved: Record<string, string | undefined>;

  beforeEach(() => {
    saved = Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]]));
    for (const k of ENV_KEYS) delete process.env[k];
  });

  afterEach(() => {
    for (const k of ENV_KEYS) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k]!;
    }
  });

  it("mocks by default — an environment that configures nothing cannot send", () => {
    expect(isMessagingLive()).toBe(false);
    expect(isMessagingMockEnabled()).toBe(true);
  });

  it("sends for real ONLY when MESSAGING_LIVE=yes", () => {
    process.env.MESSAGING_LIVE = "yes";
    expect(isMessagingLive()).toBe(true);
    expect(isMessagingMockEnabled()).toBe(false);
  });

  it("does not treat a truthy-looking value as consent", () => {
    // "1"/"true" are the shapes someone reaches for from muscle memory. Only
    // the exact opt-in counts — a half-set flag must fail safe, not fail open.
    for (const v of ["1", "true", "YES", "y", ""]) {
      process.env.MESSAGING_LIVE = v;
      expect(isMessagingLive(), `MESSAGING_LIVE=${JSON.stringify(v)}`).toBe(false);
      expect(isMessagingMockEnabled()).toBe(true);
    }
  });

  it("still honours the explicit MESSAGING_MOCK=1 opt-out (ci.yml sets it)", () => {
    process.env.MESSAGING_LIVE = "yes";
    process.env.MESSAGING_MOCK = "1";
    expect(isMessagingMockEnabled()).toBe(true);
  });

  it("a local test run cannot send, even with the real Resend key injected", () => {
    // scripts/with-bws.sh injects the production RESEND_API_KEY into local runs.
    // That is exactly the configuration that was mailing the owner on every
    // `npm run test:api`. With no MESSAGING_LIVE, the key must be inert.
    process.env.RESEND_API_KEY = "re_a_real_looking_key";
    expect(isMessagingMockEnabled()).toBe(true);
    delete process.env.RESEND_API_KEY;
  });
});
