/**
 * Integration: block-level refunds.
 *
 * Stripe is not configured on CI, so the case that actually issues money back
 * is gated behind the repo's `itWithStripe` pattern; the guard logic (whole
 * dollars, the paid ceiling, tenancy) is asserted unconditionally because that
 * is what stands between an admin and a refund the block never took in.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { eq, inArray } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { fieldRentals } from "@/lib/db/schema/field-rentals";
import { fieldRentalBlocks } from "@/lib/db/schema/field-rental-blocks";
import { selfServiceTokens } from "@/lib/db/schema/self-service-tokens";
import { createRentalBlock, type CreateBlockInput } from "@/lib/rentals/blocks/create";
import { applyDepositPaid } from "@/lib/rentals/blocks/lifecycle";
import { apiFetch, getAdminCookie, getParentCookie } from "../../setup/test-helpers";
import {
  E2E_ORG_ID,
  E2E_RENTAL_VENUE_ID,
  resolveE2ELocationId,
  resolveE2EAdminUserId,
} from "@/lib/db/seeds/seed-e2e-tests";

const stripeConfigured = Boolean(process.env.STRIPE_SECRET_KEY);
const itWithStripe = stripeConfigured ? it : it.skip;

const TZ = "America/New_York";
const blockIds: string[] = [];

let locationId: string;
let adminUserId: string;
let admin: string;
let parent: string;

// A distinct far-future year per run so concurrent CI runs never collide.
// Within a run, the cases below stay apart by using distinct month ranges.
// The wide random window is what keeps CONCURRENT runs — and rows left behind
// by an earlier run on the shared CI database — from landing on the same slot.
// 3200-3599 is disjoint from payment.test.ts (2200-2599) and sweeps (2700-3099).
const RUN_YEAR = 3200 + Math.floor(Math.random() * 400);

function input(overrides: Partial<CreateBlockInput> = {}): CreateBlockInput {
  return {
    organizationId: E2E_ORG_ID,
    locationId,
    brand: "soccerone",
    label: `Refund Block ${Math.random().toString(36).slice(2, 8)}`,
    renterUserId: null,
    renterName: "Refund Tester",
    renterEmail: "refund-tester@test.aspiresports.com",
    renterPhone: null,
    partySize: 12,
    purpose: "team practice",
    notes: null,
    pattern: {
      timeZone: TZ,
      firstDate: `${RUN_YEAR}-01-06`,
      lastDate: `${RUN_YEAR}-02-28`,
      days: [
        {
          weekday: 2,
          startMinute: 1200,
          durationMinutes: 60,
          venueIds: [E2E_RENTAL_VENUE_ID],
        },
      ],
    },
    excludedKeys: [],
    sessionOverrides: {},
    extraSessions: [],
    discount: { kind: "percent", value: 10 },
    depositPct: 25,
    rateCard: { balanceDueLeadDays: 30, blockHoldHours: 72, quoteMarkerTtlDays: 14 },
    pricingContext: {
      brand: "soccerone",
      timeZone: TZ,
      venueHourlyRateCents: { [E2E_RENTAL_VENUE_ID]: null },
      defaultHourlyRateCents: 8000,
    },
    mode: "send_deposit",
    offlinePaymentMethod: null,
    createdByUserId: adminUserId,
    ...overrides,
  };
}

async function commit(over: Partial<CreateBlockInput> = {}): Promise<string> {
  const res = await createRentalBlock(input(over));
  if (!res.ok) throw new Error(`${res.error}: ${JSON.stringify(res.conflicts)}`);
  blockIds.push(res.blockId);
  return res.blockId;
}

function patternFrom(firstDate: string, lastDate: string) {
  return {
    timeZone: TZ,
    firstDate,
    lastDate,
    days: [
      {
        weekday: 2,
        startMinute: 1200,
        durationMinutes: 60,
        venueIds: [E2E_RENTAL_VENUE_ID],
      },
    ],
  };
}

const loadBlock = async (id: string) => {
  const [row] = await getDb()
    .select()
    .from(fieldRentalBlocks)
    .where(eq(fieldRentalBlocks.id, id))
    .limit(1);
  return row;
};

const refund = (blockId: string, amountCents: unknown, cookie: string) =>
  apiFetch(`/api/admin/rentals/blocks/${blockId}/refund`, {
    method: "POST",
    cookie,
    body: JSON.stringify({ amountCents }),
  });

beforeAll(async () => {
  locationId = await resolveE2ELocationId();
  adminUserId = await resolveE2EAdminUserId();
  admin = await getAdminCookie();
  parent = await getParentCookie();
});

afterAll(async () => {
  const db = getDb();
  if (blockIds.length) {
    await db.delete(selfServiceTokens).where(inArray(selfServiceTokens.targetId, blockIds));
    await db.delete(fieldRentals).where(inArray(fieldRentals.blockId, blockIds));
    await db.delete(fieldRentalBlocks).where(inArray(fieldRentalBlocks.id, blockIds));
  }
});

describe("POST /api/admin/rentals/blocks/:id/refund", () => {
  it("refuses a non-admin", async () => {
    const blockId = await commit();
    const res = await refund(blockId, 10_000, parent);
    expect([401, 403]).toContain(res.status);
  });

  it("400s a non-whole-dollar amount", async () => {
    const blockId = await commit({ pattern: patternFrom(`${RUN_YEAR}-03-03`, `${RUN_YEAR}-04-28`) });
    await applyDepositPaid(blockId, "pi_refund_deposit_1", 23_400);

    const res = await refund(blockId, 12_345, admin);
    expect(res.status).toBe(400);
  });

  it("400s a zero or negative amount", async () => {
    const blockId = await commit({ pattern: patternFrom(`${RUN_YEAR}-05-05`, `${RUN_YEAR}-06-30`) });
    const res = await refund(blockId, 0, admin);
    expect(res.status).toBe(400);
  });

  it("422s an amount above what the block has been paid", async () => {
    const blockId = await commit({ pattern: patternFrom(`${RUN_YEAR}-07-07`, `${RUN_YEAR}-08-25`) });
    await applyDepositPaid(blockId, "pi_refund_deposit_2", 23_400);

    const block = await loadBlock(blockId);
    const res = await refund(blockId, block.depositDueCents + 100_000, admin);
    expect(res.status).toBe(422);
    const json = await res.json();
    expect(json.paidCents).toBe(block.depositDueCents);
  });

  it("422s a block that has not been paid at all", async () => {
    const blockId = await commit({ pattern: patternFrom(`${RUN_YEAR}-09-01`, `${RUN_YEAR}-10-27`) });
    const res = await refund(blockId, 10_000, admin);
    expect(res.status).toBe(422);
  });

  it("records a refund on an offline-settled block without calling Stripe", async () => {
    const blockId = await commit({
      mode: "paid_offline",
      offlinePaymentMethod: "cash",
      pattern: patternFrom(`${RUN_YEAR}-11-03`, `${RUN_YEAR}-12-29`),
    });
    const before = await loadBlock(blockId);
    const paidBefore =
      (before.depositPaidAt ? before.depositDueCents : 0) +
      (before.balancePaidAt ? before.balanceDueCents : 0);
    expect(paidBefore).toBeGreaterThan(0);

    const res = await refund(blockId, 10_000, admin);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.refundedCents).toBe(10_000);
    expect(json.offline).toBe(true);

    // The refund comes off the block's paid figures, which is what caps the next one.
    const after = await loadBlock(blockId);
    const paidAfter =
      (after.depositPaidAt ? after.depositDueCents : 0) +
      (after.balancePaidAt ? after.balanceDueCents : 0);
    expect(paidAfter).toBe(paidBefore - 10_000);

    const over = await refund(blockId, paidAfter + 100, admin);
    expect(over.status).toBe(422);
  });

  itWithStripe("issues the refund against the deposit intent first", async () => {
    const blockId = await commit({ pattern: patternFrom(`${RUN_YEAR + 1}-01-05`, `${RUN_YEAR + 1}-02-23`) });
    await applyDepositPaid(blockId, "pi_refund_deposit_3", 23_400);

    const res = await refund(blockId, 10_000, admin);
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.refunds[0].leg).toBe("deposit");
    expect(json.refunds[0].refundId).toBeTruthy();
  });
});
