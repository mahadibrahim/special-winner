/**
 * Hire handoff: application → coach account.
 *
 * Uses the real public apply endpoint to create fixture applications
 * (Turnstile fails open in dev/CI — same contract as careers/apply.test.ts)
 * and asserts side effects directly in the DB (established pattern there).
 */
import { describe, it, expect, beforeAll } from "vitest";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import {
  jobApplications,
  magicLinks,
  roles,
  userRoles,
  users,
} from "@/lib/db/schema";
import { userOrganizationAccess } from "@/lib/db/schema/organizations";
import {
  getAdminCookie,
  getParentCookie,
  apiFetch,
  expectJson,
} from "../setup/test-helpers";

const BASE = process.env.TEST_BASE_URL || "http://localhost:4321";

function applicationForm(email: string): FormData {
  const fd = new FormData();
  fd.append("role", "coach");
  fd.append("firstName", "Hire");
  fd.append("lastName", "Candidate");
  fd.append("email", email);
  fd.append("experience", "Five seasons coaching U8 soccer.");
  fd.append("availability", "weeknights");
  fd.append("certifications", "SafeSport (2025), CPR");
  return fd;
}

async function createApplication(email: string): Promise<string> {
  const res = await fetch(`${BASE}/api/public/careers/apply`, {
    method: "POST",
    body: applicationForm(email),
  });
  expect(res.status).toBe(200);
  const body = await res.json();
  const [row] = await getDb()
    .select()
    .from(jobApplications)
    .where(eq(jobApplications.id, body.id));
  // The hire endpoint pins the application to the caller's org — localhost
  // must resolve the HQ org for the fixture to be hireable.
  expect(row.organizationId).not.toBeNull();
  return body.id as string;
}

describe("POST /api/admin/applications/[id]/hire", () => {
  let adminCookie: string;

  beforeAll(async () => {
    adminCookie = await getAdminCookie();
  });

  it("401 unauthenticated", async () => {
    const res = await apiFetch(
      "/api/admin/applications/00000000-0000-0000-0000-000000000001/hire",
      { method: "POST" },
    );
    expect(res.status).toBe(401);
  });

  it("403 for a parent (no admin role)", async () => {
    const parentCookie = await getParentCookie();
    const res = await apiFetch(
      "/api/admin/applications/00000000-0000-0000-0000-000000000001/hire",
      { method: "POST", cookie: parentCookie },
    );
    expect(res.status).toBe(403);
  });

  it("404 for an unknown application id", async () => {
    const res = await apiFetch(
      "/api/admin/applications/00000000-0000-0000-0000-000000000099/hire",
      { method: "POST", cookie: adminCookie },
    );
    expect(res.status).toBe(404);
  });

  it("creates the user, org-scoped coach role, invite link, and stamps the application", async () => {
    const email = `hire-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`;
    const applicationId = await createApplication(email);

    const res = await apiFetch(
      `/api/admin/applications/${applicationId}/hire`,
      { method: "POST", cookie: adminCookie },
    );
    const json = await expectJson(res, 200);
    expect(json.hired).toBe(true);
    expect(json.createdNewUser).toBe(true);
    expect(json.userId).toBeTruthy();

    const db = getDb();

    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.id, json.userId));
    expect(user.email).toBe(email);
    expect(user.firstName).toBe("Hire");
    expect(user.passwordHash).toBeTruthy(); // unusable random password

    const [app] = await db
      .select()
      .from(jobApplications)
      .where(eq(jobApplications.id, applicationId));
    expect(app.status).toBe("hired");
    expect(app.hiredUserId).toBe(json.userId);

    const [coachRole] = await db
      .select()
      .from(roles)
      .where(eq(roles.name, "coach"));
    const roleRows = await db
      .select()
      .from(userRoles)
      .where(
        and(
          eq(userRoles.userId, json.userId),
          eq(userRoles.roleId, coachRole.id),
          eq(userRoles.scopeType, "organization"),
          eq(userRoles.scopeId, app.organizationId!),
        ),
      );
    expect(roleRows).toHaveLength(1);

    const accessRows = await db
      .select()
      .from(userOrganizationAccess)
      .where(
        and(
          eq(userOrganizationAccess.userId, json.userId),
          eq(userOrganizationAccess.organizationId, app.organizationId!),
        ),
      );
    expect(accessRows).toHaveLength(1);

    // The invite magic link is minted before the (CI-skipped) email send —
    // proxy assertion for "applicant receives a working invite".
    const linkRows = await db
      .select()
      .from(magicLinks)
      .where(
        and(
          eq(magicLinks.userId, json.userId),
          eq(magicLinks.purpose, "login"),
        ),
      );
    expect(linkRows.length).toBeGreaterThanOrEqual(1);
    expect(
      (linkRows[0].purposeContext as { redirectTo?: string })?.redirectTo,
    ).toBe("/coach");
  });

  it("second hire on the same application → 409", async () => {
    const email = `hire-dup-${Date.now()}@example.com`;
    const applicationId = await createApplication(email);
    await expectJson(
      await apiFetch(`/api/admin/applications/${applicationId}/hire`, {
        method: "POST",
        cookie: adminCookie,
      }),
      200,
    );
    const res = await apiFetch(
      `/api/admin/applications/${applicationId}/hire`,
      { method: "POST", cookie: adminCookie },
    );
    expect(res.status).toBe(409);
  });

  it("links an existing user by email instead of duplicating (idempotent role)", async () => {
    const email = `hire-link-${Date.now()}@example.com`;
    const first = await createApplication(email);
    const res1 = await expectJson(
      await apiFetch(`/api/admin/applications/${first}/hire`, {
        method: "POST",
        cookie: adminCookie,
      }),
      200,
    );
    const second = await createApplication(email);
    const res2 = await expectJson(
      await apiFetch(`/api/admin/applications/${second}/hire`, {
        method: "POST",
        cookie: adminCookie,
      }),
      200,
    );
    expect(res2.userId).toBe(res1.userId);
    expect(res2.createdNewUser).toBe(false);

    // Coach role not duplicated
    const db = getDb();
    const [coachRole] = await db
      .select()
      .from(roles)
      .where(eq(roles.name, "coach"));
    const roleRows = await db
      .select()
      .from(userRoles)
      .where(
        and(
          eq(userRoles.userId, res1.userId),
          eq(userRoles.roleId, coachRole.id),
        ),
      );
    expect(roleRows).toHaveLength(1);
  });
});
