import { describe, it, expect } from "vitest";
import { hashAdminApiToken, validateAdminTokenRow } from "@/lib/auth/admin-api-token";

const NOW = new Date("2026-08-02T12:00:00Z");
const ORG = "11111111-1111-1111-1111-111111111111";

const base = {
  scopes: ["catalog:read", "catalog:write"],
  expiresAt: null,
  revokedAt: null,
  organizationId: ORG,
};

describe("hashAdminApiToken", () => {
  it("is a deterministic 64-char sha256 hex", () => {
    const h = hashAdminApiToken("aspire_admin_abc");
    expect(h).toMatch(/^[0-9a-f]{64}$/);
    expect(hashAdminApiToken("aspire_admin_abc")).toBe(h);
    expect(hashAdminApiToken("aspire_admin_abd")).not.toBe(h);
  });
});

describe("validateAdminTokenRow", () => {
  it("accepts a live, in-scope, org-matched token", () => {
    expect(validateAdminTokenRow(base, "catalog:read", ORG, NOW)).toBeNull();
    expect(validateAdminTokenRow(base, "catalog:write", ORG, NOW)).toBeNull();
  });

  it("rejects revoked tokens first", () => {
    expect(
      validateAdminTokenRow({ ...base, revokedAt: new Date("2026-01-01") }, "catalog:read", ORG, NOW),
    ).toBe("revoked");
  });

  it("rejects expired tokens (boundary: expiry == now is expired)", () => {
    expect(
      validateAdminTokenRow({ ...base, expiresAt: new Date("2026-08-01") }, "catalog:read", ORG, NOW),
    ).toBe("expired");
    expect(validateAdminTokenRow({ ...base, expiresAt: NOW }, "catalog:read", ORG, NOW)).toBe("expired");
    expect(
      validateAdminTokenRow({ ...base, expiresAt: new Date("2026-09-01") }, "catalog:read", ORG, NOW),
    ).toBeNull();
  });

  it("rejects out-of-scope requests", () => {
    expect(validateAdminTokenRow({ ...base, scopes: ["ops:read"] }, "catalog:read", ORG, NOW)).toBe(
      "missing_scope",
    );
  });

  it("rejects org mismatch and missing resolved org", () => {
    expect(validateAdminTokenRow(base, "catalog:read", "22222222-2222-2222-2222-222222222222", NOW)).toBe(
      "org_mismatch",
    );
    expect(validateAdminTokenRow(base, "catalog:read", null, NOW)).toBe("org_mismatch");
    expect(validateAdminTokenRow(base, "catalog:read", undefined, NOW)).toBe("org_mismatch");
  });
});
