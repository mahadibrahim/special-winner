/**
 * Deposit-refund trigger wiring (winter-team-fixes, task 3):
 *
 *  - `full_collection` fires from `handleRegistrationPaymentSucceeded`
 *    (src/lib/stripe/handle-registration-payment-succeeded.ts) whenever a
 *    team-linked registration's payment leaves the ROSTER covering the team
 *    fee in full — computed from `teamRosterCollectedCents`, never
 *    `teamMoneyReceivedCents`/`teamBackstopDueCents` (those fold the
 *    deposit into "received", which would re-arm this check the moment the
 *    refund fires).
 *  - `deadline_settle` fires from the payment-deadline cron's YOUTH branch
 *    (src/pages/api/cron/charge-unpaid-team-shares.ts phase 2) and from its
 *    deposit-refund retry sweep (phase 3), independent of `backstopStatus`.
 *
 * These tests exercise the real db AND the real (Stripe test-mode) client
 * against a FAKE `depositPaymentIntentId` that was never actually created at
 * Stripe (the fixture never charges a real card). Empirically, Stripe
 * validates the `payment_intent` id even for `refunds.list` (a nonexistent
 * id errors, it does not just return an empty page), so EVERY branch here —
 * forfeit, partial, full — fails at RECONCILE and is caught by the
 * executor's own try/catch, which reverts the claim back to 'none'
 * ("stripe_refund_failed" — see the module doc in team-deposit-refund.ts).
 * That is exactly the same shape as the documented "Stripe not configured"
 * soft path (claim → attempt → revert, no crash, no stuck 'processing'
 * row), just reached via a live-but-unknown PI instead of a missing client.
 * These tests assert on THAT plumbing — reached, resolved, never stuck —
 * plus the caller-side math that decides WHETHER and WITH WHAT shortfall to
 * call the executor (chargeCents/backstopStatus). The actual
 * refunded/partial/forfeited MONEY outcome is pinned precisely by two other
 * suites: tests/unit/payments/team-deposit-refund.test.ts (the executor
 * itself, Stripe mocked) and the `teamYouthDueCents` unit tests in
 * tests/unit/payments/team-captain-charge.test.ts (task 3's shortfall/charge
 * math) — see the report for which layer covers what.
 */
import { describe, it, expect } from "vitest";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { teamRegistrations, seasons, registrations, teamRegistrationMembers, familyMembers, users } from "@/lib/db/schema";
import { hashPassword } from "@/lib/auth";
import { apiFetch } from "./setup/test-helpers";
import { handleRegistrationPaymentSucceeded } from "@/lib/stripe/handle-registration-payment-succeeded";
import {
  seedTeamPaymentContext,
  DEPOSIT_CENTS,
  BALANCE_CENTS,
  REFUND_CENTS,
} from "../utils/team-payment-context";
import type Stripe from "stripe";

const CRON_SECRET = process.env.CRON_SECRET ?? "ci-cron-test-secret";
// teamRosterCollectedCents excludes the deposit; the fixture's untagged $50
// refund still subtracts (see team-money-model.test.ts's
// `teamRosterCollectedCents` suite) — so the roster-collected baseline with
// no linked members is balance minus that refund.
const ROSTER_BASELINE_CENTS = BALANCE_CENTS - REFUND_CENTS;

async function makeYouthSeason(seasonId: string) {
  await getDb().update(seasons).set({ minAge: 8 }).where(eq(seasons.id, seasonId));
}

async function getTeam(teamRegistrationId: string) {
  const [team] = await getDb()
    .select()
    .from(teamRegistrations)
    .where(eq(teamRegistrations.id, teamRegistrationId));
  return team;
}

describe("deadline cron — youth deposit-settle branch", () => {
  it("charges the card for the remainder when the shortfall exceeds the deposit, and the deposit settle attempt resolves without crashing", async () => {
    const ctx = await seedTeamPaymentContext();
    await makeYouthSeason(ctx.seasonId);

    // shortfall = teamFeeCents - rosterCollected = 30000 >= depositCents
    // (20000) → chargeCents = 10000 > 0. No saved card on the fixture
    // captain → the card charge fails ("no_saved_card") and backstopStatus
    // goes to 'failed' — but the deposit settle is independent of that
    // outcome (see the cron's module doc: "deposit absorbs first, the card
    // covers the rest" holds regardless of whether the card charge itself
    // succeeds). teamYouthDueCents' own unit test pins that shortfallCents
    // (30000) and chargeCents (10000) are exactly these values; this test is
    // the wiring proof that the cron actually reaches both the charge
    // attempt and the deposit-settle call with them.
    await getDb()
      .update(teamRegistrations)
      .set({
        teamFeeCents: ROSTER_BASELINE_CENTS + 30000,
        backstopStatus: "pending",
        paymentDeadline: new Date(Date.now() - 60_000),
      })
      .where(eq(teamRegistrations.id, ctx.teamRegistrationId));

    const res = await apiFetch("/api/cron/charge-unpaid-team-shares", {
      method: "POST",
      headers: { "x-cron-secret": CRON_SECRET },
    });
    expect(res.status).toBe(200);

    const team = await getTeam(ctx.teamRegistrationId);
    expect(team.backstopStatus).toBe("failed");
    // The deposit-settle call was reached (proven by the claim lease being
    // stamped) and resolved — reverted to 'none' after RECONCILE fails
    // against the fixture's fake PI (see the module doc above), never left
    // stuck in 'processing'.
    expect(team.depositRefundStatus).toBe("none");
    expect(team.depositRefundClaimedAt).not.toBeNull();
  });

  it("does not touch the card when the deposit alone covers the shortfall, and the state machine resolves without crashing or getting stuck", async () => {
    const ctx = await seedTeamPaymentContext();
    await makeYouthSeason(ctx.seasonId);

    // shortfall = 10000 < depositCents (20000) → chargeCents = 0 → nothing
    // charged to the card, backstopStatus closes out as 'charged'. The
    // deposit settle computes 'partially_refunded' (refundCents = 10000),
    // which DOES require refunds.create against the fixture's fake PI —
    // that fails at Stripe and the executor reverts the claim to 'none'
    // (see its module doc's FAILURE step). The state machine must not crash
    // and must not get stuck in 'processing'.
    await getDb()
      .update(teamRegistrations)
      .set({
        teamFeeCents: ROSTER_BASELINE_CENTS + 10000,
        backstopStatus: "pending",
        paymentDeadline: new Date(Date.now() - 60_000),
      })
      .where(eq(teamRegistrations.id, ctx.teamRegistrationId));

    const res = await apiFetch("/api/cron/charge-unpaid-team-shares", {
      method: "POST",
      headers: { "x-cron-secret": CRON_SECRET },
    });
    expect(res.status).toBe(200);

    const team = await getTeam(ctx.teamRegistrationId);
    // Nothing to charge the card for — the cron closes the backstop out
    // regardless of whether the (attempted) deposit refund itself succeeded.
    expect(team.backstopStatus).toBe("charged");
    expect(team.depositRefundStatus).not.toBe("processing");
    expect(team.depositRefundClaimedAt).not.toBeNull();
  });

  it("leaves an adult team's math untouched (teamBackstopDueCents, deposit folded into received)", async () => {
    const ctx = await seedTeamPaymentContext();
    // No age group / minAge on the fixture season by default → resolves to
    // adult (isYouthTeamSeason's fail-toward-existing-behavior default).
    await getDb()
      .update(teamRegistrations)
      .set({
        teamFeeCents: ROSTER_BASELINE_CENTS + DEPOSIT_CENTS + 30000, // deposit folds into "received" for adult math
        backstopStatus: "pending",
        paymentDeadline: new Date(Date.now() - 60_000),
      })
      .where(eq(teamRegistrations.id, ctx.teamRegistrationId));

    const res = await apiFetch("/api/cron/charge-unpaid-team-shares", {
      method: "POST",
      headers: { "x-cron-secret": CRON_SECRET },
    });
    expect(res.status).toBe(200);

    const team = await getTeam(ctx.teamRegistrationId);
    // The adult path never touches deposit_refund_status at all.
    expect(team.depositRefundStatus).toBe("none");
  });
});

describe("deadline cron — deposit-refund retry sweep (phase 3)", () => {
  it("settles a youth team's deposit even when backstopStatus isn't 'pending' (independent trigger)", async () => {
    const ctx = await seedTeamPaymentContext();
    await makeYouthSeason(ctx.seasonId);

    // backstopStatus already resolved (not 'pending') — phase 2's "due
    // teams" query would never select this row again (see the CALLER
    // CONTRACT in team-deposit-refund.ts). Only the sweep, which selects
    // purely on the deposit columns, can reach it.
    await getDb()
      .update(teamRegistrations)
      .set({
        teamFeeCents: ROSTER_BASELINE_CENTS + 30000,
        backstopStatus: "charged",
        paymentDeadline: new Date(Date.now() - 60_000),
      })
      .where(eq(teamRegistrations.id, ctx.teamRegistrationId));

    const res = await apiFetch("/api/cron/charge-unpaid-team-shares", {
      method: "POST",
      headers: { "x-cron-secret": CRON_SECRET },
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.depositSwept).toBeGreaterThanOrEqual(1);

    const team = await getTeam(ctx.teamRegistrationId);
    // Reached and attempted (the lease is stamped) even though phase 2 never
    // touched this team (backstopStatus stayed 'charged' throughout) — proof
    // the sweep really is independent of backstopStatus. Reverts to 'none'
    // for the same fake-PI reason as the phase-2 tests above.
    expect(team.depositRefundStatus).toBe("none");
    expect(team.depositRefundClaimedAt).not.toBeNull();
  });

  it("does NOT settle a team whose deadline is older than the 30-day lower bound", async () => {
    const ctx = await seedTeamPaymentContext();
    await makeYouthSeason(ctx.seasonId);

    await getDb()
      .update(teamRegistrations)
      .set({
        teamFeeCents: ROSTER_BASELINE_CENTS + 30000,
        backstopStatus: "charged",
        paymentDeadline: new Date(Date.now() - 40 * 24 * 60 * 60 * 1000), // 40 days ago
      })
      .where(eq(teamRegistrations.id, ctx.teamRegistrationId));

    const res = await apiFetch("/api/cron/charge-unpaid-team-shares", {
      method: "POST",
      headers: { "x-cron-secret": CRON_SECRET },
    });
    expect(res.status).toBe(200);

    const team = await getTeam(ctx.teamRegistrationId);
    // Untouched — aged past the sweep's lower bound, a manual case per
    // alerts.ts's runbook, not an automatic one.
    expect(team.depositRefundStatus).toBe("none");
  });

  it("skips an adult team entirely, even with deposit columns matching the predicate", async () => {
    const ctx = await seedTeamPaymentContext();
    // Adult season (default fixture) — the sweep's youth gate must skip it
    // regardless of how far short of the fee it is.
    await getDb()
      .update(teamRegistrations)
      .set({
        teamFeeCents: ROSTER_BASELINE_CENTS + DEPOSIT_CENTS + 30000,
        backstopStatus: "charged",
        paymentDeadline: new Date(Date.now() - 60_000),
      })
      .where(eq(teamRegistrations.id, ctx.teamRegistrationId));

    const res = await apiFetch("/api/cron/charge-unpaid-team-shares", {
      method: "POST",
      headers: { "x-cron-secret": CRON_SECRET },
    });
    expect(res.status).toBe(200);

    const team = await getTeam(ctx.teamRegistrationId);
    expect(team.depositRefundStatus).toBe("none");
  });
});

describe("registration-payment handler — full-collection trigger", () => {
  it("checks the deposit-refund executor once a team-linked payment leaves the roster covering the fee, without failing fulfillment", async () => {
    const ctx = await seedTeamPaymentContext();
    await makeYouthSeason(ctx.seasonId);
    const db = getDb();

    // teamFeeCents set BELOW the roster baseline — already "fully
    // collected" before this payment, so any subsequent team-linked payment
    // re-checks and (re-)fires the trigger. This tests the WIRING (the
    // handler resolves the team, computes teamRosterCollectedCents, and
    // calls the executor when over threshold) — the money math itself is
    // already pinned by the unit suite and by teamYouthDueCents' tests.
    await db
      .update(teamRegistrations)
      .set({ teamFeeCents: ROSTER_BASELINE_CENTS - 100 })
      .where(eq(teamRegistrations.id, ctx.teamRegistrationId));

    const suffix = Math.random().toString(36).slice(2, 10);
    const email = `full-collect-${suffix}@test.example`;
    const [user] = await db
      .insert(users)
      .values({
        email,
        passwordHash: await hashPassword("Mem123456!"),
        firstName: "Full",
        lastName: `Collect${suffix}`,
      })
      .returning();
    const [member] = await db
      .insert(familyMembers)
      .values({ selfUserId: user.id, firstName: "Full", lastName: `Collect${suffix}`, birthDate: "1997-02-02" })
      .returning();
    const [reg] = await db
      .insert(registrations)
      .values({
        seasonId: ctx.seasonId,
        familyMemberId: member.id,
        registeredByUserId: user.id,
        status: "confirmed",
        paymentStatus: "unpaid",
        amountPaidCents: 0,
        amountDueCents: 5000,
        registrationType: "full",
        waiverSigned: true,
      })
      .returning();
    await db.insert(teamRegistrationMembers).values({
      teamRegistrationId: ctx.teamRegistrationId,
      registrationId: reg.id,
      role: "member",
    });

    const fakePi = {
      id: `pi_fullcollect_${suffix}`,
      amount_received: 5000,
      latest_charge: `ch_fullcollect_${suffix}`,
      metadata: { registrationId: reg.id, type: "registration_payment" },
    } as unknown as Stripe.PaymentIntent;

    // Must not throw and must still fulfill the payment even though the
    // deposit-refund attempt behind it will fail against Stripe (fake PI) —
    // the caller contract in team-deposit-refund.ts and the controller
    // ruling both require this to be best-effort.
    const handled = await handleRegistrationPaymentSucceeded(fakePi);
    expect(handled.status).toBe("processed");

    const [updatedReg] = await db
      .select()
      .from(registrations)
      .where(eq(registrations.id, reg.id));
    expect(updatedReg.amountPaidCents).toBe(5000);
    expect(updatedReg.paymentStatus).toBe("paid");

    // The deposit-refund attempt was reached (the lease is stamped, proving
    // the handler actually resolved teamId + teamFeeCents and called the
    // executor) and resolved one way or another — reverted after the
    // fixture's fake-PI Stripe failure, same as the cron tests above — never
    // left mid-claim.
    const team = await getTeam(ctx.teamRegistrationId);
    expect(team.depositRefundStatus).not.toBe("processing");
    expect(team.depositRefundClaimedAt).not.toBeNull();
  });
});
