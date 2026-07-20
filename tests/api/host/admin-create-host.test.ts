import { describe, it, expect, beforeAll } from "vitest";
import { getDb } from "@/lib/db";
import { ensureCustomerOrgMembership } from "@/lib/organization/ensure-membership";
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
    // Org membership is a precondition — POST /api/admin/hosts 404s a user
    // with no user_organization_access row in this org (see the dedicated
    // test below). Grant it the same way the app itself does.
    await ensureCustomerOrgMembership(getDb(), candidate.userId, organizationId);

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

  it("404s a real platform user with no org-access row in the caller's org (tenant-safe)", async () => {
    const cookie = await adminCookie();
    // createTestUserWithPassword makes a bare users row with no
    // user_organization_access grant anywhere — exactly the "exists on the
    // platform but not visible to this org" case the check must reject.
    const outsider = await createTestUserWithPassword();

    const res = await apiFetch("/api/admin/hosts", {
      method: "POST",
      cookie,
      body: JSON.stringify({ userId: outsider.userId }),
    });
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe("User not found");
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
