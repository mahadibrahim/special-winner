/**
 * Ops pings for team lifecycle events — "we got a team registration and no
 * email fired". Team money events must ping the principals like solo
 * registrations do:
 *
 *  - team_reserved: deposit succeeded / team created (both finalize paths
 *    converge on the unique (kind, eventId=teamRegistrationId) dedupe gate).
 *  - team_backstop_charged / team_backstop_failed: the payment-deadline cron.
 *  - registration_paid for a team member is labeled with the team name.
 */
import { describe, it, expect, beforeAll } from "vitest";
import type Stripe from "stripe";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { hashPassword } from "@/lib/auth";
import {
  organizations,
  users,
  familyMembers,
  opsPings,
  teamRegistrations,
  type OrganizationSettings,
} from "@/lib/db/schema";
import { finalizeTeamDeposit } from "@/lib/registrations/finalize-team-deposit";
import { handleRegistrationPaymentSucceeded } from "@/lib/stripe/handle-registration-payment-succeeded";
import { createRegistration } from "@/lib/registrations/create-registration";
import { apiFetch } from "./setup/test-helpers";
import {
  seedTeamPaymentContext,
  type TeamPaymentContext,
  DEPOSIT_CENTS,
  BALANCE_CENTS,
  REFUND_CENTS,
} from "../utils/team-payment-context";

const CRON_SECRET = "ci-cron-test-secret";
const TEAM_LEVEL_CENTS = DEPOSIT_CENTS + BALANCE_CENTS - REFUND_CENTS;

async function enableOpsPings(organizationId: string) {
  const db = getDb();
  const [org] = await db
    .select({ settings: organizations.settings })
    .from(organizations)
    .where(eq(organizations.id, organizationId));
  const settings = (org?.settings ?? {}) as OrganizationSettings;
  await db
    .update(organizations)
    .set({ settings: { ...settings, opsPings: { ...settings.opsPings, enabled: true } } })
    .where(eq(organizations.id, organizationId));
}

async function pingsFor(kind: string, eventId: string) {
  return getDb()
    .select()
    .from(opsPings)
    .where(and(eq(opsPings.kind, kind as any), eq(opsPings.eventId, eventId)));
}

let ctx: TeamPaymentContext;

beforeAll(async () => {
  ctx = await seedTeamPaymentContext();
  await enableOpsPings(ctx.organizationId);
});

describe("team_reserved ping", () => {
  it("fires when the deposit finalizes a new team, with team name and amount", async () => {
    const db = getDb();
    const suffix = Math.random().toString(36).slice(2, 10);
    const email = `newcap-${suffix}@test.example`;
    const [captain] = await db
      .insert(users)
      .values({ email, passwordHash: await hashPassword("Cap123456!"), firstName: "New", lastName: "Captain" })
      .returning();

    const fakePi = {
      id: `pi_res_${suffix}`,
      payment_method: "pm_test",
      customer: "cus_test",
      metadata: {
        organizationId: ctx.organizationId,
        seasonId: ctx.seasonId,
        captainUserId: captain.id,
        captainEmail: email,
        captainName: "New Captain",
        teamName: `Ping FC ${suffix}`,
        teamFeeCents: "97500",
        backstopConsent: "true",
        brand: "aspire",
      },
    } as unknown as Stripe.PaymentIntent;

    const result = await finalizeTeamDeposit(fakePi);
    expect(result.created).toBe(true);

    const rows = await pingsFor("team_reserved", result.teamRegistrationId);
    expect(rows, "team_reserved ping missing").toHaveLength(1);
    expect(rows[0].message).toContain(`Ping FC ${suffix}`);
    expect(rows[0].message).toContain("$200.00");

    // Webhook redelivery / browser retry: no second ping.
    const again = await finalizeTeamDeposit(fakePi);
    expect(again.created).toBe(false);
    expect(await pingsFor("team_reserved", result.teamRegistrationId)).toHaveLength(1);
  });
});

describe("backstop pings from the deadline cron", () => {
  it("pings team_backstop_failed when a shortfall team has no saved card", async () => {
    const shortCtx = await seedTeamPaymentContext();
    await enableOpsPings(shortCtx.organizationId);
    await getDb()
      .update(teamRegistrations)
      .set({
        teamFeeCents: TEAM_LEVEL_CENTS + 40000,
        backstopStatus: "pending",
        paymentDeadline: new Date(Date.now() - 60_000),
      })
      .where(eq(teamRegistrations.id, shortCtx.teamRegistrationId));

    const res = await apiFetch("/api/cron/charge-unpaid-team-shares", {
      method: "POST",
      headers: { "x-cron-secret": CRON_SECRET },
    });
    expect(res.status).toBe(200);

    const rows = await pingsFor("team_backstop_failed", shortCtx.teamRegistrationId);
    expect(rows, "team_backstop_failed ping missing").toHaveLength(1);
    expect(rows[0].message).toContain(shortCtx.teamName);
  });

  it("stays silent when a covered team closes out with nothing to charge", async () => {
    const coveredCtx = await seedTeamPaymentContext();
    await enableOpsPings(coveredCtx.organizationId);
    await getDb()
      .update(teamRegistrations)
      .set({
        teamFeeCents: TEAM_LEVEL_CENTS,
        backstopStatus: "pending",
        paymentDeadline: new Date(Date.now() - 60_000),
      })
      .where(eq(teamRegistrations.id, coveredCtx.teamRegistrationId));

    const res = await apiFetch("/api/cron/charge-unpaid-team-shares", {
      method: "POST",
      headers: { "x-cron-secret": CRON_SECRET },
    });
    expect(res.status).toBe(200);

    expect(await pingsFor("team_backstop_charged", coveredCtx.teamRegistrationId)).toHaveLength(0);
    expect(await pingsFor("team_backstop_failed", coveredCtx.teamRegistrationId)).toHaveLength(0);
  });
});

describe("member-join ping carries the team name", () => {
  it("labels a team member's registration_paid ping with the team", async () => {
    const db = getDb();
    const suffix = Math.random().toString(36).slice(2, 10);
    const email = `member-${suffix}@test.example`;
    const [user] = await db
      .insert(users)
      .values({ email, passwordHash: await hashPassword("Mem123456!"), firstName: "Mem", lastName: `Ber${suffix}` })
      .returning();
    const [member] = await db
      .insert(familyMembers)
      .values({ selfUserId: user.id, firstName: "Mem", lastName: `Ber${suffix}`, birthDate: "1995-03-03" })
      .returning();

    const created = await createRegistration({
      db,
      user: { id: user.id, email, firstName: "Mem" },
      familyMember: { id: member.id, firstName: "Mem", lastName: member.lastName, selfUserId: user.id },
      seasonId: ctx.seasonId,
      registrationType: "full",
      waiverSigned: true,
      waiverSignedBy: "Mem Ber",
      teamToken: `tok-${ctx.suffix}`,
    });
    expect(created.kind).toBe("created");
    if (created.kind !== "created") return;

    const fakePi = {
      id: `pi_join_${suffix}`,
      amount_received: created.amountDueCents,
      latest_charge: `ch_join_${suffix}`,
      metadata: { registrationId: created.registration.id, type: "registration_payment" },
    } as unknown as Stripe.PaymentIntent;

    const handled = await handleRegistrationPaymentSucceeded(fakePi);
    expect(handled.status).toBe("processed");

    const rows = await pingsFor("registration_paid", fakePi.id);
    expect(rows, "registration_paid ping missing").toHaveLength(1);
    expect(rows[0].message).toContain(`joined ${ctx.teamName}`);
  });
});
