/**
 * Integration: the block-aware expiry, reminder and completion sweeps.
 *
 * The regression test at the top is the important one: the per-session
 * `expirePendingRentals` sweep must never touch a block's rows. Every session
 * of an unpaid block carries the block's deposit expiry, so the old unguarded
 * sweep cancelled them one at a time while the deposit link stayed live,
 * leaving the renter paying for a schedule that had already been dismantled.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { and, eq, inArray } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { fieldRentals } from "@/lib/db/schema/field-rentals";
import { fieldRentalBlocks } from "@/lib/db/schema/field-rental-blocks";
import { resourceBlocks } from "@/lib/db/schema/scheduling";
import { selfServiceTokens } from "@/lib/db/schema/self-service-tokens";
import { createRentalBlock, type CreateBlockInput } from "@/lib/rentals/blocks/create";
import {
  applyBalancePaid,
  applyDepositPaid,
  balanceReminderStage,
  completeFinishedBlocks,
  expireUnpaidRentalBlocks,
  sendBlockBalanceReminders,
} from "@/lib/rentals/blocks/lifecycle";
import { expirePendingRentals } from "@/lib/rentals/expire";
import {
  E2E_ORG_ID,
  E2E_RENTAL_VENUE_ID,
  resolveE2ELocationId,
  resolveE2EAdminUserId,
} from "@/lib/db/seeds/seed-e2e-tests";

const BASE_URL = process.env.TEST_BASE_URL ?? "http://localhost:4321";
const CRON_SECRET = process.env.CRON_SECRET ?? "";

const TZ = "America/New_York";
const DAY_MS = 86_400_000;
const blockIds: string[] = [];

let locationId: string;
let adminUserId: string;

// Every block needs its OWN slot — see the same note in payment.test.ts. The
// three cases below that supply their own pattern also draw from this cursor,
// so a distinct month range is no longer the only thing keeping them apart.
// The 2700-3099 window keeps this spec clear of payment.test.ts.
const RUN_BASE_YEAR = 2700 + Math.floor(Math.random() * 400);
let yearCursor = 0;
const nextYear = () => RUN_BASE_YEAR + yearCursor++;

function input(overrides: Partial<CreateBlockInput> = {}): CreateBlockInput {
  const year = nextYear();
  return {
    organizationId: E2E_ORG_ID,
    locationId,
    brand: "soccerone",
    label: `Sweep Block ${Math.random().toString(36).slice(2, 8)}`,
    renterUserId: null,
    renterName: "Sweep Tester",
    renterEmail: "sweep-tester@test.aspiresports.com",
    renterPhone: null,
    partySize: 12,
    purpose: "team practice",
    notes: null,
    pattern: {
      timeZone: TZ,
      firstDate: `${year}-01-06`,
      lastDate: `${year}-02-28`,
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

/** Ledger rows still held by this block's sessions. */
async function ledgerRowCount(sessionIds: string[]): Promise<number> {
  if (sessionIds.length === 0) return 0;
  const rows = await getDb()
    .select({ id: resourceBlocks.id })
    .from(resourceBlocks)
    .where(
      and(
        eq(resourceBlocks.sourceType, "rental"),
        inArray(resourceBlocks.sourceId, sessionIds),
      ),
    );
  return rows.length;
}

beforeAll(async () => {
  locationId = await resolveE2ELocationId();
  adminUserId = await resolveE2EAdminUserId();
});

afterAll(async () => {
  const db = getDb();
  if (blockIds.length) {
    await db.delete(selfServiceTokens).where(inArray(selfServiceTokens.targetId, blockIds));
    await db.delete(fieldRentals).where(inArray(fieldRentals.blockId, blockIds));
    await db.delete(fieldRentalBlocks).where(inArray(fieldRentalBlocks.id, blockIds));
  }
});

describe("expirePendingRentals", () => {
  it("expirePendingRentals leaves block sessions alone", async () => {
    // A block session past its payment expiry must NOT be cancelled piecemeal:
    // the block-level sweep cancels the whole block together, otherwise a live
    // deposit link points at a half-destroyed schedule.
    const blockId = await commit();
    await getDb()
      .update(fieldRentals)
      .set({ paymentExpiresAt: new Date(Date.now() - 60_000) })
      .where(eq(fieldRentals.blockId, blockId));

    await expirePendingRentals();

    const sessions = await loadSessions(blockId);
    expect(sessions.length).toBeGreaterThan(0);
    expect(sessions.every((s) => s.status === "pending_payment")).toBe(true);
  });
});

describe("expireUnpaidRentalBlocks", () => {
  it("cancels a lapsed block together with every session and frees the ledger", async () => {
    const blockId = await commit();
    const before = await loadSessions(blockId);
    const sessionIds = before.map((s) => s.id);
    expect(await ledgerRowCount(sessionIds)).toBeGreaterThan(0);

    await getDb()
      .update(fieldRentalBlocks)
      .set({ depositExpiresAt: new Date(Date.now() - 60_000) })
      .where(eq(fieldRentalBlocks.id, blockId));

    const res = await expireUnpaidRentalBlocks();
    expect(res.expired).toBeGreaterThanOrEqual(1);

    const block = await loadBlock(blockId);
    expect(block.status).toBe("cancelled");
    expect(block.cancelledAt).not.toBeNull();

    const sessions = await loadSessions(blockId);
    expect(sessions.every((s) => s.status === "cancelled")).toBe(true);
    expect(await ledgerRowCount(sessionIds)).toBe(0);
  });

  it("ignores a block whose deposit has been paid", async () => {
    const year = nextYear();
    const blockId = await commit({
      pattern: {
        timeZone: TZ,
        firstDate: `${year}-03-03`,
        lastDate: `${year}-04-28`,
        days: [
          {
            weekday: 2,
            startMinute: 1200,
            durationMinutes: 60,
            venueIds: [E2E_RENTAL_VENUE_ID],
          },
        ],
      },
    });
    await applyDepositPaid(blockId, "pi_sweep_deposit_1", 70_200);

    // A stale expiry left behind on a paid block must not resurrect the sweep.
    await getDb()
      .update(fieldRentalBlocks)
      .set({ depositExpiresAt: new Date(Date.now() - 60_000) })
      .where(eq(fieldRentalBlocks.id, blockId));

    await expireUnpaidRentalBlocks();

    const block = await loadBlock(blockId);
    expect(block.status).toBe("active");
    const sessions = await loadSessions(blockId);
    expect(sessions.every((s) => s.status === "confirmed")).toBe(true);
  });
});

describe("balanceReminderStage", () => {
  const due = new Date("2090-02-01T00:00:00.000Z");

  it("opens at T-14, escalates at T-3, and flags overdue at T+1", () => {
    expect(balanceReminderStage(due, new Date(due.getTime() - 20 * DAY_MS))).toBeNull();
    expect(balanceReminderStage(due, new Date(due.getTime() - 10 * DAY_MS))).toBe("t14");
    expect(balanceReminderStage(due, new Date(due.getTime() - 2 * DAY_MS))).toBe("t3");
    expect(balanceReminderStage(due, new Date(due.getTime() + 2 * DAY_MS))).toBe("overdue");
  });
});

describe("sendBlockBalanceReminders", () => {
  it("walks a block through t14, t3 and overdue without ever cancelling it", async () => {
    const year = nextYear();
    const blockId = await commit({
      pattern: {
        timeZone: TZ,
        firstDate: `${year}-05-05`,
        lastDate: `${year}-06-30`,
        days: [
          {
            weekday: 2,
            startMinute: 1200,
            durationMinutes: 60,
            venueIds: [E2E_RENTAL_VENUE_ID],
          },
        ],
      },
    });
    await applyDepositPaid(blockId, "pi_sweep_deposit_2", 70_200);

    const setDue = (offsetDays: number) =>
      getDb()
        .update(fieldRentalBlocks)
        .set({ balanceDueAt: new Date(Date.now() + offsetDays * DAY_MS) })
        .where(eq(fieldRentalBlocks.id, blockId));

    // Outside the ladder: nothing sent, nothing stamped.
    await setDue(20);
    await sendBlockBalanceReminders();
    expect((await loadBlock(blockId)).reminderStage).toBeNull();

    await setDue(10);
    await sendBlockBalanceReminders();
    expect((await loadBlock(blockId)).reminderStage).toBe("t14");
    const firstStamp = (await loadBlock(blockId)).lastReminderAt;
    expect(firstStamp).not.toBeNull();

    // Re-running the sweep at the same stage must not send again.
    await sendBlockBalanceReminders();
    expect((await loadBlock(blockId)).lastReminderAt!.getTime()).toBe(firstStamp!.getTime());

    await setDue(2);
    await sendBlockBalanceReminders();
    expect((await loadBlock(blockId)).reminderStage).toBe("t3");

    await setDue(-2);
    await sendBlockBalanceReminders();

    const block = await loadBlock(blockId);
    expect(block.reminderStage).toBe("overdue");
    // Never auto-cancel a deposit-paid block: an unpaid balance is a phone call.
    expect(block.status).toBe("active");
    const sessions = await loadSessions(blockId);
    expect(sessions.every((s) => s.status === "confirmed")).toBe(true);
  });
});

describe("completeFinishedBlocks", () => {
  it("marks a fully-paid block whose sessions have all ended completed", async () => {
    const year = nextYear();
    const blockId = await commit({
      pattern: {
        timeZone: TZ,
        firstDate: `${year}-07-07`,
        lastDate: `${year}-08-25`,
        days: [
          {
            weekday: 2,
            startMinute: 1200,
            durationMinutes: 60,
            venueIds: [E2E_RENTAL_VENUE_ID],
          },
        ],
      },
    });
    await applyDepositPaid(blockId, "pi_sweep_deposit_3", 70_200);
    await applyBalancePaid(blockId, "pi_sweep_balance_1", 210_600);

    // Still in the future: not finished.
    await completeFinishedBlocks();
    expect((await loadBlock(blockId)).status).toBe("active");

    // Drag every session into the past.
    const sessions = await loadSessions(blockId);
    for (const s of sessions) {
      const startsAt = new Date(Date.now() - 3 * DAY_MS);
      await getDb()
        .update(fieldRentals)
        .set({ startsAt, endsAt: new Date(startsAt.getTime() + 3_600_000) })
        .where(eq(fieldRentals.id, s.id));
    }

    const res = await completeFinishedBlocks();
    expect(res.completed).toBeGreaterThanOrEqual(1);
    expect((await loadBlock(blockId)).status).toBe("completed");
  });
});

describe("POST /api/cron/rental-block-sweeps", () => {
  it("runs the sweeps with the right secret", async () => {
    const res = await fetch(`${BASE_URL}/api/cron/rental-block-sweeps`, {
      method: "POST",
      headers: { "x-cron-secret": CRON_SECRET, Origin: BASE_URL },
    });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toHaveProperty("expiredBlocks");
    expect(json).toHaveProperty("remindersSent");
    expect(json).toHaveProperty("completedBlocks");
  });

  it("returns 401 when x-cron-secret is wrong", async () => {
    const res = await fetch(`${BASE_URL}/api/cron/rental-block-sweeps`, {
      method: "POST",
      headers: { "x-cron-secret": "nope", Origin: BASE_URL },
    });
    expect(res.status).toBe(401);
  });
});
