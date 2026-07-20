import { describe, it, expect, beforeAll } from "vitest";
import { getAuthCookie, apiFetch } from "../setup/test-helpers";
import {
  resolveDefaultOrgForHttpTests,
} from "../../utils/dropin-helpers";
import { createTestUserWithPassword } from "../../utils/host-helpers";

let organizationId: string;

beforeAll(async () => {
  ({ organizationId } = await resolveDefaultOrgForHttpTests());
});

async function adminCookie() {
  return getAuthCookie("admin@test.aspiresports.com", "TestAdmin123!");
}

describe("POST /api/admin/hosts", () => {
  it("creates an active host profile for an existing user, 409s on duplicate", async () => {
    const cookie = await adminCookie();
    const candidate = await createTestUserWithPassword();

    const res = await apiFetch("/api/admin/hosts", {
      method: "POST",
      cookie,
      body: JSON.stringify({ userId: candidate.userId }),
    });
    expect(res.status).toBe(201);
    const { host } = await res.json();
    expect(host.status).toBe("active");
    expect(host.userId).toBe(candidate.userId);
    expect(host.organizationId).toBe(organizationId);

    // Duplicate: same user + org again → 409.
    const dup = await apiFetch("/api/admin/hosts", {
      method: "POST",
      cookie,
      body: JSON.stringify({ userId: candidate.userId }),
    });
    expect(dup.status).toBe(409);
  });

  it("400s on missing userId", async () => {
    const cookie = await adminCookie();
    const res = await apiFetch("/api/admin/hosts", {
      method: "POST",
      cookie,
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(400);
  });

  it("404s on a non-existent user id", async () => {
    const cookie = await adminCookie();
    const res = await apiFetch("/api/admin/hosts", {
      method: "POST",
      cookie,
      body: JSON.stringify({ userId: "00000000-0000-0000-0000-000000000000" }),
    });
    expect(res.status).toBe(404);
  });
});

describe("GET /api/admin/hosts — unhostedUpcoming", () => {
  it("carries a numeric unhostedUpcoming count", async () => {
    const cookie = await adminCookie();
    const res = await apiFetch("/api/admin/hosts", { cookie });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(typeof json.unhostedUpcoming).toBe("number");
    expect(Array.isArray(json.hosts)).toBe(true);
  });
});
