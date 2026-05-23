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

let aspireOrgId: string;
let soccerOneOrgId: string;
let aspireUserId: string;
let soccerOneUserId: string;

beforeAll(async () => {
  const db = getDb();
  const [aspire] = await db.select().from(organizations).where(eq(organizations.slug, "aspire-sports"));
  const [s1] = await db.select().from(organizations).where(eq(organizations.slug, "soccerone"));
  aspireOrgId = aspire.id;
  soccerOneOrgId = s1.id;

  // An Aspire user — pick the test parent.
  const [parent] = await db.select().from(users).where(eq(users.email, "parent@test.aspiresports.com"));
  aspireUserId = parent.id;

  // The SoccerOne test user will be seeded by Stage 13 (Task 17). TODO confirm email.
  const [s1user] = await db.select().from(users).where(eq(users.email, "member@test.soccerone.com"));
  soccerOneUserId = s1user.id;
});

describe.skip("getActiveMembershipForOrg", () => {
  it("returns null when the org has no membership tiers (Aspire)", async () => {
    const result = await getActiveMembershipForOrg(aspireUserId, aspireOrgId);
    expect(result).toBeNull();
  });

  it("returns null when the user has no membership row (SoccerOne, random user)", async () => {
    const result = await getActiveMembershipForOrg(aspireUserId, soccerOneOrgId);
    expect(result).toBeNull();
  });

  it("returns the active membership for a SoccerOne member", async () => {
    const result = await getActiveMembershipForOrg(soccerOneUserId, soccerOneOrgId);
    expect(result).not.toBeNull();
    expect(result?.tier.benefits).toEqual(
      expect.objectContaining({ rental_discount_pct: 10 }),
    );
    expect(["active", "paused", "past_due"]).toContain(result?.status);
  });

  it("returns null for a cancelled membership", async () => {
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
