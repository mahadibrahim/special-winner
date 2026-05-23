import { describe, it, expect, beforeAll } from "vitest";
import { apiFetch } from "../setup/test-helpers";
import { getDb } from "@/lib/db";
import { corporateInquiries } from "@/lib/db/schema";
import { eq, desc } from "drizzle-orm";

describe("POST /api/public/corporate-inquiry — tenant attribution", () => {
  let orgAId: string;
  let orgBId: string;

  beforeAll(async () => {
    const aRes = await apiFetch("/api/test/org-fixtures?slug=aspire-sports");
    expect(aRes.status).toBe(200);
    const a = await aRes.json();
    expect(a.org?.id).toBeTruthy();
    orgAId = a.org.id;

    const bRes = await apiFetch("/api/test/org-fixtures?slug=orgb");
    expect(bRes.status).toBe(200);
    const b = await bRes.json();
    expect(b.org?.id).toBeTruthy();
    orgBId = b.org.id;
  });

  it("writes organization_id matching the resolved Org A when posted on the default host", async () => {
    const email = `corp-a-${Date.now()}@example.com`;
    const res = await apiFetch("/api/public/corporate-inquiry", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        companyName: `Test Co A ${Date.now()}`,
        contactName: "Test Person",
        contactEmail: email,
      }),
    });
    expect([200, 201]).toContain(res.status);

    const [row] = await getDb()
      .select()
      .from(corporateInquiries)
      .where(eq(corporateInquiries.contactEmail, email))
      .orderBy(desc(corporateInquiries.createdAt))
      .limit(1);

    expect(row).toBeTruthy();
    expect(row.organizationId).toBe(orgAId);
    // Sanity: not the other org
    expect(row.organizationId).not.toBe(orgBId);
  });
});
