/**
 * Integration: getActiveMembershipForOrg computes `allotmentRemaining` from
 * this month's claimed member_allotment drop-ins (ISS-2 v2 allotment feature).
 *
 * Fully isolated — creates its own org/tier/member/sessions so it can't
 * pollute the seeded Aspire/SoccerOne fixtures. Runs against the DB (CI).
 */
import { describe, it, expect, beforeAll } from "vitest";
import { getDb } from "@/lib/db";
import { users } from "@/lib/db/schema/users";
import { dropInBookings } from "@/lib/db/schema/drop-in";
import { membershipTiers, memberships } from "@/lib/db/schema/memberships";
import { getActiveMembershipForOrg } from "@/lib/memberships/get-active-membership";
import { createTestDropInSession } from "../../utils/dropin-helpers";

const CAP = 3;

let orgId: string;
let venueId: string;
let userId: string;
let membershipId: string;

async function bookAllotment(opts: {
  createdAt?: Date;
  status?: "confirmed" | "no_show" | "cancelled";
}): Promise<void> {
  const db = getDb();
  // Each booking needs its own session — the partial unique index forbids two
  // active bookings for the same (session, user).
  const s = await createTestDropInSession({ organizationId: orgId, venueId });
  await db.insert(dropInBookings).values({
    sessionId: s.sessionId,
    userId,
    status: opts.status ?? "confirmed",
    source: "online_booking",
    paymentMethod: "member_allotment",
    amountPaidCents: 0,
    membershipId,
    ...(opts.createdAt ? { createdAt: opts.createdAt } : {}),
  });
}

beforeAll(async () => {
  const db = getDb();
  const ctx = await createTestDropInSession({});
  orgId = ctx.organizationId;
  venueId = ctx.venueId;

  const [u] = await db
    .insert(users)
    .values({
      email: `allot-${Date.now()}-${Math.random()}@t.example`,
      firstName: "Allot",
      lastName: "Member",
    })
    .returning();
  userId = u.id;

  const [tier] = await db
    .insert(membershipTiers)
    .values({
      organizationId: orgId,
      name: "Allotment Tier",
      monthlyPriceCents: 5000,
      benefits: { free_pickup_per_month: CAP },
    })
    .returning();

  const [m] = await db
    .insert(memberships)
    .values({
      userId,
      organizationId: orgId,
      tierId: tier.id,
      status: "active",
      billingInterval: "month",
    })
    .returning();
  membershipId = m.id;
});

describe("getActiveMembershipForOrg — allotment counting", () => {
  it("returns the full cap before any pickups are claimed", async () => {
    const m = await getActiveMembershipForOrg(userId, orgId);
    expect(m?.allotmentRemaining).toBe(CAP);
  });

  it("subtracts this-month confirmed/no_show claims; ignores cancelled and prior months", async () => {
    // 2 this month (one confirmed, one no_show) → counted.
    await bookAllotment({ status: "confirmed" });
    await bookAllotment({ status: "no_show" });
    // A cancelled claim this month → NOT counted (slot returned).
    await bookAllotment({ status: "cancelled" });
    // A confirmed claim dated last month → NOT counted (outside the period).
    await bookAllotment({
      status: "confirmed",
      createdAt: new Date(Date.UTC(2000, 0, 15)),
    });

    const m = await getActiveMembershipForOrg(userId, orgId);
    expect(m?.allotmentRemaining).toBe(CAP - 2); // 1 remaining
  });

  it("floors at 0 once the cap is consumed", async () => {
    await bookAllotment({ status: "confirmed" }); // 3rd this-month claim
    await bookAllotment({ status: "confirmed" }); // 4th — over cap
    const m = await getActiveMembershipForOrg(userId, orgId);
    expect(m?.allotmentRemaining).toBe(0);
  });
});
