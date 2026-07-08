/**
 * Tenant isolation for the time-tracking surface (Task 17,
 * docs/superpowers/plans/2026-07-07-time-tracking.md):
 *   - An Org A coach attempting to clock in at an Org B venue 404s
 *     (requireSameOrgVenue) rather than leaking the venue's existence or
 *     letting the clock-in through.
 *   - The admin time-entries list (Org A admin) never returns an Org B
 *     row, even one that exists in the DB.
 *
 * Org A is the domain-resolved "aspire-sports" org every test HTTP request
 * against localhost lands in (createAdminOrgGameContext). Org B is a fully
 * isolated, freshly-created org (createTestGameContext) that no test HTTP
 * request can ever resolve to via the domain.
 */
import { describe, it, expect, beforeAll } from "vitest";
import { getDb } from "@/lib/db";
import { users, roles, userRoles } from "@/lib/db/schema/users";
import { timeEntries } from "@/lib/db/schema/time-tracking";
import { hashPassword } from "@/lib/auth/password";
import { eq } from "drizzle-orm";
import { createAdminOrgGameContext } from "../../utils/admin-org-game-context";
import { createTestGameContext } from "../../utils/activity-tracking-helpers";
import { getAdminCookie, getAuthCookie, apiFetch, expectJson } from "../setup/test-helpers";

const PASSWORD = "TestTenantCoach123!";

describe("time-tracking tenant isolation", () => {
  let orgACoachCookie: string;
  let orgBVenueId: string;
  let orgBTimeEntryId: string;

  beforeAll(async () => {
    await createAdminOrgGameContext(); // ensures Org A ("aspire-sports") has at least one venue/game
    const orgB = await createTestGameContext();
    orgBVenueId = orgB.venueId;

    const db = getDb();

    const email = `tenant-coach-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`;
    const passwordHash = await hashPassword(PASSWORD);
    const [coachUser] = await db
      .insert(users)
      .values({ email, passwordHash, firstName: "Tenant", lastName: "Coach", emailVerified: true })
      .returning();
    const [coachRole] = await db.select().from(roles).where(eq(roles.name, "coach")).limit(1);
    if (!coachRole) throw new Error("e2e seed invariant violated: 'coach' role not found");
    await db
      .insert(userRoles)
      .values({ userId: coachUser.id, roleId: coachRole.id, scopeType: "global" });
    orgACoachCookie = await getAuthCookie(email, PASSWORD);

    await apiFetch("/api/staff/location-consent", {
      cookie: orgACoachCookie,
      method: "POST",
      body: JSON.stringify({ acknowledged: true }),
    });

    // A genuine Org B time_entries row — direct DB insert, since no test
    // HTTP request can ever resolve to Org B's domain to create one via
    // the real clock-in endpoint.
    const [orgBUser] = await db
      .insert(users)
      .values({
        email: `tenant-orgb-user-${Date.now()}@example.com`,
        passwordHash,
        firstName: "OrgB",
        lastName: "Worker",
        emailVerified: true,
      })
      .returning();
    const [orgBEntry] = await db
      .insert(timeEntries)
      .values({
        organizationId: orgB.organizationId,
        userId: orgBUser.id,
        venueId: orgBVenueId,
        role: "coach",
        clockInAt: new Date("2026-06-05T14:00:00Z"),
        clockOutAt: new Date("2026-06-05T18:00:00Z"),
        flaggedOutOfRange: false,
      })
      .returning();
    orgBTimeEntryId = orgBEntry.id;
  });

  it("404s a clock-in attempt against a venue from another org", async () => {
    const res = await apiFetch("/api/staff/shifts/clock-in", {
      cookie: orgACoachCookie,
      method: "POST",
      body: JSON.stringify({ venueId: orgBVenueId, lat: 0, lng: 0, accuracy: 10 }),
    });
    expect(res.status).toBe(404);
  });

  it("admin time-entries list for Org A never includes an Org B row", async () => {
    const adminCookie = await getAdminCookie();
    const res = await apiFetch("/api/admin/labor/time-entries", { cookie: adminCookie });
    const body = await expectJson(res, 200);
    const ids = body.timeEntries.map((t: { id: string }) => t.id);
    expect(ids).not.toContain(orgBTimeEntryId);
  });

  it("admin time-entries list 404s an explicit venueId from another org", async () => {
    const adminCookie = await getAdminCookie();
    const res = await apiFetch(`/api/admin/labor/time-entries?venueId=${orgBVenueId}`, {
      cookie: adminCookie,
    });
    expect(res.status).toBe(404);
  });
});
