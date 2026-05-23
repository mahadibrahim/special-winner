import { describe, it, expect, beforeAll } from "vitest";
import { apiFetch } from "../setup/test-helpers";
import { getDb } from "@/lib/db";
import { newsletterSignups, organizations } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

describe("POST /api/public/newsletter — tenant attribution", () => {
  let orgAId: string;
  let orgBId: string;

  beforeAll(async () => {
    const [a] = await getDb()
      .select()
      .from(organizations)
      .where(eq(organizations.slug, "aspire-sports"))
      .limit(1);
    expect(a).toBeTruthy();
    orgAId = a.id;

    const [b] = await getDb()
      .select()
      .from(organizations)
      .where(eq(organizations.slug, "orgb"))
      .limit(1);
    expect(b).toBeTruthy();
    orgBId = b.id;
  });

  it("writes organization_id = Org A when submitted on default host", async () => {
    const email = `nl-a-${Date.now()}@example.com`;
    const res = await apiFetch("/api/public/newsletter", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, source: "test" }),
    });
    expect([200, 201]).toContain(res.status);

    const [row] = await getDb()
      .select()
      .from(newsletterSignups)
      .where(eq(newsletterSignups.email, email))
      .limit(1);

    expect(row).toBeTruthy();
    expect(row.organizationId).toBe(orgAId);
    expect(row.organizationId).not.toBe(orgBId);
  });
});
