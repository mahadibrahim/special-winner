import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { getAdminCookie, apiFetch, expectJson, resetCookies } from "../setup/test-helpers";
import { getDb } from "@/lib/db";
import { opsPings, users } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

const SETTINGS = "/api/admin/organizations/settings";
const suffix = Math.random().toString(36).slice(2, 10);
const email = `ops-hook-${suffix}@test.example`;

describe("signup emits a user_signup ops ping (digest-only)", () => {
  let adminCookie: string;
  let originalOpsPings: unknown;

  beforeAll(async () => {
    adminCookie = await getAdminCookie();
    const res = await apiFetch(SETTINGS, { cookie: adminCookie });
    originalOpsPings = (await expectJson(res, 200)).settings?.opsPings ?? null;
    await apiFetch(SETTINGS, {
      method: "PATCH",
      cookie: adminCookie,
      body: JSON.stringify({ settings: { opsPings: { enabled: true } } }),
    });
  });

  afterAll(async () => {
    await apiFetch(SETTINGS, {
      method: "PATCH",
      cookie: adminCookie,
      body: JSON.stringify({ settings: { opsPings: originalOpsPings } }),
    });
    const db = getDb();
    await db.delete(users).where(eq(users.email, email));
    resetCookies();
  });

  it("records a user_signup row with channel suppressed (digest-only)", async () => {
    const res = await apiFetch("/api/auth/signup", {
      method: "POST",
      body: JSON.stringify({
        email,
        password: "TestSignup123!",
        firstName: "Ops",
        lastName: "Hook",
      }),
    });
    expect([200, 201]).toContain(res.status);

    // Fire-and-forget: give the async ping a beat to land.
    await new Promise((r) => setTimeout(r, 1500));

    const db = getDb();
    const [u] = await db.select({ id: users.id }).from(users).where(eq(users.email, email));
    const rows = await db.select().from(opsPings).where(eq(opsPings.eventId, u.id));
    expect(rows.length).toBe(1);
    expect(rows[0].kind).toBe("user_signup");
    expect(rows[0].channel).toBe("suppressed");
    expect(rows[0].message).toContain(email);
  });
});
