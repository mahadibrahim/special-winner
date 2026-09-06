/**
 * maybeRefundTeamDeposit is real-money code: it decides whether the
 * captain's $200 deposit comes back in full, in part, or is forfeited, and
 * fires the actual Stripe refund. This suite mocks the db (passed in as a
 * parameter, so no @/lib/db module mock is needed) and Stripe/ops/email/
 * alert/posthog side-effect modules, so the money math and the crash-
 * recovery/race guards are pinned without a real Postgres or Stripe account.
 *
 * The fakeDb models `team_registrations.deposit_refund_status` (and its
 * `updatedAt`) as a REAL tiny state machine (`state.status`/`state.updatedAt`,
 * mutated only by conditional UPDATEs that check the expected prior value,
 * exactly like Postgres would) — including the round-3 CLAIM predicate's
 * staleness check done in the SAME UPDATE as the "none" claim (`state.status
 * === "none" || isStaleProcessing`), so there is no separate app-side
 * re-check-then-decide step to fake around: the fakeDb's CLAIM branch IS
 * the SQL predicate.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const hoisted = vi.hoisted(() => ({
  state: {
    stripe: {
      refunds: {
        create: vi.fn(),
        list: vi.fn(async () => ({ data: [] as unknown[] })),
      },
    } as null | {
      refunds: { create: ReturnType<typeof vi.fn>; list: ReturnType<typeof vi.fn> };
    },
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

const captureServerException = vi.fn(async (..._args: any[]) => {});
vi.mock("@/lib/observability/server-error", () => ({
  captureServerException: (...args: any[]) => captureServerException(...args),
}));

const { maybeRefundTeamDeposit } = await import("@/lib/payments/team-deposit-refund");

const TEAM_ID = "team-1";
const ORG_ID = "org-1";
const DEPOSIT_PI = "pi_deposit_1";
const DEPOSIT_CENTS = 20000;

// Mirrors the source's SQL-side `interval '10 minutes'` staleness threshold.
const STALE_MS = 10 * 60 * 1000;
const STALE_AGE_MS = STALE_MS * 2; // comfortably stale
const FRESH_AGE_MS = 1000; // comfortably fresh

function baseTeamFields(overrides: Record<string, unknown> = {}) {
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
    ...overrides,
  };
}

interface FakeDbOpts {
  teamExists?: boolean;
  teamFields?: Record<string, unknown>;
  /** Seed the row's deposit_refund_status. Defaults to 'none'. */
  initialStatus?: string;
  /**
   * How old (ms before "now") the row's updatedAt is at test start. Only
   * matters when initialStatus is 'processing' — defaults to comfortably
   * STALE so existing re-entrant tests don't need to think about staleness
   * unless they're specifically testing that gate.
   */
  initialAgeMs?: number;
  seasonMinAge?: number | null;
  ageGroupMinAge?: number | null;
  /** Make the revert-to-'none' UPDATE throw, to exercise the second-alert path. */
  revertThrows?: boolean;
  /**
   * Force the NEXT claim UPDATE attempt to match 0 rows regardless of the
   * row's actual state — simulates a live TOCTOU race where some OTHER
   * process holds the row at the instant our UPDATE runs, without needing
   * true concurrent execution. Consumed after one use.
   */
  forceClaimMiss?: boolean;
  /**
   * Force the NEXT finalize UPDATE attempt to match 0 rows regardless of
   * the row's actual state — simulates an external actor changing
   * deposit_refund_status between our claim and our finalize (outside this
   * executor entirely), to exercise the finalize_lost_race_after_refund
   * alert without fabricating an unrealistic same-function double-claim.
   */
  forceFinalizeMiss?: boolean;
}

function makeFakeDb(opts: FakeDbOpts = {}) {
  const {
    teamExists = true,
    teamFields = baseTeamFields(),
    initialStatus = "none",
    initialAgeMs = STALE_AGE_MS,
    seasonMinAge = 10,
    ageGroupMinAge = null,
    revertThrows = false,
    forceClaimMiss = false,
    forceFinalizeMiss = false,
  } = opts;

  const state = {
    status: initialStatus,
    updatedAt: new Date(Date.now() - initialAgeMs),
  };
  const calls: { updates: Record<string, unknown>[]; inserts: Record<string, unknown>[] } = {
    updates: [],
    inserts: [],
  };
  let claimMissRemaining = forceClaimMiss ? 1 : 0;
  let finalizeMissRemaining = forceFinalizeMiss ? 1 : 0;

  function whereResult(returningValue: unknown[]) {
    return {
      returning: async () => returningValue,
      then: (resolve: (v: unknown) => void) => resolve(undefined),
    };
  }

  const fakeDb = {
    select: () => ({
      from: () => ({
        // Direct .where() (no join) — the post-failed-claim status re-check.
        where: () => ({
          limit: async () => [{ status: state.status }],
        }),
        // .innerJoin().leftJoin().where() — the initial team+season+ageGroup fetch.
        innerJoin: () => ({
          leftJoin: () => ({
            where: () => ({
              limit: async () =>
                teamExists
                  ? [
                      {
                        team: { ...teamFields, depositRefundStatus: state.status },
                        seasonMinAge,
                        ageGroupMinAge,
                      },
                    ]
                  : [],
            }),
          }),
        }),
      }),
    }),
    update: () => ({
      set: (vals: Record<string, unknown>) => ({
        where: () => {
          calls.updates.push(vals);

          // CLAIM: matches SQL's `status='none' OR (status='processing' AND
          // updated_at < now() - interval '10 minutes')`.
          if (vals.depositRefundStatus === "processing") {
            if (claimMissRemaining > 0) {
              claimMissRemaining -= 1;
              return whereResult([]);
            }
            const isStaleProcessing =
              state.status === "processing" &&
              Date.now() - state.updatedAt.getTime() >= STALE_MS;
            if (state.status === "none" || isStaleProcessing) {
              state.status = "processing";
              state.updatedAt = new Date();
              return whereResult([{ id: TEAM_ID }]);
            }
            return whereResult([]);
          }

          // REVERT: processing -> none.
          if (vals.depositRefundStatus === "none") {
            if (revertThrows) {
              throw new Error("db revert failed");
            }
            state.status = "none";
            state.updatedAt = new Date();
            return whereResult([]);
          }

          // FINALIZE: processing -> {refunded|partially_refunded|forfeited}.
          if ("depositRefundId" in vals || "depositRefundedCents" in vals) {
            if (finalizeMissRemaining > 0) {
              finalizeMissRemaining -= 1;
              return whereResult([]);
            }
            if (state.status === "processing") {
              state.status = vals.depositRefundStatus as string;
              state.updatedAt = new Date();
              return whereResult([{ id: TEAM_ID }]);
            }
            return whereResult([]);
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

  return { fakeDb, calls, state };
}

function refundObj(overrides: Record<string, unknown> = {}) {
  return {
    id: "re_1",
    amount: DEPOSIT_CENTS,
    status: "succeeded",
    metadata: { kind: "team_deposit_release" },
    ...overrides,
  };
}

describe("maybeRefundTeamDeposit", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hoisted.state.stripe = {
      refunds: {
        create: vi.fn(),
        list: vi.fn(async () => ({ data: [] })),
      },
    };
  });

  it("refunds the full deposit on full_collection: reconciles (finds nothing), creates, and completes the bookkeeping", async () => {
    hoisted.state.stripe!.refunds.create.mockResolvedValueOnce(refundObj({ id: "re_full_1" }));
    const { fakeDb, calls } = makeFakeDb();

    const result = await maybeRefundTeamDeposit(fakeDb as never, {
      teamId: TEAM_ID,
      trigger: "full_collection",
    });

    expect(result).toEqual({ status: "refunded" });

    expect(hoisted.state.stripe!.refunds.list).toHaveBeenCalledWith({
      payment_intent: DEPOSIT_PI,
      limit: 100,
    });
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
      depositRefundStatus: "refunded",
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
        outcome: "refunded",
        refundedCents: DEPOSIT_CENTS,
        depositCents: DEPOSIT_CENTS,
        brand: "aspire",
      }),
    );
  });

  it("refunds deposit-minus-shortfall on deadline_settle when 0 < shortfall < depositCents", async () => {
    hoisted.state.stripe!.refunds.create.mockResolvedValueOnce(
      refundObj({ id: "re_partial_1", amount: DEPOSIT_CENTS - 5000 }),
    );
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
      expect.objectContaining({
        outcome: "partially_refunded",
        refundedCents: DEPOSIT_CENTS - 5000,
        shortfallCents: 5000,
      }),
    );
  });

  it("treats a non-positive shortfall on deadline_settle as a full refund", async () => {
    hoisted.state.stripe!.refunds.create.mockResolvedValueOnce(refundObj({ id: "re_zero_1" }));
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

  it("forfeits with no CREATE call when shortfall >= depositCents, but still RECONCILEs first (unconditional) and emails the captain", async () => {
    const { fakeDb, calls } = makeFakeDb();

    const result = await maybeRefundTeamDeposit(fakeDb as never, {
      teamId: TEAM_ID,
      trigger: "deadline_settle",
      shortfallCents: DEPOSIT_CENTS,
    });

    expect(result).toEqual({ status: "forfeited" });
    // Round 3: RECONCILE is now unconditional — even a claim that computes
    // forfeited checks Stripe first (a lost-response create could have
    // actually moved money on an earlier crashed attempt).
    expect(hoisted.state.stripe!.refunds.list).toHaveBeenCalledWith({
      payment_intent: DEPOSIT_PI,
      limit: 100,
    });
    expect(hoisted.state.stripe!.refunds.create).not.toHaveBeenCalled();
    expect(calls.inserts).toHaveLength(0);
    expect(sendOpsPing).not.toHaveBeenCalled();

    const stamp = calls.updates.find((u) => "depositRefundedCents" in u);
    expect(stamp?.depositRefundedCents).toBeNull();
    expect(stamp?.depositRefundedAt).toBeInstanceOf(Date);

    expect(sendTeamDepositRefundedEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        outcome: "forfeited",
        refundedCents: undefined,
        depositCents: DEPOSIT_CENTS,
        shortfallCents: DEPOSIT_CENTS,
      }),
    );
  });

  it("treats a computed refund of <= 0 (no real deposit) as a silent forfeit — still reconciles, but no email", async () => {
    const { fakeDb, calls } = makeFakeDb({ teamFields: baseTeamFields({ depositCents: 0 }) });

    const result = await maybeRefundTeamDeposit(fakeDb as never, {
      teamId: TEAM_ID,
      trigger: "full_collection",
    });

    expect(result).toEqual({ status: "forfeited" });
    expect(hoisted.state.stripe!.refunds.list).toHaveBeenCalledTimes(1);
    expect(hoisted.state.stripe!.refunds.create).not.toHaveBeenCalled();
    expect(calls.inserts).toHaveLength(0);
    expect(sendOpsPing).not.toHaveBeenCalled();
    // Nothing true to tell the captain when there was never a real deposit.
    expect(sendTeamDepositRefundedEmail).not.toHaveBeenCalled();
  });

  it("claims a STALE row stuck in 'processing' (crashed prior attempt) via the SAME atomic UPDATE as a fresh claim, and reconciles against an existing Stripe refund instead of creating a second one", async () => {
    hoisted.state.stripe!.refunds.list.mockResolvedValueOnce({
      data: [refundObj({ id: "re_prior_1" })],
    });
    const { fakeDb, calls, state } = makeFakeDb({ initialStatus: "processing", initialAgeMs: STALE_AGE_MS });

    const result = await maybeRefundTeamDeposit(fakeDb as never, {
      teamId: TEAM_ID,
      trigger: "full_collection",
    });

    expect(result).toEqual({ status: "refunded" });
    expect(hoisted.state.stripe!.refunds.create).not.toHaveBeenCalled();
    expect(state.status).toBe("refunded");

    const finalStamp = calls.updates.find((u) => "depositRefundId" in u);
    expect(finalStamp).toMatchObject({
      depositRefundId: "re_prior_1",
      depositRefundedCents: DEPOSIT_CENTS,
    });
    expect(calls.inserts).toHaveLength(1);
    expect(sendOpsPing).toHaveBeenCalledTimes(1);
    expect(sendTeamDepositRefundedEmail).toHaveBeenCalledTimes(1);
  });

  it("recomputes the outcome from the reconciled amount when it differs from the locally-computed one, and derives coherent email arithmetic from the ACTUAL amounts", async () => {
    // Reconciled amount is LESS than what a fresh deadline_settle computation
    // would have produced — Stripe's number must win, and the email's
    // shortfall figure must be re-derived from it (depositCents - refundCents),
    // NOT the stale opts.shortfallCents.
    const reconciledAmount = 1000;
    hoisted.state.stripe!.refunds.list.mockResolvedValueOnce({
      data: [refundObj({ id: "re_prior_2", amount: reconciledAmount })],
    });
    const { fakeDb } = makeFakeDb({ initialStatus: "processing", initialAgeMs: STALE_AGE_MS });

    const result = await maybeRefundTeamDeposit(fakeDb as never, {
      teamId: TEAM_ID,
      trigger: "deadline_settle",
      shortfallCents: 5000, // would have computed a 15000-cent refund fresh — must be ignored
    });

    expect(result).toEqual({ status: "partial" });
    expect(hoisted.state.stripe!.refunds.create).not.toHaveBeenCalled();
    expect(sendTeamDepositRefundedEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        outcome: "partially_refunded",
        refundedCents: reconciledAmount,
        // Coherent arithmetic: refundedCents + shortfallCents === depositCents.
        shortfallCents: DEPOSIT_CENTS - reconciledAmount,
      }),
    );
    const emailArgs = sendTeamDepositRefundedEmail.mock.calls[0][0];
    expect(emailArgs.refundedCents + emailArgs.shortfallCents).toBe(DEPOSIT_CENTS);
  });

  it("reconciles BEFORE taking the forfeit shortcut on a stale claim: adopts a prior partial refund even though the fresh computation says forfeited", async () => {
    // Fresh computation: shortfall (25000) >= depositCents (20000) => would
    // normally forfeit outright. But a crashed PRIOR attempt already moved
    // SOME money (a smaller shortfall at the time) — that must be adopted,
    // not silently forgotten by taking the forfeit shortcut.
    const priorAmount = 8000;
    hoisted.state.stripe!.refunds.list.mockResolvedValueOnce({
      data: [refundObj({ id: "re_prior_partial", amount: priorAmount })],
    });
    const { fakeDb, calls } = makeFakeDb({ initialStatus: "processing", initialAgeMs: STALE_AGE_MS });

    const result = await maybeRefundTeamDeposit(fakeDb as never, {
      teamId: TEAM_ID,
      trigger: "deadline_settle",
      shortfallCents: 25000,
    });

    expect(result).toEqual({ status: "partial" });
    expect(hoisted.state.stripe!.refunds.list).toHaveBeenCalledWith({
      payment_intent: DEPOSIT_PI,
      limit: 100,
    });
    expect(hoisted.state.stripe!.refunds.create).not.toHaveBeenCalled();
    const finalStamp = calls.updates.find((u) => "depositRefundId" in u);
    expect(finalStamp).toMatchObject({
      depositRefundStatus: "partially_refunded",
      depositRefundId: "re_prior_partial",
      depositRefundedCents: priorAmount,
    });
    expect(calls.inserts).toHaveLength(1);
    expect(sendOpsPing).toHaveBeenCalledTimes(1);
  });

  it("confirms a clean forfeit (after reconciling) when nothing usable is found", async () => {
    const { fakeDb, calls } = makeFakeDb({ initialStatus: "processing", initialAgeMs: STALE_AGE_MS });

    const result = await maybeRefundTeamDeposit(fakeDb as never, {
      teamId: TEAM_ID,
      trigger: "deadline_settle",
      shortfallCents: DEPOSIT_CENTS,
    });

    expect(result).toEqual({ status: "forfeited" });
    expect(hoisted.state.stripe!.refunds.list).toHaveBeenCalledWith({
      payment_intent: DEPOSIT_PI,
      limit: 100,
    });
    expect(hoisted.state.stripe!.refunds.create).not.toHaveBeenCalled();
    const stamp = calls.updates.find((u) => "depositRefundedCents" in u);
    expect(stamp?.depositRefundedCents).toBeNull();
  });

  it("ignores a failed/canceled refund found via reconcile and creates a fresh one instead of adopting it", async () => {
    hoisted.state.stripe!.refunds.list.mockResolvedValueOnce({
      data: [refundObj({ id: "re_bank_rejected", status: "failed" })],
    });
    hoisted.state.stripe!.refunds.create.mockResolvedValueOnce(refundObj({ id: "re_fresh_1" }));
    const { fakeDb } = makeFakeDb();

    const result = await maybeRefundTeamDeposit(fakeDb as never, {
      teamId: TEAM_ID,
      trigger: "full_collection",
    });

    expect(result).toEqual({ status: "refunded" });
    expect(hoisted.state.stripe!.refunds.create).toHaveBeenCalledTimes(1);
    expect(sendTeamDepositRefundedEmail).toHaveBeenCalledWith(
      expect.objectContaining({ refundedCents: DEPOSIT_CENTS }),
    );
    // The bank-rejected refund's id must never surface as if it were live.
    const opsPingArgs = sendOpsPing.mock.calls[0][1];
    expect(opsPingArgs.eventId).toBe("re_fresh_1");
  });

  it("adopts an UNTAGGED refund on the deposit PI but alerts about it (could be a Stripe-Dashboard goodwill refund)", async () => {
    hoisted.state.stripe!.refunds.list.mockResolvedValueOnce({
      data: [refundObj({ id: "re_untagged_1", metadata: {} })],
    });
    const { fakeDb } = makeFakeDb();

    const result = await maybeRefundTeamDeposit(fakeDb as never, {
      teamId: TEAM_ID,
      trigger: "full_collection",
    });

    expect(result).toEqual({ status: "refunded" });
    expect(hoisted.state.stripe!.refunds.create).not.toHaveBeenCalled();
    expect(logAlert).toHaveBeenCalledWith(
      "team_deposit_refund_failed",
      expect.objectContaining({ adopted_untagged: true, stripeRefundId: "re_untagged_1" }),
    );
    // Still completes the bookkeeping — adoption isn't blocked, just flagged.
    expect(sendTeamDepositRefundedEmail).toHaveBeenCalledTimes(1);
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

  it("skips a team whose deposit refund is already terminally settled", async () => {
    const { fakeDb } = makeFakeDb({ initialStatus: "refunded" });

    const result = await maybeRefundTeamDeposit(fakeDb as never, {
      teamId: TEAM_ID,
      trigger: "full_collection",
    });

    expect(result).toEqual({ status: "skipped", reason: "already_settled" });
    expect(hoisted.state.stripe!.refunds.create).not.toHaveBeenCalled();
  });

  it("skips a team with no deposit PaymentIntent on file", async () => {
    const { fakeDb } = makeFakeDb({ teamFields: baseTeamFields({ depositPaymentIntentId: null }) });

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

  it("skips 'in_flight' — without touching Stripe or the row — when 'processing' is FRESH (the claim UPDATE's stale-check correctly fails to match)", async () => {
    const { fakeDb, calls, state } = makeFakeDb({ initialStatus: "processing", initialAgeMs: FRESH_AGE_MS });

    const result = await maybeRefundTeamDeposit(fakeDb as never, {
      teamId: TEAM_ID,
      trigger: "full_collection",
    });

    expect(result).toEqual({ status: "skipped", reason: "in_flight" });
    expect(hoisted.state.stripe!.refunds.list).not.toHaveBeenCalled();
    expect(hoisted.state.stripe!.refunds.create).not.toHaveBeenCalled();
    expect(logAlert).not.toHaveBeenCalled();
    // The row is untouched — no revert, no finalize, status unchanged.
    expect(state.status).toBe("processing");
    expect(calls.updates.filter((u) => u.depositRefundStatus === "none")).toHaveLength(0);
  });

  it("skips 'retryable_race' — not 'already_settled' — when the claim UPDATE misses but the row reads 'none' again on re-check (a live TOCTOU race)", async () => {
    const { fakeDb, calls, state } = makeFakeDb({ initialStatus: "none", forceClaimMiss: true });

    const result = await maybeRefundTeamDeposit(fakeDb as never, {
      teamId: TEAM_ID,
      trigger: "full_collection",
    });

    expect(result).toEqual({ status: "skipped", reason: "retryable_race" });
    expect(hoisted.state.stripe!.refunds.list).not.toHaveBeenCalled();
    expect(hoisted.state.stripe!.refunds.create).not.toHaveBeenCalled();
    expect(logAlert).not.toHaveBeenCalled();
    expect(state.status).toBe("none");
    expect(calls.updates).toHaveLength(1); // only the missed claim attempt
  });

  it("a STALE claim that itself fails DOES revert — real ownership on the recovery path, just like a fresh claim", async () => {
    hoisted.state.stripe!.refunds.list.mockRejectedValueOnce(new Error("stripe list down"));
    const { fakeDb, calls, state } = makeFakeDb({ initialStatus: "processing", initialAgeMs: STALE_AGE_MS });

    const result = await maybeRefundTeamDeposit(fakeDb as never, {
      teamId: TEAM_ID,
      trigger: "full_collection",
    });

    expect(result).toEqual({ status: "skipped", reason: "stripe_refund_failed" });
    expect(logAlert).toHaveBeenCalledWith(
      "team_deposit_refund_failed",
      expect.objectContaining({ error: "stripe list down" }),
    );
    // Reverted — this call claimed the row via the SAME atomic UPDATE as a
    // fresh claim, so it genuinely owns it and may revert on failure.
    expect(state.status).toBe("none");
    expect(calls.updates.some((u) => u.depositRefundStatus === "none")).toBe(true);
  });

  it("exactly one of two callers racing a STALE row claims it; the loser gets 'in_flight' immediately (no Stripe call, no finalize race)", async () => {
    hoisted.state.stripe!.refunds.create.mockImplementation(async () =>
      refundObj({ id: "re_race_1" }),
    );
    const { fakeDb } = makeFakeDb({ initialStatus: "processing", initialAgeMs: STALE_AGE_MS });

    const [a, b] = await Promise.all([
      maybeRefundTeamDeposit(fakeDb as never, { teamId: TEAM_ID, trigger: "full_collection" }),
      maybeRefundTeamDeposit(fakeDb as never, { teamId: TEAM_ID, trigger: "full_collection" }),
    ]);

    const statuses = [a.status, b.status].sort();
    expect(statuses).toEqual(["refunded", "skipped"]);
    const loser = [a, b].find((r) => r.status === "skipped");
    // Round 3: the claim UPDATE itself is the sole serialization point, so
    // the loser never gets far enough to race at finalize — it's turned
    // away at CLAIM as "in_flight" (the winner just refreshed updated_at).
    expect(loser).toEqual({ status: "skipped", reason: "in_flight" });

    expect(hoisted.state.stripe!.refunds.create).toHaveBeenCalledTimes(1);
    expect(sendOpsPing).toHaveBeenCalledTimes(1);
    expect(sendTeamDepositRefundedEmail).toHaveBeenCalledTimes(1);
    expect(logAlert).not.toHaveBeenCalled();
  });

  it("alerts finalize_lost_race_after_refund when a real refund is in hand but an OUT-OF-BAND status change loses the finalize race", async () => {
    hoisted.state.stripe!.refunds.create.mockResolvedValueOnce(refundObj({ id: "re_orphaned" }));
    const { fakeDb } = makeFakeDb({ forceFinalizeMiss: true });

    const result = await maybeRefundTeamDeposit(fakeDb as never, {
      teamId: TEAM_ID,
      trigger: "full_collection",
    });

    expect(result).toEqual({ status: "skipped", reason: "already_settled" });
    expect(logAlert).toHaveBeenCalledWith(
      "team_deposit_refund_failed",
      expect.objectContaining({
        error: "finalize_lost_race_after_refund",
        stripeRefundId: "re_orphaned",
      }),
    );
    // Genuinely orphaned — nothing recorded it.
    expect(sendOpsPing).not.toHaveBeenCalled();
    expect(sendTeamDepositRefundedEmail).not.toHaveBeenCalled();
  });

  it("logs the alert BEFORE reverting, and reverts the claim to 'none', when the Stripe refund call throws (fresh claim)", async () => {
    hoisted.state.stripe!.refunds.create.mockRejectedValueOnce(new Error("card_declined"));
    const { fakeDb, calls, state } = makeFakeDb();

    const result = await maybeRefundTeamDeposit(fakeDb as never, {
      teamId: TEAM_ID,
      trigger: "full_collection",
    });

    expect(result).toEqual({ status: "skipped", reason: "stripe_refund_failed" });
    expect(state.status).toBe("none");
    const revert = calls.updates.find((u) => u.depositRefundStatus === "none");
    expect(revert).toBeTruthy();
    expect(calls.inserts).toHaveLength(0);
    expect(logAlert).toHaveBeenCalledTimes(1);
    expect(logAlert).toHaveBeenCalledWith(
      "team_deposit_refund_failed",
      expect.objectContaining({
        teamRegistrationId: TEAM_ID,
        organizationId: ORG_ID,
        teamName: "The Strikers",
        error: "card_declined",
      }),
    );
    expect(sendTeamDepositRefundedEmail).not.toHaveBeenCalled();
  });

  it("logs a SECOND alert with a revert_failed marker when the revert-to-none UPDATE itself throws", async () => {
    hoisted.state.stripe!.refunds.create.mockRejectedValueOnce(new Error("card_declined"));
    const { fakeDb } = makeFakeDb({ revertThrows: true });

    const result = await maybeRefundTeamDeposit(fakeDb as never, {
      teamId: TEAM_ID,
      trigger: "full_collection",
    });

    expect(result).toEqual({ status: "skipped", reason: "stripe_refund_failed" });
    expect(logAlert).toHaveBeenCalledTimes(2);
    expect(logAlert).toHaveBeenNthCalledWith(
      1,
      "team_deposit_refund_failed",
      expect.objectContaining({ error: "card_declined" }),
    );
    expect(logAlert).toHaveBeenNthCalledWith(
      2,
      "team_deposit_refund_failed",
      expect.objectContaining({ revert_failed: true, error: "db revert failed" }),
    );
  });

  it("reverts the claim to 'none' and logs an alert when Stripe is not configured", async () => {
    hoisted.state.stripe = null;
    const { fakeDb, calls, state } = makeFakeDb();

    const result = await maybeRefundTeamDeposit(fakeDb as never, {
      teamId: TEAM_ID,
      trigger: "full_collection",
    });

    expect(result).toEqual({ status: "skipped", reason: "stripe_not_configured" });
    expect(state.status).toBe("none");
    const revert = calls.updates.find((u) => u.depositRefundStatus === "none");
    expect(revert).toBeTruthy();
    expect(logAlert).toHaveBeenCalledWith(
      "team_deposit_refund_failed",
      expect.objectContaining({ teamRegistrationId: TEAM_ID, error: "stripe-not-configured" }),
    );
  });

  it("logs an alert AND captures a server exception (not a bare console.error) when the ledger insert fails", async () => {
    hoisted.state.stripe!.refunds.create.mockResolvedValueOnce(refundObj({ id: "re_ledger_fail" }));
    const { fakeDb } = makeFakeDb();
    (fakeDb as any).insert = () => ({
      values: async () => {
        throw new Error("insert failed");
      },
    });

    const result = await maybeRefundTeamDeposit(fakeDb as never, {
      teamId: TEAM_ID,
      trigger: "full_collection",
    });

    // The refund itself is NOT rolled back over a ledger-write failure —
    // money already moved at Stripe.
    expect(result).toEqual({ status: "refunded" });
    expect(logAlert).toHaveBeenCalledWith(
      "team_deposit_refund_failed",
      expect.objectContaining({ phase: "ledger_insert", error: "insert failed" }),
    );
    expect(captureServerException).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({ component: "payments/team-deposit-refund" }),
    );
  });
});
