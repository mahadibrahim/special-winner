/**
 * maybeRefundTeamDeposit is real-money code: it decides whether the
 * captain's $200 deposit comes back in full, in part, or is forfeited, and
 * fires the actual Stripe refund. This suite mocks the db (passed in as a
 * parameter, so no @/lib/db module mock is needed — see the fakeDb factory
 * below) and Stripe/ops/email/alert side-effect modules, so the money math
 * and the race/failure guards are pinned without a real Postgres or Stripe
 * account.
 *
 * The fakeDb's `update()` dispatches on the SET payload shape (see comments
 * inline) because the executor issues several distinct UPDATEs against the
 * same table: the optimistic claim (sets depositRefundStatus to the FINAL
 * status, used with `.returning()` so the caller can detect a lost race),
 * the revert-on-failure (sets depositRefundStatus back to 'none'), the
 * forfeited stamp, and the post-Stripe-success stamp.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const hoisted = vi.hoisted(() => ({
  state: {
    stripe: { refunds: { create: vi.fn() } } as null | { refunds: { create: ReturnType<typeof vi.fn> } },
  },
}));

vi.mock("@/lib/stripe/client", () => ({
  get stripe() {
    return hoisted.state.stripe;
  },
  isStripeConfigured: () => hoisted.state.stripe !== null,
}));

const logAlert = vi.fn(async (..._args: any[]) => {});
vi.mock("@/lib/logging/alerts", () => ({
  logAlert: (...args: any[]) => logAlert(...args),
}));

const sendOpsPing = vi.fn(async (..._args: any[]) => "suppressed");
vi.mock("@/lib/ops/ping", () => ({
  sendOpsPing: (...args: any[]) => sendOpsPing(...args),
}));

const sendTeamDepositRefundedEmail = vi.fn(async (..._args: any[]) => ({ success: true }));
vi.mock("@/lib/email/send", () => ({
  sendTeamDepositRefundedEmail: (...args: any[]) => sendTeamDepositRefundedEmail(...args),
}));

const posthogCapture = vi.fn();
vi.mock("@/lib/posthog-server", () => ({
  getPostHogServer: () => ({ capture: posthogCapture }),
}));

const { maybeRefundTeamDeposit } = await import("@/lib/payments/team-deposit-refund");

const TEAM_ID = "team-1";
const ORG_ID = "org-1";
const DEPOSIT_PI = "pi_deposit_1";
const DEPOSIT_CENTS = 20000;

function baseTeamRow(overrides: Record<string, unknown> = {}) {
  return {
    id: TEAM_ID,
    organizationId: ORG_ID,
    seasonId: "season-1",
    captainUserId: "user-1",
    captainEmail: "captain@example.com",
    captainName: "Cap Tain",
    teamName: "The Strikers",
    brand: "aspire",
    depositCents: DEPOSIT_CENTS,
    depositPaymentIntentId: DEPOSIT_PI,
    depositRefundStatus: "none",
    ...overrides,
  };
}

interface FakeDbOpts {
  team?: Record<string, unknown> | null;
  seasonMinAge?: number | null;
  ageGroupMinAge?: number | null;
  /** Called once per claim-update attempt (index starting at 0); return
   *  false to simulate the row already being claimed (the race guard). */
  claimSucceedsOnAttempt?: (attemptIndex: number) => boolean;
}

function makeFakeDb(opts: FakeDbOpts = {}) {
  const {
    team = baseTeamRow(),
    seasonMinAge = 10,
    ageGroupMinAge = null,
    claimSucceedsOnAttempt = () => true,
  } = opts;

  const calls: { updates: Record<string, unknown>[]; inserts: Record<string, unknown>[] } = {
    updates: [],
    inserts: [],
  };
  let claimAttempt = 0;

  function whereResult(returningValue: unknown[]) {
    return {
      returning: async () => returningValue,
      // Thenable fallback for callers that `await` the chain WITHOUT
      // calling `.returning()` (the revert, forfeit-stamp, and
      // final-stamp updates).
      then: (resolve: (v: unknown) => void) => resolve(undefined),
    };
  }

  const fakeDb = {
    select: () => ({
      from: () => ({
        innerJoin: () => ({
          leftJoin: () => ({
            where: () => ({
              limit: async () =>
                team ? [{ team, seasonMinAge, ageGroupMinAge }] : [],
            }),
          }),
        }),
      }),
    }),
    update: () => ({
      set: (vals: Record<string, unknown>) => ({
        where: () => {
          calls.updates.push(vals);
          const isClaimAttempt =
            "depositRefundStatus" in vals && vals.depositRefundStatus !== "none";
          if (isClaimAttempt) {
            const idx = claimAttempt++;
            const won = claimSucceedsOnAttempt(idx);
            return whereResult(won ? [{ id: team!.id }] : []);
          }
          return whereResult([]);
        },
      }),
    }),
    insert: () => ({
      values: async (vals: Record<string, unknown>) => {
        calls.inserts.push(vals);
        return undefined;
      },
    }),
  };

  return { fakeDb, calls };
}

describe("maybeRefundTeamDeposit", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hoisted.state.stripe = { refunds: { create: vi.fn() } };
  });

  it("refunds the full deposit on full_collection and completes the bookkeeping", async () => {
    hoisted.state.stripe!.refunds.create.mockResolvedValueOnce({ id: "re_full_1" });
    const { fakeDb, calls } = makeFakeDb();

    const result = await maybeRefundTeamDeposit(fakeDb as never, {
      teamId: TEAM_ID,
      trigger: "full_collection",
    });

    expect(result).toEqual({ status: "refunded" });

    expect(hoisted.state.stripe!.refunds.create).toHaveBeenCalledWith(
      {
        payment_intent: DEPOSIT_PI,
        amount: DEPOSIT_CENTS,
        metadata: { kind: "team_deposit_release", team_registration_id: TEAM_ID },
      },
      { idempotencyKey: `${DEPOSIT_PI}:deposit-refund` },
    );

    expect(calls.inserts).toHaveLength(1);
    expect(calls.inserts[0]).toMatchObject({
      registrationId: null,
      teamRegistrationId: TEAM_ID,
      userId: "user-1",
      amountCents: DEPOSIT_CENTS,
      paymentType: "refund",
      status: "succeeded",
      stripePaymentIntentId: null,
      refundReason: "team_deposit_release",
    });

    const finalStamp = calls.updates.find((u) => "depositRefundId" in u);
    expect(finalStamp).toMatchObject({
      depositRefundId: "re_full_1",
      depositRefundedCents: DEPOSIT_CENTS,
    });

    expect(sendOpsPing).toHaveBeenCalledWith(
      ORG_ID,
      expect.objectContaining({ kind: "team_deposit_refunded", amountCents: DEPOSIT_CENTS }),
    );
    expect(sendTeamDepositRefundedEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "captain@example.com",
        captainName: "Cap Tain",
        teamName: "The Strikers",
        refundedCents: DEPOSIT_CENTS,
        shortfallCents: undefined,
      }),
    );
  });

  it("refunds deposit-minus-shortfall on deadline_settle when 0 < shortfall < depositCents", async () => {
    hoisted.state.stripe!.refunds.create.mockResolvedValueOnce({ id: "re_partial_1" });
    const { fakeDb, calls } = makeFakeDb();

    const result = await maybeRefundTeamDeposit(fakeDb as never, {
      teamId: TEAM_ID,
      trigger: "deadline_settle",
      shortfallCents: 5000,
    });

    expect(result).toEqual({ status: "partial" });
    expect(hoisted.state.stripe!.refunds.create).toHaveBeenCalledWith(
      expect.objectContaining({ amount: DEPOSIT_CENTS - 5000 }),
      expect.anything(),
    );
    const finalStamp = calls.updates.find((u) => "depositRefundId" in u);
    expect(finalStamp?.depositRefundedCents).toBe(DEPOSIT_CENTS - 5000);
    expect(sendTeamDepositRefundedEmail).toHaveBeenCalledWith(
      expect.objectContaining({ refundedCents: DEPOSIT_CENTS - 5000, shortfallCents: 5000 }),
    );
  });

  it("treats a non-positive shortfall on deadline_settle as a full refund", async () => {
    hoisted.state.stripe!.refunds.create.mockResolvedValueOnce({ id: "re_zero_1" });
    const { fakeDb } = makeFakeDb();

    const result = await maybeRefundTeamDeposit(fakeDb as never, {
      teamId: TEAM_ID,
      trigger: "deadline_settle",
      shortfallCents: 0,
    });

    expect(result).toEqual({ status: "refunded" });
    expect(hoisted.state.stripe!.refunds.create).toHaveBeenCalledWith(
      expect.objectContaining({ amount: DEPOSIT_CENTS }),
      expect.anything(),
    );
  });

  it("forfeits the deposit with no Stripe call when shortfall >= depositCents", async () => {
    const { fakeDb, calls } = makeFakeDb();

    const result = await maybeRefundTeamDeposit(fakeDb as never, {
      teamId: TEAM_ID,
      trigger: "deadline_settle",
      shortfallCents: DEPOSIT_CENTS,
    });

    expect(result).toEqual({ status: "forfeited" });
    expect(hoisted.state.stripe!.refunds.create).not.toHaveBeenCalled();
    expect(calls.inserts).toHaveLength(0);
    expect(sendTeamDepositRefundedEmail).not.toHaveBeenCalled();

    const stamp = calls.updates.find(
      (u) => "depositRefundedCents" in u && !("depositRefundStatus" in u),
    );
    expect(stamp?.depositRefundedCents).toBe(0);
    expect(stamp?.depositRefundedAt).toBeInstanceOf(Date);
  });

  it("skips an adult-season team without touching Stripe", async () => {
    const { fakeDb } = makeFakeDb({ seasonMinAge: 18, ageGroupMinAge: null });

    const result = await maybeRefundTeamDeposit(fakeDb as never, {
      teamId: TEAM_ID,
      trigger: "full_collection",
    });

    expect(result).toEqual({ status: "skipped", reason: "adult_season" });
    expect(hoisted.state.stripe!.refunds.create).not.toHaveBeenCalled();
  });

  it("skips a team whose deposit refund is already settled", async () => {
    const { fakeDb } = makeFakeDb({ team: baseTeamRow({ depositRefundStatus: "refunded" }) });

    const result = await maybeRefundTeamDeposit(fakeDb as never, {
      teamId: TEAM_ID,
      trigger: "full_collection",
    });

    expect(result).toEqual({ status: "skipped", reason: "already_settled" });
    expect(hoisted.state.stripe!.refunds.create).not.toHaveBeenCalled();
  });

  it("skips a team with no deposit PaymentIntent on file", async () => {
    const { fakeDb } = makeFakeDb({ team: baseTeamRow({ depositPaymentIntentId: null }) });

    const result = await maybeRefundTeamDeposit(fakeDb as never, {
      teamId: TEAM_ID,
      trigger: "full_collection",
    });

    expect(result).toEqual({ status: "skipped", reason: "no_deposit_pi" });
    expect(hoisted.state.stripe!.refunds.create).not.toHaveBeenCalled();
  });

  it("throws when deadline_settle is called without shortfallCents (programmer error)", async () => {
    const { fakeDb } = makeFakeDb();

    await expect(
      maybeRefundTeamDeposit(fakeDb as never, { teamId: TEAM_ID, trigger: "deadline_settle" }),
    ).rejects.toThrow(/shortfallCents/);
    expect(hoisted.state.stripe!.refunds.create).not.toHaveBeenCalled();
  });

  it("only one of two concurrent calls wins the conditional-update claim and refunds", async () => {
    hoisted.state.stripe!.refunds.create.mockResolvedValue({ id: "re_race_1" });
    let claimed = false;
    const { fakeDb } = makeFakeDb({
      claimSucceedsOnAttempt: () => {
        if (claimed) return false;
        claimed = true;
        return true;
      },
    });

    const [a, b] = await Promise.all([
      maybeRefundTeamDeposit(fakeDb as never, { teamId: TEAM_ID, trigger: "full_collection" }),
      maybeRefundTeamDeposit(fakeDb as never, { teamId: TEAM_ID, trigger: "full_collection" }),
    ]);

    const statuses = [a.status, b.status].sort();
    expect(statuses).toEqual(["refunded", "skipped"]);
    const raced = [a, b].find((r) => r.status === "skipped");
    expect(raced).toEqual({ status: "skipped", reason: "raced" });
    expect(hoisted.state.stripe!.refunds.create).toHaveBeenCalledTimes(1);
  });

  it("reverts the claim to 'none' and logs an alert when the Stripe refund call throws", async () => {
    hoisted.state.stripe!.refunds.create.mockRejectedValueOnce(new Error("card_declined"));
    const { fakeDb, calls } = makeFakeDb();

    const result = await maybeRefundTeamDeposit(fakeDb as never, {
      teamId: TEAM_ID,
      trigger: "full_collection",
    });

    expect(result).toEqual({ status: "skipped", reason: "stripe_refund_failed" });
    const revert = calls.updates.find((u) => u.depositRefundStatus === "none");
    expect(revert).toBeTruthy();
    expect(calls.inserts).toHaveLength(0);
    expect(logAlert).toHaveBeenCalledWith(
      "team_deposit_refund_failed",
      expect.objectContaining({ teamRegistrationId: TEAM_ID, error: "card_declined" }),
    );
    expect(sendTeamDepositRefundedEmail).not.toHaveBeenCalled();
  });

  it("reverts the claim to 'none' and logs an alert when Stripe is not configured", async () => {
    hoisted.state.stripe = null;
    const { fakeDb, calls } = makeFakeDb();

    const result = await maybeRefundTeamDeposit(fakeDb as never, {
      teamId: TEAM_ID,
      trigger: "full_collection",
    });

    expect(result).toEqual({ status: "skipped", reason: "stripe_not_configured" });
    const revert = calls.updates.find((u) => u.depositRefundStatus === "none");
    expect(revert).toBeTruthy();
    expect(logAlert).toHaveBeenCalledWith(
      "team_deposit_refund_failed",
      expect.objectContaining({ teamRegistrationId: TEAM_ID, error: "stripe-not-configured" }),
    );
  });
});
