/**
 * Admin R2 presign for digital merch assets (Merch Phase 3e, Task 4.1).
 *
 * Covers: auth gate (unauth -> 401), an unsupported content type -> 400,
 * and a valid request -> either an { uploadUrl, key } pair or a 503 when R2
 * isn't configured on the dev server. Tolerating [200, 503] on the happy
 * path mirrors tests/api/merch/digital-download.test.ts and
 * tests/api/careers/host-apply.test.ts — a dev server run without
 * R2_MOCK=1/real R2 creds is an environment gap, not a regression in this
 * endpoint's own auth/validation logic (covered by the other cases here).
 */
import { describe, it, expect } from "vitest";
import { apiFetch, getAdminCookie } from "../setup/test-helpers";

const BASE = process.env.TEST_BASE_URL ?? "http://localhost:4321";

describe("/api/admin/merch/digital-asset-url — auth gate", () => {
  it("POST unauth → 401", async () => {
    const res = await fetch(`${BASE}/api/admin/merch/digital-asset-url`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ filename: "guide.pdf", contentType: "application/pdf" }),
    });
    expect(res.status).toBe(401);
  });
});

describe("/api/admin/merch/digital-asset-url — validation", () => {
  it("rejects a missing body → 400", async () => {
    const adminCookie = await getAdminCookie();
    const res = await apiFetch("/api/admin/merch/digital-asset-url", {
      method: "POST",
      cookie: adminCookie,
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(400);
  });

  it("rejects an unsupported content type → 400", async () => {
    const adminCookie = await getAdminCookie();
    const res = await apiFetch("/api/admin/merch/digital-asset-url", {
      method: "POST",
      cookie: adminCookie,
      body: JSON.stringify({ filename: "malware.exe", contentType: "application/x-msdownload" }),
    });
    expect(res.status).toBe(400);
  });
});

describe("/api/admin/merch/digital-asset-url — presign", () => {
  it("returns an uploadUrl + key scoped under merch-digital/, or 503 without R2 configured", async () => {
    const adminCookie = await getAdminCookie();
    const res = await apiFetch("/api/admin/merch/digital-asset-url", {
      method: "POST",
      cookie: adminCookie,
      body: JSON.stringify({ filename: "../../etc/passwd.pdf", contentType: "application/pdf" }),
    });

    expect([200, 503]).toContain(res.status);
    const json = await res.json();
    if (res.status === 200) {
      expect(typeof json.uploadUrl).toBe("string");
      expect(typeof json.key).toBe("string");
      expect(json.key.startsWith("merch-digital/")).toBe(true);
      // path separators from the filename must be stripped, not preserved
      expect(json.key).not.toContain("../");
      expect(json.key.endsWith("passwd.pdf")).toBe(true);
    } else {
      expect(json.code).toBe("storage_unavailable");
      console.warn(
        "digital-asset-url presign test: R2 appears unconfigured on dev server (no R2_MOCK / creds)",
      );
    }
  });
});
