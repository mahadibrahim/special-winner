/**
 * requireKioskLocation's resolution rule, exercised over HTTP.
 *
 * The kiosk is a mounted iPad in a lobby: a 404 is a dead device nobody is
 * standing next to. `locations.slug` is unique only per ORG, so the rule is
 * "prefer the request's org, fall back globally only when the answer is
 * unambiguous, and refuse (404) when two tenants share the segment".
 *
 * Fixtures: two throwaway orgs (B and C) plus locations in the request's own
 * org. All torn down in afterAll.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { apiFetch } from "../setup/test-helpers";
import { getDb } from "@/lib/db";
import { organizations, locations } from "@/lib/db/schema/organizations";
import { resolveOrganizationFromHost } from "@/lib/organization/domain-resolver";
import { eq, inArray } from "drizzle-orm";

const SUFFIX = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

// Slugs must match the kiosk segment format (lowercase alnum + hyphens).
const SHARED_SLUG = `kioskres-shared-${SUFFIX}`;
const SOLO_SLUG = `kioskres-solo-${SUFFIX}`;
const AMBIG_SLUG = `kioskres-ambig-${SUFFIX}`;
const DEACT_SLUG = `kioskres-deact-${SUFFIX}`;

const NAME_HOME = `Kiosk Res Home ${SUFFIX}`;
const NAME_B = `Kiosk Res Bravo ${SUFFIX}`;
const NAME_C = `Kiosk Res Charlie ${SUFFIX}`;

describe("kiosk location resolution (requireKioskLocation)", () => {
  const orgIds: string[] = [];
  const locationIds: string[] = [];
  let requestOrgId: string;

  beforeAll(async () => {
    const db = getDb();

    // The org the server itself will resolve for these requests — same host,
    // same resolver the middleware uses.
    const host = new URL(process.env.TEST_BASE_URL || "http://localhost:4321")
      .hostname;
    const resolved = await resolveOrganizationFromHost(host);
    if (!resolved) throw new Error(`No organization resolves for host ${host}`);
    requestOrgId = resolved.organization.id;

    const mkOrg = async (label: string) => {
      const [org] = await db
        .insert(organizations)
        .values({
          name: `Kiosk Res ${label} ${SUFFIX}`,
          slug: `kioskres-${label}-${SUFFIX}`.toLowerCase(),
          organizationType: "franchise",
          status: "active",
        })
        .returning({ id: organizations.id });
      orgIds.push(org.id);
      return org.id;
    };

    const orgB = await mkOrg("b");
    const orgC = await mkOrg("c");

    const mkLoc = async (
      organizationId: string,
      slug: string,
      name: string,
      active = true,
    ) => {
      const [row] = await db
        .insert(locations)
        .values({ organizationId, slug, name, active })
        .returning({ id: locations.id });
      locationIds.push(row.id);
      return row.id;
    };

    // (a) same slug in the request's org AND in another org.
    await mkLoc(requestOrgId, SHARED_SLUG, NAME_HOME);
    await mkLoc(orgB, SHARED_SLUG, NAME_B);

    // (b) slug that exists in exactly one org — and it isn't the request's.
    await mkLoc(orgB, SOLO_SLUG, NAME_B);

    // (c) same slug in TWO orgs, neither of them the request's.
    await mkLoc(orgB, AMBIG_SLUG, NAME_B);
    await mkLoc(orgC, AMBIG_SLUG, NAME_C);

    // (d) deactivated in the request's own org, live in another org.
    await mkLoc(requestOrgId, DEACT_SLUG, NAME_HOME, false);
    await mkLoc(orgB, DEACT_SLUG, NAME_B);
  });

  afterAll(async () => {
    const db = getDb();
    try {
      if (locationIds.length)
        await db.delete(locations).where(inArray(locations.id, locationIds));
    } finally {
      if (orgIds.length)
        await db.delete(organizations).where(inArray(organizations.id, orgIds));
    }
  });

  it("prefers the request organization's location when the slug is shared", async () => {
    const res = await apiFetch(`/kiosk/${SHARED_SLUG}`);
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain(NAME_HOME);
    expect(html).not.toContain(NAME_B);

    // …and the API surface agrees (not a 404).
    const api = await apiFetch(`/api/kiosk/${SHARED_SLUG}/sessions`);
    expect(api.status).toBe(200);
  });

  it("still resolves a slug owned by ONE other org (no dead kiosk on a host/org mismatch)", async () => {
    const api = await apiFetch(`/api/kiosk/${SOLO_SLUG}/sessions`);
    expect(api.status).toBe(200);

    const res = await apiFetch(`/kiosk/${SOLO_SLUG}`);
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain(NAME_B);
  });

  it("404s rather than guessing when two orgs share the slug", async () => {
    const api = await apiFetch(`/api/kiosk/${AMBIG_SLUG}/sessions`);
    expect(api.status).toBe(404);

    const res = await apiFetch(`/kiosk/${AMBIG_SLUG}`);
    const html = await res.text();
    expect(html).toContain("Kiosk not configured");
    expect(html).not.toContain(NAME_B);
    expect(html).not.toContain(NAME_C);
  });

  it("honors deactivation in the request's own org instead of falling through to another tenant", async () => {
    const api = await apiFetch(`/api/kiosk/${DEACT_SLUG}/sessions`);
    expect(api.status).toBe(404);
  });

  it("404s on an unknown slug", async () => {
    const api = await apiFetch(`/api/kiosk/kioskres-nobody-${SUFFIX}/sessions`);
    expect(api.status).toBe(404);
  });

  it("resolves by UUID too", async () => {
    const db = getDb();
    const [row] = await db
      .select({ id: locations.id })
      .from(locations)
      .where(eq(locations.slug, SOLO_SLUG))
      .limit(1);
    const api = await apiFetch(`/api/kiosk/${row.id}/sessions`);
    expect(api.status).toBe(200);
  });
});
