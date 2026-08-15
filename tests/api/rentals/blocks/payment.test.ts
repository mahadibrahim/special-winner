/**
 * Integration: block deposit and balance collection.
 *
 * Stripe is not configured on CI, so the Checkout-minting cases are gated
 * behind the repo's `itWithStripe` pattern (see tests/api/rentals/pay.test.ts)
 * and the state transitions are exercised by calling `applyDepositPaid` /
 * `applyBalancePaid` directly - which is also what the webhook handlers do,
 * so this covers the webhook behaviour without a Stripe round trip.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { eq, inArray } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { fieldRentals } from "@/lib/db/schema/field-rentals";
import { fieldRentalBlocks } from "@/lib/db/schema/field-rental-blocks";
import { selfServiceTokens } from "@/lib/db/schema/self-service-tokens";
import { createRentalBlock, type CreateBlockInput } from "@/lib/rentals/blocks/create";
import { applyDepositPaid, applyBalancePaid } from "@/lib/rentals/blocks/lifecycle";
import { mintBlockToken } from "@/lib/rentals/blocks/tokens";
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

// A distinct far-future year per run so concurrent CI runs never collide on
// the same field/time slot (mirrors create.test.ts).
const RUN_YEAR = 2045 + Math.floor(Math.random() * 40);

function input(overrides: Partial<CreateBlockInput> = {}): CreateBlockInput {
  return {
    organizationId: E2E_ORG_ID,
    locationId,
    brand: "soccerone",
    label: `Payment Block ${Math.random().toString(36).slice(2, 8)}`,
    renterUserId: null,
    renterName: "Payment Tester",
    renterEmail: "payment-tester@test.aspiresports.com",
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

const loadBlock = async (id: string) => {
  const [row] = await getDb()
    .select()
    .from(fieldRentalBlocks)
    .where(eq(fieldRentalBlocks.id, id))
    .limit(1);
  return row;
};

const loadSessions = (id: string) =>
  getDb().select().from(fieldRentals).where(eq(fieldRentals.blockId, id));

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

describe("applyDepositPaid", () => {
  it("activates the block, dates the balance, and confirms every session", async () => {
    const blockId = await commit();
    const res = await applyDepositPaid(blockId, "pi_deposit_test_1", 70_200);
    expect(res.ok).toBe(true);

    const block = await loadBlock(blockId);
    expect(block.status).toBe("active");
    expect(block.depositPaidAt).not.toBeNull();
    expect(block.stripeDepositPiId).toBe("pi_deposit_test_1");
    expect(block.balanceDueAt).not.toBeNull();

    const sessions = await loadSessions(blockId);
    expect(sessions.length).toBeGreaterThan(0);
    expect(sessions.every((s) => s.status === "confirmed")).toBe(true);

    // balance_due_at = first session - balance_due_lead_days.
    const first = sessions
      .map((s) => s.startsAt.getTime())
      .reduce((a, b) => Math.min(a, b));
    expect(block.balanceDueAt!.getTime()).toBe(first - 30 * 24 * 3_600_000);
  });

  it("leaves the sessions UNPAID after the deposit - the block is the payment truth", async () => {
    const blockId = await commit();
    await applyDepositPaid(blockId, "pi_deposit_test_2", 70_200);

    const sessions = await loadSessions(blockId);
    expect(sessions.every((s) => s.paymentStatus === "unpaid")).toBe(true);
    expect(sessions.every((s) => s.amountPaidCents === 0)).toBe(true);
  });

  it("is a no-op on webhook replay", async () => {
    const blockId = await commit();
    const first = await applyDepositPaid(blockId, "pi_deposit_test_3", 70_200);
    expect(first.ok).toBe(true);
    const before = await loadBlock(blockId);

    const replay = await applyDepositPaid(blockId, "pi_deposit_test_3", 70_200);
    expect(replay.ok).toBe(false);
    expect(replay.reason).toBeTruthy();

    const after = await loadBlock(blockId);
    expect(after.depositPaidAt!.getTime()).toBe(before.depositPaidAt!.getTime());
    expect(after.status).toBe("active");
  });

  it("mutates nothing on a cancelled block - that is the refund path", async () => {
    const blockId = await commit();
    await getDb()
      .update(fieldRentalBlocks)
      .set({ status: "cancelled", cancelledAt: new Date() })
      .where(eq(fieldRentalBlocks.id, blockId));

    const res = await applyDepositPaid(blockId, null, 70_200);
    expect(res.ok).toBe(false);

    const block = await loadBlock(blockId);
    expect(block.status).toBe("cancelled");
    expect(block.depositPaidAt).toBeNull();
  });
});

describe("applyBalancePaid", () => {
  it("settles the block and flips every session to paid in full", async () => {
    const blockId = await commit();
    await applyDepositPaid(blockId, "pi_deposit_test_4", 70_200);

    const res = await applyBalancePaid(blockId, "pi_balance_test_1", 210_600);
    expect(res.ok).toBe(true);

    const block = await loadBlock(blockId);
    expect(block.balancePaidAt).not.toBeNull();
    expect(block.stripeBalancePiId).toBe("pi_balance_test_1");

    const sessions = await loadSessions(blockId);
    expect(sessions.every((s) => s.paymentStatus === "paid")).toBe(true);
    expect(sessions.every((s) => s.amountPaidCents === s.amountDueCents)).toBe(true);
  });

  it("is a no-op on webhook replay", async () => {
    const blockId = await commit();
    await applyDepositPaid(blockId, "pi_deposit_test_5", 70_200);
    await applyBalancePaid(blockId, "pi_balance_test_2", 210_600);
    const before = await loadBlock(blockId);

    const replay = await applyBalancePaid(blockId, "pi_balance_test_2", 210_600);
    expect(replay.ok).toBe(false);

    const after = await loadBlock(blockId);
    expect(after.balancePaidAt!.getTime()).toBe(before.balancePaidAt!.getTime());
  });

  it("refuses a block whose deposit has not landed", async () => {
    const blockId = await commit();
    const res = await applyBalancePaid(blockId, "pi_balance_test_3", 210_600);
    expect(res.ok).toBe(false);

    const block = await loadBlock(blockId);
    expect(block.balancePaidAt).toBeNull();
  });
});

describe("POST /api/rentals/blocks/:token/pay", () => {
  it("422s once the block is fully paid", async () => {
    const blockId = await commit();
    await applyDepositPaid(blockId, "pi_deposit_test_6", 70_200);
    await applyBalancePaid(blockId, "pi_balance_test_4", 210_600);

    const block = await loadBlock(blockId);
    const token = await mintBlockToken(block);

    const res = await apiFetch(`/api/rentals/blocks/${token}/pay`, { method: "POST" });
    expect(res.status).toBe(422);
  });

  it("422s a cancelled block", async () => {
    const blockId = await commit();
    await getDb()
      .update(fieldRentalBlocks)
      .set({ status: "cancelled", cancelledAt: new Date() })
      .where(eq(fieldRentalBlocks.id, blockId));

    const block = await loadBlock(blockId);
    const token = await mintBlockToken(block);

    const res = await apiFetch(`/api/rentals/blocks/${token}/pay`, { method: "POST" });
    expect(res.status).toBe(422);
  });

  it("404s an unknown token", async () => {
    const res = await apiFetch(
      "/api/rentals/blocks/bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb/pay",
      { method: "POST" },
    );
    expect(res.status).toBe(404);
  });

  itWithStripe("mints a deposit Checkout Session without any auth cookie", async () => {
    const blockId = await commit();
    const block = await loadBlock(blockId);
    const token = await mintBlockToken(block);

    const res = await apiFetch(`/api/rentals/blocks/${token}/pay`, { method: "POST" });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(String(body.checkoutUrl)).toContain("checkout.stripe.com");
  });

  itWithStripe("mints a balance Checkout Session once the deposit has landed", async () => {
    const blockId = await commit();
    await applyDepositPaid(blockId, "pi_deposit_test_7", 70_200);
    const block = await loadBlock(blockId);
    const token = await mintBlockToken(block);

    const res = await apiFetch(`/api/rentals/blocks/${token}/pay`, { method: "POST" });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(String(body.checkoutUrl)).toContain("checkout.stripe.com");
  });
});

describe("admin payment-link endpoints", () => {
  it("refuses a non-admin", async () => {
    const blockId = await commit();
    const res = await apiFetch(`/api/admin/rentals/blocks/${blockId}/deposit-link`, {
      method: "POST",
      cookie: parent,
    });
    expect([401, 403]).toContain(res.status);
  });

  it("422s a deposit link for a block that is not awaiting one", async () => {
    const blockId = await commit();
    await applyDepositPaid(blockId, "pi_deposit_test_8", 70_200);
    const res = await apiFetch(`/api/admin/rentals/blocks/${blockId}/deposit-link`, {
      method: "POST",
      cookie: admin,
    });
    expect(res.status).toBe(422);
  });

  it("422s a balance link before the deposit has landed", async () => {
    const blockId = await commit();
    const res = await apiFetch(`/api/admin/rentals/blocks/${blockId}/balance-link`, {
      method: "POST",
      cookie: admin,
    });
    expect(res.status).toBe(422);
  });

  it("422s a balance link once the balance is settled", async () => {
    const blockId = await commit();
    await applyDepositPaid(blockId, "pi_deposit_test_9", 70_200);
    await applyBalancePaid(blockId, "pi_balance_test_5", 210_600);
    const res = await apiFetch(`/api/admin/rentals/blocks/${blockId}/balance-link`, {
      method: "POST",
      cookie: admin,
    });
    expect(res.status).toBe(422);
  });
});
