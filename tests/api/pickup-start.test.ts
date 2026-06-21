/**
 * POST /api/admin/pickup/start
 *
 * Smoke tests:
 *   - 401 without auth
 *   - 400 on empty body
 *   - 201 happy path (guarded: only runs when a real spaceId is discoverable)
 */
import { describe, it, expect, beforeAll } from "vitest";
import { getDb } from "@/lib/db";
import { venues } from "@/lib/db/schema/teams";
import { organizations, locations } from "@/lib/db/schema/organizations";
import { venueResources } from "@/lib/db/schema/scheduling";
import { and, asc, eq, isNull } from "drizzle-orm";
import { apiFetch, getAdminCookie } from "./setup/test-helpers";

const ENDPOINT = "/api/admin/pickup/start";

// Discover a real spaceId from the default org (the one localhost resolves to).
// This mirrors resolveDefaultOrgForHttpTests() in dropin-helpers but also
// returns a bookableResourceId (venueResource).
async function resolveDefaultOrgSpace(): Promise<{
  organizationId: string;
  venueId: string;
  spaceId: string | null;
}> {
  const db = getDb();

  // Find the default org (oldest active HQ, or oldest active org).
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
  if (!organizationId) {
    return { organizationId: "", venueId: "", spaceId: null };
  }

  // Find a venue in that org.
  const [venueRow] = await db
    .select({ id: venues.id })
    .from(venues)
    .innerJoin(locations, eq(venues.locationId, locations.id))
    .where(eq(locations.organizationId, organizationId))
    .orderBy(asc(venues.createdAt))
    .limit(1);
  if (!venueRow) {
    return { organizationId, venueId: "", spaceId: null };
  }

  // Find a venueResource (field) for that venue.
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

  return {
    organizationId,
    venueId: venueRow.id,
    spaceId: resource?.id ?? null,
  };
}

let ctx: { organizationId: string; venueId: string; spaceId: string | null };

beforeAll(async () => {
  ctx = await resolveDefaultOrgSpace();
});

describe("POST /api/admin/pickup/start", () => {
  it("returns 401 when not authenticated", async () => {
    const res = await apiFetch(ENDPOINT, {
      method: "POST",
      body: JSON.stringify({ spaceId: "00000000-0000-0000-0000-000000000000", label: "Soccer" }),
    });
    expect(res.status).toBe(401);
  });

  it("returns 400 on empty body", async () => {
    let cookie: string;
    try {
      cookie = await getAdminCookie();
    } catch {
      // Admin fixture not present in this environment — skip.
      return;
    }
    const res = await apiFetch(ENDPOINT, {
      method: "POST",
      body: JSON.stringify({}),
      headers: { Cookie: cookie },
    });
    expect(res.status).toBe(400);
  });

  it("returns 400 when spaceId is not a UUID", async () => {
    let cookie: string;
    try {
      cookie = await getAdminCookie();
    } catch {
      return;
    }
    const res = await apiFetch(ENDPOINT, {
      method: "POST",
      body: JSON.stringify({ spaceId: "not-a-uuid", label: "Soccer" }),
      headers: { Cookie: cookie },
    });
    expect(res.status).toBe(400);
  });

  it("returns 201 with a sessionId on a valid request", async () => {
    // Guard: skip if we couldn't discover a real spaceId for the seeded org.
    // This happens when the DB is not seeded with a venue + venueResource.
    // The 401 and 400 tests above still provide coverage.
    if (!ctx.spaceId) {
      // eslint-disable-next-line no-console
      console.warn(
        "[pickup-start] skipping happy-path test: no venueResource found for the default org. " +
          "Ensure the DB is seeded with at least one venue that has a field.",
      );
      return;
    }

    let cookie: string;
    try {
      cookie = await getAdminCookie();
    } catch {
      return;
    }

    const res = await apiFetch(ENDPOINT, {
      method: "POST",
      body: JSON.stringify({
        spaceId: ctx.spaceId,
        label: "Soccer Pickup",
        capacity: 20,
        durationMinutes: 90,
      }),
      headers: { Cookie: cookie },
    });

    // Accept 201 (created) or 409 (scheduling conflict on the field-time ledger —
    // the session was still created; the caller can handle the conflict warning).
    expect([201, 409]).toContain(res.status);
    const json = await res.json();
    expect(typeof json.sessionId).toBe("string");
    expect(json.sessionId.length).toBeGreaterThan(0);
  });
});
