import type Stripe from "stripe";
import { and, eq, sql } from "drizzle-orm";
import { randomBytes } from "node:crypto";
import { getDb } from "@/lib/db";
import { teamRegistrations, payments, discountUsages, discountCodes, seasons } from "@/lib/db/schema";
import { upsertGuestUser } from "@/lib/registrations/upsert-guest-user";
import { resolvePerson } from "@/lib/registrations/resolve-person";
import { createRegistration, RegistrationError } from "@/lib/registrations/create-registration";
import { CAPTAIN_DEPOSIT_CENTS } from "@/lib/registrations/team-deposit";
import { getPostHogServer } from "@/lib/posthog-server";
import { SERVER_EVENTS } from "@/lib/analytics/events";
import { capturePaymentCompleted } from "@/lib/observability/payment-telemetry";
import { normalizeBrand } from "@/lib/organization/soccerone-routing";
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
 * Auto-register the captain as a player on their own team — every captain
 * plays, so there's no separate "register yourself" step. Their $200 deposit
 * credits against their share (solo price ≤ deposit → $0 more due), and the
 * waiver is deferred exactly like any other adult self-registration.
 *
 * Best-effort + idempotent: createRegistration links the captain into
 * team_registration_members with the captain role and returns "resumed" (or
 * throws a benign "already registered") on a re-run, so calling it from both
 * finalize and the webhook backstop never double-registers. A failure here is
 * logged, never fatal — the team + deposit are already committed.
 */
async function ensureCaptainRegistration(args: {
  captainUserId: string;
  captainEmail: string;
  captainName: string;
  seasonId: string;
  inviteToken: string;
  brand?: string;
}): Promise<void> {
  const db = getDb();
  const { firstName, lastName } = splitName(args.captainName);
  try {
    const person = await resolvePerson(db, {
      kind: "self",
      user: { id: args.captainUserId, firstName, lastName, birthDate: null, gender: null },
    });
    await createRegistration({
      db,
      user: { id: args.captainUserId, email: args.captainEmail, firstName },
      familyMember: {
        id: person.id,
        firstName: person.firstName,
        lastName: person.lastName ?? "",
        selfUserId: person.selfUserId,
      },
      seasonId: args.seasonId,
      registrationType: "full",
      waiverSigned: false, // deferred — same as any adult self-registration
      waiverSignedBy: "",
      lookingForTeam: false,
      teamToken: args.inviteToken,
      brand: (args.brand as BrandId | undefined) || undefined,
    });
  } catch (err) {
    if (err instanceof RegistrationError) return; // already registered → idempotent success
    console.error("[finalizeTeamDeposit] captain auto-register failed:", err);
  }
}

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
    // Team already created — but ensure the captain's own registration exists
    // (idempotent), so a webhook arriving after a finalize that created the team
    // but failed to register the captain still closes that gap.
    if (existing.captainUserId) {
      await ensureCaptainRegistration({
        captainUserId: existing.captainUserId,
        captainEmail,
        captainName,
        seasonId,
        inviteToken: existing.inviteToken,
        brand: m.brand,
      });
    }
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
      .onConflictDoNothing({
        target: payments.stripePaymentIntentId,
        // The unique index is PARTIAL (WHERE stripe_payment_intent_id IS NOT
        // NULL) — Postgres refuses to infer a partial index as the conflict
        // arbiter without a matching predicate, failing the whole insert with
        // "no unique or exclusion constraint matching the ON CONFLICT
        // specification". Without this predicate the ledger insert threw on
        // EVERY deferred-flow team deposit and the catch below swallowed it:
        // deposits charged fine but never recorded a payments row. (Same
        // predicate idiom as handle-team-deposit-succeeded.ts.)
        where: sql`stripe_payment_intent_id IS NOT NULL`,
      })
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
      // Capture against the browser's PostHog id when the prepare route
      // stored one, so the deposit joins the captain's anonymous funnel
      // (team_create_viewed → deposit) — mirrors payment-telemetry.ts.
      distinctId: m.ph_distinct_id || captainUserId,
      event: SERVER_EVENTS.teamDepositPaid,
      properties: {
        ...(m.ph_session_id ? { $session_id: m.ph_session_id } : {}),
        team_registration_id: team.id,
        season_id: seasonId,
        amount_cents: pi.amount,
        user_id: captainUserId,
      },
    });
  } catch (err) {
    console.error("[finalizeTeamDeposit] analytics failed:", err);
  }
  // Revenue signal — the $200 deposit is captured money and belongs in
  // payment_completed alongside registration/dropin revenue (it was the one
  // paid flow missing from revenue analytics).
  capturePaymentCompleted({
    distinctId: captainUserId,
    clientDistinctId: m.ph_distinct_id,
    sessionId: m.ph_session_id,
    kind: "team_deposit",
    amountCents: pi.amount,
    brand: normalizeBrand(m.brand),
    organizationId,
    metadata: { team_registration_id: team.id, season_id: seasonId },
  });
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
      teamRegistrationId: team.id,
      teamFeeCents,
      depositCents: CAPTAIN_DEPOSIT_CENTS,
      paymentDeadline: season?.registrationCloses ?? null,
      brand: (m.brand as BrandId | undefined) || undefined,
    });
  } catch (err) {
    console.error("[finalizeTeamDeposit] receipt email failed:", err);
  }

  // Auto-register the captain as a player (deposit covers their spot, waiver
  // deferred) — runs after the deposit ledger so the credit resolves.
  await ensureCaptainRegistration({
    captainUserId,
    captainEmail,
    captainName,
    seasonId,
    inviteToken: team.inviteToken,
    brand: m.brand,
  });

  return { teamRegistrationId: team.id, inviteToken: team.inviteToken, captainUserId, created: true, wasNewUser };
}
