import { describe, it, expect, beforeAll } from "vitest";
import { apiFetch } from "../setup/test-helpers";
import { getDb } from "@/lib/db";
import { newsletterSignups, organizations, emailLogs } from "@/lib/db/schema";
import { and, eq } from "drizzle-orm";

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

describe("POST /api/public/newsletter — capture incentive email", () => {
  const incentiveLogs = (email: string) =>
    getDb()
      .select()
      .from(emailLogs)
      .where(
        and(
          eq(emailLogs.emailType, "capture_incentive"),
          eq(emailLogs.recipientEmail, email),
        ),
      );

  it("logs exactly one capture_incentive email for home-incentive signups, deduped on resubmit", async () => {
    const email = `nl-incentive-${crypto.randomUUID()}@example.com`;
    const submit = () =>
      apiFetch("/api/public/newsletter", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, source: "home-incentive" }),
      });

    const res1 = await submit();
    expect(res1.status).toBe(200);

    const afterFirst = await incentiveLogs(email);
    expect(afterFirst).toHaveLength(1);
    // "sent" when RESEND_API_KEY is configured, "skipped" otherwise — both
    // mean the endpoint took the incentive path and the dedupe gate is set.
    // CI TRAP: if RESEND_API_KEY is ever added to CI secrets, this test will
    // attempt a real send to a bounce-bound @example.com address (reputation
    // cost) and a restricted key yields "failed" — gate the key out of the
    // test env or relax this assertion to the dedupe invariant before adding.
    expect(["sent", "skipped"]).toContain(afterFirst[0].status);

    const res2 = await submit();
    expect(res2.status).toBe(200);

    const afterSecond = await incentiveLogs(email);
    expect(afterSecond).toHaveLength(1);
  });

  it("does not send the incentive for non-incentive sources", async () => {
    const email = `nl-footer-${crypto.randomUUID()}@example.com`;
    const res = await apiFetch("/api/public/newsletter", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, source: "footer" }),
    });
    expect(res.status).toBe(200);

    expect(await incentiveLogs(email)).toHaveLength(0);
  });
});

describe("POST /api/public/newsletter — join page", () => {
  const incentiveLogs = (email: string) =>
    getDb()
      .select()
      .from(emailLogs)
      .where(
        and(
          eq(emailLogs.emailType, "capture_incentive"),
          eq(emailLogs.recipientEmail, email),
        ),
      );

  it("delivers the incentive for source=join-page", async () => {
    const email = `nl-join-${crypto.randomUUID()}@example.com`;
    const res = await apiFetch("/api/public/newsletter", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, source: "join-page", brand: "aspire" }),
    });
    expect(res.status).toBe(200);

    const logs = await incentiveLogs(email);
    expect(logs).toHaveLength(1);
    expect(["sent", "skipped"]).toContain(logs[0].status);
  });

  it("stores the flyer src tag in notes", async () => {
    const email = `nl-join-src-${crypto.randomUUID()}@example.com`;
    const res = await apiFetch("/api/public/newsletter", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email,
        source: "join-page",
        src: "fall25-powell",
      }),
    });
    expect(res.status).toBe(200);

    const [row] = await getDb()
      .select()
      .from(newsletterSignups)
      .where(eq(newsletterSignups.email, email))
      .limit(1);
    expect(row.notes).toBe("flyer:fall25-powell");
  });
});
