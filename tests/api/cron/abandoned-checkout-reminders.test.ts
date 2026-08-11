/**
 * POST /api/cron/send-abandoned-checkout-reminders
 *
 * People who start a registration but never pay convert late on their own
 * (observed: returns at 2, 7, and 13 days) — this cron nudges them instead
 * of hoping they remember. Two touches, keyed off registration age:
 *
 *   nudge      — created 20h–48h ago   (emailType abandoned_checkout_nudge)
 *   last_call  — created 3d–6d ago     (emailType abandoned_checkout_last_call)
 *
 * Eligibility: paymentStatus 'unpaid', status 'pending', amountDue > 0, the
 * season still open for registration. email_logs is the idempotency gate —
 * re-runs and window overlap never double-send.
 *
 * Like the sibling reminder crons, these tests assert on DB end-state
 * (email_logs rows + response counts), not delivery.
 */
import { describe, it, expect } from "vitest";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { emailLogs, registrations, seasons } from "@/lib/db/schema";
import { apiFetch, expectJson } from "../setup/test-helpers";
import { seedTeamPaymentContext } from "../../utils/team-payment-context";
import { hashPassword } from "@/lib/auth";
import { users, familyMembers } from "@/lib/db/schema";

const CRON_ENDPOINT = "/api/cron/send-abandoned-checkout-reminders";

async function runCron() {
  const res = await apiFetch(CRON_ENDPOINT, {
    method: "POST",
    headers: { "x-cron-secret": process.env.CRON_SECRET ?? "ci-cron-test-secret" },
  });
  return expectJson(res, 200);
}

/** Seed an org+season graph plus one pending/unpaid registration aged `ageHours`. */
async function seedAbandoned(ageHours: number, overrides: {
  paymentStatus?: string;
  status?: string;
  amountDueCents?: number;
  registrationCloses?: Date | null;
} = {}) {
  const ctx = await seedTeamPaymentContext();
  const db = getDb();
  const suffix = Math.random().toString(36).slice(2, 10);

  if (overrides.registrationCloses !== undefined) {
    await db
      .update(seasons)
      .set({ registrationCloses: overrides.registrationCloses })
      .where(eq(seasons.id, ctx.seasonId));
  } else {
    await db
      .update(seasons)
      .set({ registrationCloses: new Date(Date.now() + 14 * 24 * 3600 * 1000) })
      .where(eq(seasons.id, ctx.seasonId));
  }

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
      status: (overrides.status ?? "pending") as any,
      paymentStatus: (overrides.paymentStatus ?? "unpaid") as any,
      amountPaidCents: 0,
      amountDueCents: overrides.amountDueCents ?? 12000,
      registrationType: "full",
      waiverSigned: true,
      createdAt: new Date(Date.now() - ageHours * 3600 * 1000),
    })
    .returning();
  return { ctx, user, registration };
}

async function logsFor(registrationId: string, emailType: string) {
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

describe("abandoned-checkout reminders", () => {
  it("nudges a 24h-old unpaid registration exactly once", async () => {
    const { registration } = await seedAbandoned(24);

    const first = await runCron();
    expect(first.touches).toBeTruthy();
    expect(
      await logsFor(registration.id, "abandoned_checkout_nudge"),
    ).toHaveLength(1);

    // Idempotent: a second run must not double-send.
    await runCron();
    expect(
      await logsFor(registration.id, "abandoned_checkout_nudge"),
    ).toHaveLength(1);
  });

  it("sends the last-call touch for a 4-day-old registration", async () => {
    const { registration } = await seedAbandoned(4 * 24);
    await runCron();
    expect(
      await logsFor(registration.id, "abandoned_checkout_last_call"),
    ).toHaveLength(1);
    expect(
      await logsFor(registration.id, "abandoned_checkout_nudge"),
    ).toHaveLength(0);
  });

  it("skips paid, cancelled, zero-due, and closed-season registrations", async () => {
    const paid = await seedAbandoned(24, { paymentStatus: "paid", status: "confirmed" });
    const cancelled = await seedAbandoned(24, { status: "cancelled" });
    const zeroDue = await seedAbandoned(24, { amountDueCents: 0 });
    const closed = await seedAbandoned(24, {
      registrationCloses: new Date(Date.now() - 24 * 3600 * 1000),
    });

    await runCron();

    for (const { registration } of [paid, cancelled, zeroDue, closed]) {
      expect(
        await logsFor(registration.id, "abandoned_checkout_nudge"),
      ).toHaveLength(0);
    }
  });

  it("leaves brand-new registrations alone (still mid-checkout)", async () => {
    const { registration } = await seedAbandoned(1);
    await runCron();
    expect(
      await logsFor(registration.id, "abandoned_checkout_nudge"),
    ).toHaveLength(0);
  });
});
