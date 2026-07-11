import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { getAuthCookie, apiFetch } from "./setup/test-helpers";
import { getDb } from "@/lib/db";
import { seasons, registrations } from "@/lib/db/schema";
import { organizations, userOrganizationAccess } from "@/lib/db/schema/organizations";
import { users } from "@/lib/db/schema/users";
import { and, eq } from "drizzle-orm";

const ADULT_OPEN_SEASON_SLUG = "e2e-adult-open-soccer-2026";
const SELF_EMAIL = "adult-self@test.aspiresports.com";

describe("registration grants org membership", () => {
  let seasonId: string;
  let orgId: string;
  let selfUserId: string;
  let cookie: string;
  let createdRegistrationId: string | null = null;

  beforeAll(async () => {
    const db = getDb();
    const [season] = await db
      .select({ id: seasons.id })
      .from(seasons)
      .where(eq(seasons.slug, ADULT_OPEN_SEASON_SLUG))
      .limit(1);
    if (!season) {
      throw new Error("adult open season not seeded — run npm run db:seed:e2e");
    }
    seasonId = season.id;

    const [org] = await db
      .select({ id: organizations.id })
      .from(organizations)
      .where(eq(organizations.slug, "aspire-sports"))
      .limit(1);
    orgId = org.id;

    const [self] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, SELF_EMAIL))
      .limit(1);
    selfUserId = self.id;

    // Make the assertion meaningful on a shared staging DB: start from a
    // clean slate for this (user, org) pair.
    await db.delete(userOrganizationAccess).where(
      and(
        eq(userOrganizationAccess.userId, selfUserId),
        eq(userOrganizationAccess.organizationId, orgId),
      ),
    );

    cookie = await getAuthCookie(SELF_EMAIL, "TestParent123!");
  });

  afterAll(async () => {
    // Remove only the registration this run created (resumed = pre-existing).
    if (createdRegistrationId) {
      await getDb().delete(registrations).where(eq(registrations.id, createdRegistrationId));
    }
  });

  it("POST /api/registrations creates a user_organization_access row for the registrant", async () => {
    const res = await apiFetch("/api/registrations", {
      method: "POST",
      cookie,
      body: JSON.stringify({
        seasonId,
        registerSelf: true,
        registrationType: "full",
        waiverSigned: true,
        waiverSignedBy: "Adult Self",
      }),
    });
    // 201 on first registration, 200 on resume — both must grant membership.
    expect([200, 201]).toContain(res.status);
    const body = await res.json();
    if (res.status === 201 && body.registration?.id) {
      createdRegistrationId = body.registration.id;
    }

    const rows = await getDb()
      .select()
      .from(userOrganizationAccess)
      .where(
        and(
          eq(userOrganizationAccess.userId, selfUserId),
          eq(userOrganizationAccess.organizationId, orgId),
        ),
      );
    expect(rows.length).toBe(1);
    expect(rows[0].role).toBe("parent");
  });
});
