import { describe, it, expect, beforeAll } from "vitest";
import { getAuthCookie, apiFetch } from "./setup/test-helpers";
import { getDb } from "@/lib/db";
import { seasons } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { CLOSED_SEASON_SLUG } from "@/lib/db/seeds/seed-e2e-tests";

const BASE = process.env.TEST_BASE_URL ?? "http://localhost:4321";

// "Live until" enforcement (2026-07-04): a season whose status is still
// `open` but whose start day has passed (with no registration_closes set)
// must be invisible in the catalog and must reject registrations — the
// Founders'-Tournament shape.
let closedSeasonId: string;
let adultCookie: string;

beforeAll(async () => {
  const db = getDb();
  const [season] = await db
    .select({ id: seasons.id })
    .from(seasons)
    .where(eq(seasons.slug, CLOSED_SEASON_SLUG))
    .limit(1);
  if (!season) {
    throw new Error(
      `Closed-window season not found (slug: ${CLOSED_SEASON_SLUG}) — re-run npm run db:seed:e2e`,
    );
  }
  closedSeasonId = season.id;

  adultCookie = await getAuthCookie(
    "adult-self@test.aspiresports.com",
    "TestParent123!",
  );
});

describe("live-until enforcement — closed-window season", () => {
  it("public catalog does not list it", async () => {
    const res = await fetch(`${BASE}/api/public/seasons`);
    expect(res.status).toBe(200);
    const body = await res.json();
    const ids = (body.seasons ?? []).map((s: { id: string }) => s.id);
    expect(ids).not.toContain(closedSeasonId);
  });

  it("season detail reports registrationClosed: true", async () => {
    const res = await fetch(`${BASE}/api/public/seasons/${closedSeasonId}`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.season.registrationClosed).toBe(true);
  });

  it("POST /api/registrations rejects with a closed message", async () => {
    const res = await apiFetch("/api/registrations", {
      method: "POST",
      cookie: adultCookie,
      body: JSON.stringify({
        seasonId: closedSeasonId,
        registerSelf: true,
        registrationType: "full",
        waiverSigned: true,
        waiverSignedBy: "Adult Self",
      }),
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/closed/i);
  });

  it("POST /api/public/team-registrations rejects with a closed message", async () => {
    const res = await apiFetch("/api/public/team-registrations", {
      method: "POST",
      cookie: adultCookie,
      body: JSON.stringify({
        seasonId: closedSeasonId,
        teamName: "Too Late FC",
        captainName: "Adult Self",
        captainEmail: "adult-self@test.aspiresports.com",
        backstopConsent: true,
      }),
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/closed/i);
  });
});
