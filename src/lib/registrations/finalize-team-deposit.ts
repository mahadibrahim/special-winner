import type Stripe from "stripe";
import { and, eq, sql } from "drizzle-orm";
import { randomBytes } from "node:crypto";
import { getDb } from "@/lib/db";
import { teamRegistrations, payments, discountUsages, discountCodes, seasons } from "@/lib/db/schema";
import { upsertGuestUser } from "@/lib/registrations/upsert-guest-user";
import { CAPTAIN_DEPOSIT_CENTS } from "@/lib/registrations/team-deposit";
import { getPostHogServer } from "@/lib/posthog-server";
import { SERVER_EVENTS } from "@/lib/analytics/events";
import { sendTeamDepositReceiptEmail } from "@/lib/email/send";
import type { BrandId } from "@/lib/branding/themes";

export interface FinalizeResult {
  teamRegistrationId: string;
  inviteToken: string;
  captainUserId: string;
  /** True only when THIS call created the team (guards session creation +
   *  one-time side effects); false on an idempotent re-entry. */
  created: boolean;
  /** True when the captain account was newly minted here (guest path). */
  wasNewUser: boolean;
}

function generateInviteToken(): string {
  return randomBytes(24).toString("base64url");
}

function splitName(name: string): { firstName: string; lastName: string } {
  const t = (name ?? "").trim();
  const i = t.lastIndexOf(" ");
  return i === -1 ? { firstName: t, lastName: "" } : { firstName: t.slice(0, i), lastName: t.slice(i + 1) };
}

const num = (v: string | undefined): number | null => {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

/**
 * Create the captain's account (if a guest) + the team_registration, and record
 * the $200 deposit — from a succeeded `team_deposit_pending` PaymentIntent whose
 * metadata carries everything (no team/user existed before payment).
 *
 * Called by BOTH the browser finalize endpoint (happy path, which then also
 * mints a session) and the `payment_intent.succeeded` webhook backstop (which
 * can't set a cookie). Idempotent on `deposit_payment_intent_id` (unique): the
 * first caller creates the team + fires the one-time side effects (ledger row,
 * discount usage, receipt email, analytics); any later caller returns the same
 * team with `created: false`.
 */
export async function finalizeTeamDeposit(pi: Stripe.PaymentIntent): Promise<FinalizeResult> {
  const db = getDb();
  const m = pi.metadata ?? {};

  const organizationId = m.organizationId;
  const seasonId = m.seasonId;
  const captainEmail = m.captainEmail;
  const captainName = m.captainName ?? "";
  const teamName = m.teamName ?? "";
  if (!organizationId || !seasonId || !captainEmail) {
    throw new Error("finalizeTeamDeposit: missing required metadata (organizationId/seasonId/captainEmail)");
  }

  // Already finalized? Return it — idempotent for a redelivered webhook or a
  // browser retry after the webhook already won.
  const [existing] = await db
    .select({ id: teamRegistrations.id, inviteToken: teamRegistrations.inviteToken, captainUserId: teamRegistrations.captainUserId })
    .from(teamRegistrations)
    .where(eq(teamRegistrations.depositPaymentIntentId, pi.id))
    .limit(1);
  if (existing) {
    return {
      teamRegistrationId: existing.id,
      inviteToken: existing.inviteToken,
      captainUserId: existing.captainUserId ?? "",
      created: false,
      wasNewUser: false,
    };
  }

  // Resolve the captain user: authed callers pass captainUserId in metadata;
  // guests get an account minted now (upsert is idempotent on canonical email).
  let captainUserId = m.captainUserId ?? "";
  let wasNewUser = false;
  if (!captainUserId) {
    const { firstName, lastName } = splitName(captainName);
    const up = await upsertGuestUser(db, { email: captainEmail, firstName, lastName });
    captainUserId = up.userRow.id;
    wasNewUser = up.wasNewUser;
  }

  const paymentMethodId =
    typeof pi.payment_method === "string" ? pi.payment_method : pi.payment_method?.id ?? null;
  const customerId = typeof pi.customer === "string" ? pi.customer : pi.customer?.id ?? null;

  const teamFeeCents = num(m.teamFeeCents);
  const discountCents = num(m.discountCents);
  const discountCodeId = m.discountCodeId || null;

  // Payment deadline = season.registrationCloses at finalize time (mirrors the
  // eager path's snapshot).
  const [season] = await db
    .select({ registrationCloses: seasons.registrationCloses })
    .from(seasons)
    .where(eq(seasons.id, seasonId))
    .limit(1);

  const inviteToken = generateInviteToken();

  // Insert-if-absent on the unique deposit_payment_intent_id. A concurrent
  // finalize+webhook race resolves here: exactly one row is inserted.
  const inserted = await db
    .insert(teamRegistrations)
    .values({
      organizationId,
      seasonId,
      captainUserId,
      captainEmail,
      captainName,
      teamName: teamName || "My team",
      inviteToken,
      notes: m.notes || null,
      status: "forming",
      brand: m.brand || null,
      teamFeeCents,
      discountCodeId,
      discountCents,
      depositCents: CAPTAIN_DEPOSIT_CENTS,
      depositPaymentIntentId: pi.id,
      captainStripeCustomerId: customerId,
      captainPaymentMethodId: paymentMethodId,
      paymentDeadline: season?.registrationCloses ?? null,
      backstopStatus: "pending",
      backstopConsentedAt: m.backstopConsent === "true" ? new Date() : null,
    })
    .onConflictDoNothing({ target: teamRegistrations.depositPaymentIntentId })
    .returning({ id: teamRegistrations.id, inviteToken: teamRegistrations.inviteToken });

  // Lost the race — another caller created it. Re-fetch and return, no side effects.
  if (inserted.length === 0) {
    const [row] = await db
      .select({ id: teamRegistrations.id, inviteToken: teamRegistrations.inviteToken })
      .from(teamRegistrations)
      .where(eq(teamRegistrations.depositPaymentIntentId, pi.id))
      .limit(1);
    return {
      teamRegistrationId: row?.id ?? "",
      inviteToken: row?.inviteToken ?? "",
      captainUserId,
      created: false,
      wasNewUser,
    };
  }

  const team = inserted[0]!;

  // ── One-time side effects (this caller created the team) ──────────────────

  // $200 deposit → payments ledger, then link it on the team row. Unique on
  // the Stripe PI id, so a stray double never double-records.
  try {
    const [paymentRow] = await db
      .insert(payments)
      .values({
        registrationId: null,
        teamRegistrationId: team.id,
        userId: captainUserId,
        amountCents: CAPTAIN_DEPOSIT_CENTS,
        paymentType: "deposit",
        status: "succeeded",
        stripePaymentIntentId: pi.id,
      })
      .onConflictDoNothing({ target: payments.stripePaymentIntentId })
      .returning({ id: payments.id });
    if (paymentRow?.id) {
      await db
        .update(teamRegistrations)
        .set({ depositPaymentId: paymentRow.id, updatedAt: new Date() })
        .where(eq(teamRegistrations.id, team.id));
    }
  } catch (err) {
    console.error("[finalizeTeamDeposit] ledger insert failed:", err);
  }

  // Record discount redemption (total + per-user caps) — once, at creation.
  if (discountCodeId && discountCents) {
    try {
      await db.insert(discountUsages).values({
        discountCodeId,
        userId: captainUserId,
        registrationId: null,
        discountAmountCents: discountCents,
      });
      await db
        .update(discountCodes)
        .set({ usedCount: sql`${discountCodes.usedCount} + 1` })
        .where(eq(discountCodes.id, discountCodeId));
    } catch (err) {
      console.error("[finalizeTeamDeposit] discount usage record failed:", err);
    }
  }

  // Analytics + receipt email (once).
  try {
    getPostHogServer().capture({
      distinctId: captainUserId,
      event: SERVER_EVENTS.teamDepositPaid,
      properties: { team_registration_id: team.id, season_id: seasonId, amount_cents: pi.amount },
    });
  } catch (err) {
    console.error("[finalizeTeamDeposit] analytics failed:", err);
  }
  try {
    let seasonName = "your season";
    try {
      const [sr] = await db.select({ name: seasons.name }).from(seasons).where(eq(seasons.id, seasonId)).limit(1);
      if (sr?.name) seasonName = sr.name;
    } catch { /* non-fatal */ }
    await sendTeamDepositReceiptEmail({
      to: captainEmail,
      captainName,
      teamName: teamName || "My team",
      seasonName,
      seasonId,
      inviteToken: team.inviteToken,
      teamFeeCents,
      depositCents: CAPTAIN_DEPOSIT_CENTS,
      paymentDeadline: season?.registrationCloses ?? null,
      brand: (m.brand as BrandId | undefined) || undefined,
    });
  } catch (err) {
    console.error("[finalizeTeamDeposit] receipt email failed:", err);
  }

  return { teamRegistrationId: team.id, inviteToken: team.inviteToken, captainUserId, created: true, wasNewUser };
}
