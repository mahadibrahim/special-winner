/**
 * POST /api/cron/send-abandoned-checkout-reminders — v2 touch engine.
 *
 * Owner-specified schedule, anchored to BOTH cart age and the season's
 * registration deadline, for solo carts (pending/unpaid registrations) and
 * team carts (team_reservation_attempts — captains who reached the deposit
 * form but never paid):
 *
 *   attempt       — 2h–24h after the cart was created ("shortly after")
 *   nudge         — 3–6 days old, only when the deadline is >12 days out
 *   closing_soon  — deadline 6–10 days away (and cart ≥ 24h old)
 *   last_day      — deadline day itself (business TZ), while still open
 *
 * Rules: at most one touch per cart per run (priority last_day >
 * closing_soon > attempt > nudge); a 48h spacing guard between touches;
 * email_logs is the per-touch idempotency gate. Team carts are suppressed
 * once the captain converts (their team exists for that season).
 */
import { describe, it, expect } from "vitest";
import { and, eq, gt } from "drizzle-orm";
import { getDb } from "@/lib/db";
import {
  emailLogs,
  registrations,
  seasons,
  users,
  familyMembers,
  teamReservationAttempts,
  teamRegistrations,
} from "@/lib/db/schema";
import { apiFetch, expectJson } from "../setup/test-helpers";
import { seedTeamPaymentContext } from "../../utils/team-payment-context";
import { hashPassword } from "@/lib/auth";
import { BUSINESS_TIMEZONE } from "@/lib/time/business-timezone";

const CRON_ENDPOINT = "/api/cron/send-abandoned-checkout-reminders";
const DAY = 24 * 3600 * 1000;

/** The calendar day in the business timezone — the same trick the cron uses. */
const etDay = (d: Date) => d.toLocaleDateString("en-CA", { timeZone: BUSINESS_TIMEZONE });

/**
 * A "closes later today" deadline that is still on the SAME business-timezone
 * day as now. A flat now+2h is a time-of-day lottery: run inside the last two
 * hours before ET midnight and the deadline lands on TOMORROW in ET, so the
 * cron never classifies it as the deadline day and `last_day` never fires.
 * That is exactly how CI failed at 03:23 UTC (11:23pm ET). Walking the offsets
 * down shrinks the flake window from 2h/day to the final ~2 minutes before ET
 * midnight.
 */
function closesLaterTodayET(): Date {
  const now = new Date();
  const today = etDay(now);
  for (const ms of [2 * 3600 * 1000, 3600 * 1000, 30 * 60 * 1000, 10 * 60 * 1000, 2 * 60 * 1000]) {
    const candidate = new Date(now.getTime() + ms);
    if (etDay(candidate) === today) return candidate;
  }
  return new Date(now.getTime() + 2 * 60 * 1000);
}

async function runCron() {
  const res = await apiFetch(CRON_ENDPOINT, {
    method: "POST",
    headers: { "x-cron-secret": process.env.CRON_SECRET ?? "ci-cron-test-secret" },
  });
  return expectJson(res, 200);
}

/** Seed an org+season graph plus one pending/unpaid registration. */
async function seedSoloCart(opts: {
  ageHours: number;
  closesInDays?: number | "today" | null;
  paymentStatus?: string;
  status?: string;
  amountDueCents?: number;
}) {
  const ctx = await seedTeamPaymentContext();
  const db = getDb();
  const suffix = Math.random().toString(36).slice(2, 10);

  const closes =
    opts.closesInDays === "today"
      ? closesLaterTodayET() // later today in ET, still open
      : opts.closesInDays === null
        ? null
        : new Date(Date.now() + (opts.closesInDays ?? 20) * DAY);
  await db
    .update(seasons)
    .set({ registrationCloses: closes })
    .where(eq(seasons.id, ctx.seasonId));

  const [user] = await db
    .insert(users)
    .values({
      email: `cart-${suffix}@test.example`,
      passwordHash: await hashPassword("Cart12345!"),
      firstName: "Aband",
      lastName: `Oned${suffix}`,
    })
    .returning();
  const [member] = await db
    .insert(familyMembers)
    .values({
      selfUserId: user.id,
      firstName: "Aband",
      lastName: `Oned${suffix}`,
      birthDate: "1994-04-04",
    })
    .returning();
  const [registration] = await db
    .insert(registrations)
    .values({
      seasonId: ctx.seasonId,
      familyMemberId: member.id,
      registeredByUserId: user.id,
      status: (opts.status ?? "pending") as any,
      paymentStatus: (opts.paymentStatus ?? "unpaid") as any,
      amountPaidCents: 0,
      amountDueCents: opts.amountDueCents ?? 12000,
      registrationType: "full",
      waiverSigned: true,
      createdAt: new Date(Date.now() - opts.ageHours * 3600 * 1000),
    })
    .returning();
  return { ctx, user, registration };
}

/** Seed a team reservation attempt (captain reached deposit form, no team). */
async function seedTeamCart(opts: { ageHours: number; closesInDays?: number }) {
  const ctx = await seedTeamPaymentContext();
  const db = getDb();
  const suffix = Math.random().toString(36).slice(2, 10);
  await db
    .update(seasons)
    .set({
      registrationCloses: new Date(Date.now() + (opts.closesInDays ?? 20) * DAY),
    })
    .where(eq(seasons.id, ctx.seasonId));
  const email = `capcart-${suffix}@test.example`;
  const [attempt] = await db
    .insert(teamReservationAttempts)
    .values({
      organizationId: ctx.organizationId,
      seasonId: ctx.seasonId,
      captainEmail: email,
      captainName: "Cap Cart",
      teamName: `Ghost FC ${suffix}`,
      brand: "aspire",
      createdAt: new Date(Date.now() - opts.ageHours * 3600 * 1000),
    })
    .returning();
  return { ctx, attempt, email };
}

async function soloLogs(registrationId: string, emailType: string) {
  return getDb()
    .select()
    .from(emailLogs)
    .where(
      and(
        eq(emailLogs.registrationId, registrationId),
        eq(emailLogs.emailType, emailType),
      ),
    );
}

async function teamLogs(email: string, emailType: string, since: Date) {
  return getDb()
    .select()
    .from(emailLogs)
    .where(
      and(
        eq(emailLogs.recipientEmail, email),
        eq(emailLogs.emailType, emailType),
        gt(emailLogs.sentAt, since),
      ),
    );
}

describe("solo cart touches", () => {
  it("sends 'attempt' shortly after abandonment, exactly once", async () => {
    const { registration } = await seedSoloCart({ ageHours: 12, closesInDays: 20 });
    await runCron();
    expect(await soloLogs(registration.id, "abandoned_checkout_attempt")).toHaveLength(1);
    await runCron();
    expect(await soloLogs(registration.id, "abandoned_checkout_attempt")).toHaveLength(1);
  });

  it("sends 'nudge' at 3-6 days only when the deadline is far", async () => {
    const { registration } = await seedSoloCart({ ageHours: 4 * 24, closesInDays: 20 });
    await runCron();
    expect(await soloLogs(registration.id, "abandoned_checkout_nudge")).toHaveLength(1);
  });

  it("sends 'closing_soon' instead of 'nudge' when the deadline is 6-10 days out", async () => {
    const { registration } = await seedSoloCart({ ageHours: 4 * 24, closesInDays: 8 });
    await runCron();
    expect(await soloLogs(registration.id, "abandoned_checkout_closing_soon")).toHaveLength(1);
    expect(await soloLogs(registration.id, "abandoned_checkout_nudge")).toHaveLength(0);
  });

  it("sends 'last_day' on deadline day and never doubles up with 'attempt'", async () => {
    const { registration } = await seedSoloCart({ ageHours: 12, closesInDays: "today" });
    await runCron();
    expect(await soloLogs(registration.id, "abandoned_checkout_last_day")).toHaveLength(1);
    expect(await soloLogs(registration.id, "abandoned_checkout_attempt")).toHaveLength(0);
  });

  it("respects the 48h spacing guard between touches", async () => {
    const { registration, user } = await seedSoloCart({ ageHours: 4 * 24, closesInDays: 8 });
    // Simulate an 'attempt' email an hour ago.
    await getDb().insert(emailLogs).values({
      userId: user.id,
      registrationId: registration.id,
      emailType: "abandoned_checkout_attempt",
      recipientEmail: user.email,
      sentAt: new Date(Date.now() - 3600 * 1000),
    });
    await runCron();
    expect(await soloLogs(registration.id, "abandoned_checkout_closing_soon")).toHaveLength(0);

    // Age the prior touch past the guard — now it sends.
    await getDb()
      .update(emailLogs)
      .set({ sentAt: new Date(Date.now() - 3 * DAY) })
      .where(
        and(
          eq(emailLogs.registrationId, registration.id),
          eq(emailLogs.emailType, "abandoned_checkout_attempt"),
        ),
      );
    await runCron();
    expect(await soloLogs(registration.id, "abandoned_checkout_closing_soon")).toHaveLength(1);
  });

  it("skips paid, cancelled, zero-due, closed-season, and brand-new carts", async () => {
    const paid = await seedSoloCart({ ageHours: 12, paymentStatus: "paid", status: "confirmed" });
    const cancelled = await seedSoloCart({ ageHours: 12, status: "cancelled" });
    const zeroDue = await seedSoloCart({ ageHours: 12, amountDueCents: 0 });
    const closed = await seedSoloCart({ ageHours: 12, closesInDays: -1 as number });
    const fresh = await seedSoloCart({ ageHours: 1 });
    await runCron();
    for (const { registration } of [paid, cancelled, zeroDue, closed, fresh]) {
      expect(await soloLogs(registration.id, "abandoned_checkout_attempt")).toHaveLength(0);
      expect(await soloLogs(registration.id, "abandoned_checkout_last_day")).toHaveLength(0);
    }
  });
});

describe("team cart touches", () => {
  it("sends 'attempt' to an abandoned captain, exactly once", async () => {
    const { attempt, email } = await seedTeamCart({ ageHours: 12 });
    const since = new Date(attempt.createdAt);
    await runCron();
    expect(await teamLogs(email, "team_abandoned_attempt", since)).toHaveLength(1);
    await runCron();
    expect(await teamLogs(email, "team_abandoned_attempt", since)).toHaveLength(1);
  });

  it("sends 'closing_soon' with the deadline near", async () => {
    const { attempt, email } = await seedTeamCart({ ageHours: 2 * 24, closesInDays: 8 });
    await runCron();
    expect(
      await teamLogs(email, "team_abandoned_closing_soon", new Date(attempt.createdAt)),
    ).toHaveLength(1);
  });

  it("goes silent once the captain's team exists", async () => {
    const { ctx, attempt, email } = await seedTeamCart({ ageHours: 12 });
    await getDb().insert(teamRegistrations).values({
      organizationId: ctx.organizationId,
      seasonId: ctx.seasonId,
      captainEmail: email,
      captainName: "Cap Cart",
      teamName: "Converted FC",
      inviteToken: `tok-conv-${ctx.suffix}`,
      depositCents: 20000,
    });
    await runCron();
    expect(
      await teamLogs(email, "team_abandoned_attempt", new Date(attempt.createdAt)),
    ).toHaveLength(0);
  });
});

describe("POST /api/public/team-registrations/prepare records the attempt", () => {
  it("writes a team_reservation_attempts row even when Stripe fails", async () => {
    const ctx = await seedTeamPaymentContext();
    await getDb()
      .update(seasons)
      .set({
        registrationCloses: new Date(Date.now() + 20 * DAY),
        status: "open",
      })
      .where(eq(seasons.id, ctx.seasonId));

    const email = `prep-${ctx.suffix}@test.example`;
    await apiFetch("/api/public/team-registrations/prepare", {
      method: "POST",
      body: JSON.stringify({
        seasonId: ctx.seasonId,
        teamName: `Prep FC ${ctx.suffix}`,
        captainName: "Prep Captain",
        captainEmail: email,
        backstopConsent: true,
      }),
    });

    const rows = await getDb()
      .select()
      .from(teamReservationAttempts)
      .where(
        and(
          eq(teamReservationAttempts.seasonId, ctx.seasonId),
          eq(teamReservationAttempts.captainEmail, email),
        ),
      );
    expect(rows, "attempt row missing").toHaveLength(1);
    expect(rows[0].teamName).toBe(`Prep FC ${ctx.suffix}`);
  });
});
