/**
 * Credential document endpoints — mirrors the careers resume plumbing
 * (upload: public/careers/apply.ts; download: applications/[id]/resume.ts).
 * The dev server runs with R2_MOCK=1, so putObject no-ops and GET redirects
 * to a deterministic mock URL.
 */
import { describe, it, expect, beforeAll } from "vitest";
import { asc, eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { coachCredentials, organizations, users } from "@/lib/db/schema";
import { userOrganizationAccess } from "@/lib/db/schema/organizations";
import { getAdminCookie, apiFetch } from "../setup/test-helpers";

const BASE = process.env.TEST_BASE_URL || "http://localhost:4321";

let adminCookie: string;
let orgAId: string;
let orgBId: string;
let orgACredentialId: string;
let orgBCredentialId: string;

async function createUserInOrg(orgId: string): Promise<string> {
  const db = getDb();
  const [user] = await db
    .insert(users)
    .values({
      email: `cred-doc-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`,
      firstName: "Doc",
      lastName: "Coach",
      emailVerified: false,
    })
    .returning();
  await db.insert(userOrganizationAccess).values({
    userId: user.id,
    organizationId: orgId,
    role: "staff",
    invitedAt: new Date(),
  });
  return user.id;
}

beforeAll(async () => {
  adminCookie = await getAdminCookie();
  const db = getDb();

  const [orgA] = await db
    .select({ id: organizations.id })
    .from(organizations)
    .where(eq(organizations.slug, "aspire-sports"))
    .orderBy(asc(organizations.createdAt))
    .limit(1);
  const [orgB] = await db
    .select({ id: organizations.id })
    .from(organizations)
    .where(eq(organizations.slug, "orgb"))
    .orderBy(asc(organizations.createdAt))
    .limit(1);
  orgAId = orgA.id;
  orgBId = orgB.id;

  const [credA] = await db
    .insert(coachCredentials)
    .values({
      userId: await createUserInOrg(orgAId),
      organizationId: orgAId,
      credentialType: "background_check",
      status: "pending",
    })
    .returning();
  orgACredentialId = credA.id;

  const [credB] = await db
    .insert(coachCredentials)
    .values({
      userId: await createUserInOrg(orgBId),
      organizationId: orgBId,
      credentialType: "background_check",
      status: "pending",
    })
    .returning();
  orgBCredentialId = credB.id;
});

function pdfForm(): FormData {
  const fd = new FormData();
  fd.append(
    "document",
    new File([new Uint8Array([0x25, 0x50, 0x44, 0x46])], "cert.pdf", {
      type: "application/pdf",
    }),
  );
  return fd;
}

describe("credential document endpoints", () => {
  it("POST unauthenticated → 401", async () => {
    const res = await fetch(
      `${BASE}/api/admin/coaches/credentials/${orgACredentialId}/document`,
      { method: "POST", body: pdfForm() },
    );
    expect(res.status).toBe(401);
  });

  it("POST attaches a PDF and stamps documentKey", async () => {
    const res = await fetch(
      `${BASE}/api/admin/coaches/credentials/${orgACredentialId}/document`,
      { method: "POST", body: pdfForm(), headers: { Cookie: adminCookie } },
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.documentKey).toMatch(/^compliance\/credentials\/.+\.pdf$/);

    const [row] = await getDb()
      .select()
      .from(coachCredentials)
      .where(eq(coachCredentials.id, orgACredentialId));
    expect(row.documentKey).toBe(body.documentKey);
  });

  it("POST rejects a non-PDF → 400", async () => {
    const fd = new FormData();
    fd.append(
      "document",
      new File([new Uint8Array([1, 2, 3])], "cert.exe", {
        type: "application/octet-stream",
      }),
    );
    const res = await fetch(
      `${BASE}/api/admin/coaches/credentials/${orgACredentialId}/document`,
      { method: "POST", body: fd, headers: { Cookie: adminCookie } },
    );
    expect(res.status).toBe(400);
  });

  it("GET 302-redirects to a signed (mock) URL", async () => {
    const res = await fetch(
      `${BASE}/api/admin/coaches/credentials/${orgACredentialId}/document`,
      { headers: { Cookie: adminCookie }, redirect: "manual" },
    );
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toContain("mock-r2.local");
  });

  it("cross-org credential id → 404 on both verbs", async () => {
    const post = await fetch(
      `${BASE}/api/admin/coaches/credentials/${orgBCredentialId}/document`,
      { method: "POST", body: pdfForm(), headers: { Cookie: adminCookie } },
    );
    expect(post.status).toBe(404);
    const get = await apiFetch(
      `/api/admin/coaches/credentials/${orgBCredentialId}/document`,
      { cookie: adminCookie, redirect: "manual" },
    );
    expect(get.status).toBe(404);
  });
});
