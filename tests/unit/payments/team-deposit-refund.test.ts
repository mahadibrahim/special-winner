/**
 * maybeRefundTeamDeposit is real-money code: it decides whether the
 * captain's $200 deposit comes back in full, in part, or is forfeited, and
 * fires the actual Stripe refund. This suite mocks the db (passed in as a
 * parameter, so no @/lib/db module mock is needed) and Stripe/ops/email/
 * alert/posthog side-effect modules, so the money math and the crash-
 * recovery/race guards are pinned without a real Postgres or Stripe account.
 *
 * The fakeDb models `team_registrations.deposit_refund_status` as a REAL
 * tiny state machine (a single `state.status` string mutated only by
 * conditional UPDATEs that check the expected prior value, exactly like
 * Postgres would) rather than a simple call-counting flag — this lets the
 * "processing re-entry" and "concurrent finalize race" tests exercise the
 * actual guard logic instead of a testing artifact.
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
  seasonMinAge?: number | null;
  ageGroupMinAge?: number | null;
  /** Make the revert-to-'none' UPDATE throw, to exercise the second-alert path. */
  revertThrows?: boolean;
}

function makeFakeDb(opts: FakeDbOpts = {}) {
  const {
    teamExists = true,
    teamFields = baseTeamFields(),
    initialStatus = "none",
    seasonMinAge = 10,
    ageGroupMinAge = null,
    revertThrows = false,
  } = opts;

  const state = { status: initialStatus };
  const calls: { updates: Record<string, unknown>[]; inserts: Record<string, unknown>[] } = {
    updates: [],
    inserts: [],
  };

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

          // Claim: none -> processing.
          if (vals.depositRefundStatus === "processing") {
            if (state.status === "none") {
              state.status = "processing";
              return whereResult([{ id: TEAM_ID }]);
            }
            return whereResult([]);
          }

          // Revert: processing -> none.
          if (vals.depositRefundStatus === "none") {
            if (revertThrows) {
              throw new Error("db revert failed");
            }
            if (state.status === "processing") {
              state.status = "none";
            }
            return whereResult([]);
          }

          // Finalize: processing -> {refunded|partially_refunded|forfeited},
          // identified by the extra stamp columns riding along.
          if ("depositRefundId" in vals || "depositRefundedCents" in vals) {
            if (state.status === "processing") {
              state.status = vals.depositRefundStatus as string;
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
    hoisted.state.stripe!.refunds.create.mockResolvedValueOnce({ id: "re_full_1", amount: DEPOSIT_CENTS });
    const { fakeDb, calls } = makeFakeDb();

    const result = await maybeRefundTeamDeposit(fakeDb as never, {
      teamId: TEAM_ID,
      trigger: "full_collection",
    });

    expect(result).toEqual({ status: "refunded" });

    expect(hoisted.state.stripe!.refunds.list).toHaveBeenCalledWith({ payment_intent: DEPOSIT_PI });
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
    hoisted.state.stripe!.refunds.create.mockResolvedValueOnce({
      id: "re_partial_1",
      amount: DEPOSIT_CENTS - 5000,
    });
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
    hoisted.state.stripe!.refunds.create.mockResolvedValueOnce({ id: "re_zero_1", amount: DEPOSIT_CENTS });
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

  it("forfeits the deposit with no Stripe call when shortfall >= depositCents, and still emails the captain", async () => {
    const { fakeDb, calls } = makeFakeDb();

    const result = await maybeRefundTeamDeposit(fakeDb as never, {
      teamId: TEAM_ID,
      trigger: "deadline_settle",
      shortfallCents: DEPOSIT_CENTS,
    });

    expect(result).toEqual({ status: "forfeited" });
    expect(hoisted.state.stripe!.refunds.list).not.toHaveBeenCalled();
    expect(hoisted.state.stripe!.refunds.create).not.toHaveBeenCalled();
    expect(calls.inserts).toHaveLength(0);
    expect(sendOpsPing).not.toHaveBeenCalled();

    const stamp = calls.updates.find((u) => "depositRefundedCents" in u);
    expect(stamp?.depositRefundedCents).toBeNull();
    expect(stamp?.depositRefundedAt).toBeInstanceOf(Date);

    // Fix #8: forfeit is not silent — the captain still hears about it.
    expect(sendTeamDepositRefundedEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        outcome: "forfeited",
        refundedCents: undefined,
        depositCents: DEPOSIT_CENTS,
        shortfallCents: DEPOSIT_CENTS,
      }),
    );
  });

  it("treats a computed refund of <= 0 (no real deposit) as a silent forfeit — no Stripe, no email", async () => {
    const { fakeDb, calls } = makeFakeDb({ teamFields: baseTeamFields({ depositCents: 0 }) });

    const result = await maybeRefundTeamDeposit(fakeDb as never, {
      teamId: TEAM_ID,
      trigger: "full_collection",
    });

    expect(result).toEqual({ status: "forfeited" });
    expect(hoisted.state.stripe!.refunds.list).not.toHaveBeenCalled();
    expect(hoisted.state.stripe!.refunds.create).not.toHaveBeenCalled();
    expect(calls.inserts).toHaveLength(0);
    expect(sendOpsPing).not.toHaveBeenCalled();
    // Nothing true to tell the captain when there was never a real deposit.
    expect(sendTeamDepositRefundedEmail).not.toHaveBeenCalled();
  });

  it("re-enters a row stuck in 'processing' (crashed prior attempt) and reconciles against an existing Stripe refund instead of creating a second one", async () => {
    hoisted.state.stripe!.refunds.list.mockResolvedValueOnce({
      data: [{ id: "re_prior_1", amount: DEPOSIT_CENTS, metadata: { kind: "team_deposit_release" } }],
    });
    const { fakeDb, calls, state } = makeFakeDb({ initialStatus: "processing" });

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

  it("recomputes the outcome from the reconciled amount when it differs from the locally-computed one (amount-mismatch safety)", async () => {
    // Reconciled amount is LESS than what a fresh deadline_settle computation
    // would have produced — Stripe's number must win.
    hoisted.state.stripe!.refunds.list.mockResolvedValueOnce({
      data: [{ id: "re_prior_2", amount: 1000, metadata: { kind: "team_deposit_release" } }],
    });
    const { fakeDb } = makeFakeDb({ initialStatus: "processing" });

    const result = await maybeRefundTeamDeposit(fakeDb as never, {
      teamId: TEAM_ID,
      trigger: "deadline_settle",
      shortfallCents: 5000, // would have computed a 15000-cent refund fresh
    });

    expect(result).toEqual({ status: "partial" });
    expect(hoisted.state.stripe!.refunds.create).not.toHaveBeenCalled();
    expect(sendTeamDepositRefundedEmail).toHaveBeenCalledWith(
      expect.objectContaining({ outcome: "partially_refunded", refundedCents: 1000 }),
    );
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

  it("only one of two concurrent calls wins the finalize and fires the bookkeeping once", async () => {
    // Same idempotency key => Stripe would return the SAME refund object to
    // both callers in reality; model that with a stable resolved value
    // rather than mockResolvedValueOnce.
    hoisted.state.stripe!.refunds.create.mockImplementation(async () => ({
      id: "re_race_1",
      amount: DEPOSIT_CENTS,
    }));
    const { fakeDb } = makeFakeDb();

    const [a, b] = await Promise.all([
      maybeRefundTeamDeposit(fakeDb as never, { teamId: TEAM_ID, trigger: "full_collection" }),
      maybeRefundTeamDeposit(fakeDb as never, { teamId: TEAM_ID, trigger: "full_collection" }),
    ]);

    const statuses = [a.status, b.status].sort();
    expect(statuses).toEqual(["refunded", "skipped"]);
    const loser = [a, b].find((r) => r.status === "skipped");
    expect(loser).toEqual({ status: "skipped", reason: "already_settled" });

    // Whichever call(s) reached Stripe, only the FINALIZE winner does the
    // rest of the bookkeeping — never twice.
    expect(sendOpsPing).toHaveBeenCalledTimes(1);
    expect(sendTeamDepositRefundedEmail).toHaveBeenCalledTimes(1);
  });

  it("logs the alert BEFORE reverting, and reverts the claim to 'none', when the Stripe refund call throws", async () => {
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
    hoisted.state.stripe!.refunds.create.mockResolvedValueOnce({ id: "re_ledger_fail", amount: DEPOSIT_CENTS });
    const { fakeDb } = makeFakeDb();
    const originalInsert = fakeDb.insert;
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
    void originalInsert;
  });
});
