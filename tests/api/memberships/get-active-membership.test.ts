import { describe, expect, it, beforeAll } from "vitest";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { organizations } from "@/lib/db/schema/organizations";
import { users } from "@/lib/db/schema/users";
import {
  membershipTiers,
  memberships,
} from "@/lib/db/schema/memberships";
import { getActiveMembershipForOrg } from "@/lib/memberships/get-active-membership";

// The test runs against the seeded DB. `seed-e2e-tests.ts` provisions:
//   - "Aspire Sports" org (slug 'aspire-sports') — no membership_tiers
//   - "SoccerOne" org (slug 'soccerone') — Stage 13 (Task 17) adds one tier
//     and one active membership for the SoccerOne test user.

let aspireOrgId: string | undefined;
let soccerOneOrgId: string | undefined;
let aspireUserId: string | undefined;
let soccerOneUserId: string | undefined;
// SoccerOne fixtures require `scripts/seed-soccerone-org.ts` AND Stage 13
// from `seed-e2e-tests.ts`. On CI's staging DB, the provisioning script
// may not have been run — Stage 13 then skips, leaving the tier + member
// rows absent. Tests that depend on them are dynamically skipped below.
let hasSoccerOneFixtures = false;

beforeAll(async () => {
  const db = getDb();
  const [aspire] = await db.select().from(organizations).where(eq(organizations.slug, "aspire-sports"));
  aspireOrgId = aspire?.id;
  const [s1] = await db.select().from(organizations).where(eq(organizations.slug, "soccerone"));
  soccerOneOrgId = s1?.id;

  const [parent] = await db.select().from(users).where(eq(users.email, "parent@test.aspiresports.com"));
  aspireUserId = parent?.id;

  const [s1user] = await db.select().from(users).where(eq(users.email, "member@test.soccerone.com"));
  soccerOneUserId = s1user?.id;

  hasSoccerOneFixtures = Boolean(soccerOneOrgId && soccerOneUserId);
});

describe("getActiveMembershipForOrg", () => {
  it("returns null when the org has no membership tiers (Aspire)", async () => {
    if (!aspireUserId || !aspireOrgId) return;
    const result = await getActiveMembershipForOrg(aspireUserId, aspireOrgId);
    expect(result).toBeNull();
  });

  it("returns null when the user has no membership row (SoccerOne, random user)", async (ctx) => {
    if (!aspireUserId || !soccerOneOrgId) return ctx.skip();
    const result = await getActiveMembershipForOrg(aspireUserId, soccerOneOrgId);
    expect(result).toBeNull();
  });

  it("returns the active membership for a SoccerOne member", async (ctx) => {
    if (!hasSoccerOneFixtures || !soccerOneUserId || !soccerOneOrgId) return ctx.skip();
    const result = await getActiveMembershipForOrg(soccerOneUserId, soccerOneOrgId);
    expect(result).not.toBeNull();
    expect(result?.tier.benefits).toEqual(
      expect.objectContaining({ rental_discount_pct: 10 }),
    );
    expect(["active", "paused", "past_due"]).toContain(result?.status);
  });

  it("returns null for a cancelled membership", async (ctx) => {
    if (!hasSoccerOneFixtures || !soccerOneUserId || !soccerOneOrgId) return ctx.skip();
    const db = getDb();
    await db.update(memberships)
      .set({ status: "cancelled", cancelledAt: new Date() })
      .where(eq(memberships.userId, soccerOneUserId));
    try {
      const result = await getActiveMembershipForOrg(soccerOneUserId, soccerOneOrgId);
      expect(result).toBeNull();
    } finally {
      await db.update(memberships)
        .set({ status: "active", cancelledAt: null })
        .where(eq(memberships.userId, soccerOneUserId));
    }
  });
});
