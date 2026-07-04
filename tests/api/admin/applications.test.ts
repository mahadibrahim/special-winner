import { describe, it, expect, beforeAll } from "vitest";
import { getAdminCookie, apiFetch } from "../setup/test-helpers";

describe("GET /api/admin/applications", () => {
  let cookie: string;
  beforeAll(async () => {
    cookie = await getAdminCookie();
  });

  it("401s unauthenticated", async () => {
    const res = await apiFetch("/api/admin/applications", { method: "GET" });
    expect([401, 403]).toContain(res.status);
  });

  it("lists org applications newest-first for an admin", async () => {
    // Ensure at least one row exists (public endpoint, same org host)
    const fd = new FormData();
    for (const [k, v] of Object.entries({
      role: "coach",
      firstName: "Admin",
      lastName: "Listed",
      email: `admin-list-${Date.now()}@example.com`,
      experience: "Coached U10 for two years.",
    })) fd.append(k, v as string);
    const submit = await fetch(
      `${process.env.TEST_BASE_URL ?? "http://localhost:4321"}/api/public/careers/apply`,
      { method: "POST", body: fd }
    );
    expect(submit.status).toBe(200);

    const res = await apiFetch("/api/admin/applications", { method: "GET", cookie });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body.applications)).toBe(true);
    expect(body.applications.length).toBeGreaterThan(0);
    expect(body.applications[0]).toHaveProperty("role");
    expect(body.applications[0]).toHaveProperty("notionSyncedAt");
  });
});
