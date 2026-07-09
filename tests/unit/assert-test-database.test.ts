import { describe, it, expect } from "vitest";
import { assertTestDatabase } from "../utils/assert-test-database";

/**
 * Regression guard for the 2026-07-08 incident: API-test fixture helpers
 * (registration-context.ts et al.) do raw INSERTs against whatever
 * DATABASE_URL the process holds. A local run with a prod DATABASE_URL
 * override wrote random test orgs/locations ("Loc g00dqku7") into prod,
 * which then rendered + got indexed by Google. This guard must refuse a
 * prod-looking DB while still allowing CI (localhost container) and local
 * dev (staging).
 */
describe("assertTestDatabase", () => {
  const PROD = "postgresql://user:pw@abc123.proxy.rlwy.net:41234/railway";
  const STAGING = "postgresql://user:pw@staging-db.proxy.rlwy.net:5432/railway";
  const CI_LOCAL = "postgresql://postgres:postgres@localhost:5432/aspire_ci";

  it("throws when DATABASE_URL looks like production (no staging, not local, no override)", () => {
    expect(() =>
      assertTestDatabase({ databaseUrl: PROD, allowE2eSeed: undefined }),
    ).toThrow(/REFUSED/i);
  });

  it("allows CI's localhost container database", () => {
    expect(() =>
      assertTestDatabase({ databaseUrl: CI_LOCAL, allowE2eSeed: undefined }),
    ).not.toThrow();
  });

  it("allows a staging database", () => {
    expect(() =>
      assertTestDatabase({ databaseUrl: STAGING, allowE2eSeed: undefined }),
    ).not.toThrow();
  });

  it("allows a prod-looking URL only when ALLOW_E2E_SEED=yes is explicitly set", () => {
    expect(() =>
      assertTestDatabase({ databaseUrl: PROD, allowE2eSeed: "yes" }),
    ).not.toThrow();
  });

  it("does not leak the full connection string in the error message", () => {
    let msg = "";
    try {
      assertTestDatabase({ databaseUrl: PROD, allowE2eSeed: undefined });
    } catch (e) {
      msg = e instanceof Error ? e.message : String(e);
    }
    expect(msg).not.toContain("pw@");
  });
});
