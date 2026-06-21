/**
 * POST /api/admin/pickup/[sessionId]/add
 *
 * Smoke tests:
 *   - 401 without auth
 *   - 404 for a nonexistent session id
 *   - 200 happy path: add by name + phone → bookingId + personName + linkResult
 *   - 200 dedupe: same phone on the same session → same bookingId
 *
 * The test creates a fresh pickup session via /api/admin/pickup/start in
 * beforeAll. If no venueResource is discoverable, the happy-path tests are
 * skipped but the 401 test still runs.
 */
import { describe, it, expect, beforeAll } from "vitest";
import { getDb } from "@/lib/db";
import { venues } from "@/lib/db/schema/teams";
import { organizations, locations } from "@/lib/db/schema/organizations";
import { venueResources } from "@/lib/db/schema/scheduling";
import { and, asc, eq, isNull } from "drizzle-orm";
import { apiFetch, getAdminCookie } from "./setup/test-helpers";

// ---- Helpers ----------------------------------------------------------------

async function resolveDefaultOrgSpace(): Promise<{
  organizationId: string;
  spaceId: string | null;
}> {
  const db = getDb();

  const [hq] = await db
    .select({ id: organizations.id })
    .from(organizations)
    .where(
      and(
        eq(organizations.organizationType, "headquarters"),
        eq(organizations.status, "active"),
      ),
    )
    .orderBy(asc(organizations.createdAt))
    .limit(1);

  let organizationId = hq?.id;
  if (!organizationId) {
    const [oldest] = await db
      .select({ id: organizations.id })
      .from(organizations)
      .where(eq(organizations.status, "active"))
      .orderBy(asc(organizations.createdAt))
      .limit(1);
    organizationId = oldest?.id;
  }
  if (!organizationId) return { organizationId: "", spaceId: null };

  const [venueRow] = await db
    .select({ id: venues.id })
    .from(venues)
    .innerJoin(locations, eq(venues.locationId, locations.id))
    .where(eq(locations.organizationId, organizationId))
    .orderBy(asc(venues.createdAt))
    .limit(1);
  if (!venueRow) return { organizationId, spaceId: null };

  const [resource] = await db
    .select({ id: venueResources.id })
    .from(venueResources)
    .where(
      and(
        eq(venueResources.venueId, venueRow.id),
        isNull(venueResources.parentResourceId),
      ),
    )
    .orderBy(asc(venueResources.fieldNumber))
    .limit(1);

  return { organizationId, spaceId: resource?.id ?? null };
}

// ---- State ------------------------------------------------------------------

let sessionId: string | null = null;

beforeAll(async () => {
  const { spaceId } = await resolveDefaultOrgSpace();
  if (!spaceId) {
    console.warn(
      "[pickup-add] no venueResource found — skipping session creation. " +
        "Seed the DB with at least one venue + venueResource to run happy-path tests.",
    );
    return;
  }

  let cookie: string;
  try {
    cookie = await getAdminCookie();
  } catch {
    console.warn("[pickup-add] admin fixture not available — skipping session creation.");
    return;
  }

  const startRes = await apiFetch("/api/admin/pickup/start", {
    method: "POST",
    body: JSON.stringify({
      spaceId,
      label: "Pickup Add Test",
      capacity: 30,
      durationMinutes: 60,
    }),
    headers: { Cookie: cookie },
  });

  // 201 (created) or 409 (ledger conflict — session still created).
  if (startRes.status === 201 || startRes.status === 409) {
    const data = await startRes.json();
    sessionId = data.sessionId ?? null;
  } else {
    console.warn(
      `[pickup-add] /pickup/start returned ${startRes.status} — skipping happy-path tests.`,
    );
  }
});

// ---- Tests ------------------------------------------------------------------

describe("POST /api/admin/pickup/[sessionId]/add", () => {
  it("returns 401 when not authenticated", async () => {
    const res = await apiFetch(
      "/api/admin/pickup/00000000-0000-0000-0000-000000000001/add",
      {
        method: "POST",
        body: JSON.stringify({
          firstName: "Pat",
          lastName: "Walkup",
          phone: "(614) 555-1212",
        }),
      },
    );
    expect(res.status).toBe(401);
  });

  it("returns 404 for a nonexistent session id", async () => {
    let cookie: string;
    try {
      cookie = await getAdminCookie();
    } catch {
      return;
    }
    const res = await apiFetch(
      "/api/admin/pickup/00000000-0000-0000-0000-000000000002/add",
      {
        method: "POST",
        body: JSON.stringify({
          firstName: "Pat",
          lastName: "Walkup",
          phone: "(614) 555-1212",
        }),
        headers: { Cookie: cookie },
      },
    );
    expect(res.status).toBe(404);
  });

  it("returns 200 with bookingId + personName + linkResult on valid add", async () => {
    if (!sessionId) {
      console.warn("[pickup-add] skipping happy-path: no sessionId available.");
      return;
    }
    let cookie: string;
    try {
      cookie = await getAdminCookie();
    } catch {
      return;
    }

    const res = await apiFetch(
      `/api/admin/pickup/${sessionId}/add`,
      {
        method: "POST",
        body: JSON.stringify({
          firstName: "Pat",
          lastName: "Walkup",
          phone: "(614) 555-1212",
        }),
        headers: { Cookie: cookie },
      },
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(typeof body.bookingId).toBe("string");
    expect(body.bookingId.length).toBeGreaterThan(0);
    expect(typeof body.personName).toBe("string");
    expect(body.personName).toContain("Pat");
    expect(typeof body.userId).toBe("string");
    // linkResult must be present regardless of whether SMS actually sent.
    expect(body.linkResult).toBeDefined();
    expect(typeof body.linkResult.sent).toBe("boolean");
  });

  it("returns 200 with the SAME bookingId when the same phone is added again (dedupe)", async () => {
    if (!sessionId) {
      console.warn("[pickup-add] skipping dedupe test: no sessionId available.");
      return;
    }
    let cookie: string;
    try {
      cookie = await getAdminCookie();
    } catch {
      return;
    }

    // First add (may already exist from the test above — that's fine).
    const first = await apiFetch(
      `/api/admin/pickup/${sessionId}/add`,
      {
        method: "POST",
        body: JSON.stringify({
          firstName: "Pat",
          lastName: "Walkup",
          phone: "(614) 555-1212",
        }),
        headers: { Cookie: cookie },
      },
    );
    expect(first.status).toBe(200);
    const firstBody = await first.json();

    // Second add with same phone — must return same bookingId.
    const second = await apiFetch(
      `/api/admin/pickup/${sessionId}/add`,
      {
        method: "POST",
        body: JSON.stringify({
          firstName: "Patricia",   // different name, same phone
          lastName: "Walkup",
          phone: "6145551212",    // different format, same digits
        }),
        headers: { Cookie: cookie },
      },
    );
    expect(second.status).toBe(200);
    const secondBody = await second.json();

    expect(secondBody.bookingId).toBe(firstBody.bookingId);
  });
});
