/**
 * GET  /api/dropin/claim/:token  → returns the pending-claim booking
 *                                  metadata so the UI can show the user
 *                                  what they're claiming — including
 *                                  whether confirming REQUIRES PAYMENT.
 * POST /api/dropin/claim/:token  → completes the claim.
 *
 * Payment semantics (the transactional capacity gate's overflow policy —
 * see docs/superpowers/specs/2026-07-12-transactional-capacity-gate-design.md):
 *
 *   - A normal promoted waitlister's row carries whatever paid state it
 *     had; the POST flips pending_claim → confirmed and clears the token.
 *   - An overflow booking (paid Checkout that lost the last-spot race) was
 *     REFUNDED in full when it was waitlisted — `stripeRefundId` is set.
 *     Its `amountPaidCents` records the original charge, but that money
 *     went BACK to the customer, so the row is NOT paid. For these rows:
 *       · GET returns `paymentRequired: true` + `amountDueCents`
 *       · a bare POST is REFUSED (422) — no free seat on a refunded charge
 *       · POST with body `{ action: "pay" }` creates a Stripe Checkout
 *         Session (metadata.type "dropin_claim_payment"; PaymentIntent
 *         metadata routes payment_intent.succeeded to
 *         handle-dropin-claim-payment.ts, which flips THIS row to
 *         confirmed once the new charge settles) and returns
 *         `{ paymentRequired: true, checkoutUrl }`.
 *
 * Token is one-time: clearing it on free-confirm POST blocks replay. For
 * paid claims the token survives until the webhook confirms the row (the
 * claim page must stay reachable while the customer is mid-checkout);
 * the webhook clears it.
 */
import type { APIRoute } from "astro";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { dropInBookings, dropInSessions, dropInRateCard } from "@/lib/db/schema/drop-in";
import { findClaimByToken } from "@/lib/dropin/promotion";
import { assignTeam } from "@/lib/dropin/team-assignment";
import { resolveRate, type ResolvedRate } from "@/lib/dropin/pricing";
import { getActiveMembershipForUser } from "@/lib/dropin/booking";
import { createDropInCheckoutSession } from "@/lib/dropin/create-checkout";
import { computeSurchargeCents } from "@/lib/payments/surcharge";
import { stripe } from "@/lib/stripe/client";
import {
  resolveClassWalkUpRate,
  CLASS_REQUIRES_CHILD,
  CLASS_REQUIRES_CHILD_MESSAGE,
} from "@/lib/classes/class-walkup";
import { classRateNotConfigured } from "@/lib/classes/class-rate";

export const prerender = false;

const json = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

/**
 * Loads the claim row plus its parent drop-in session in one shot. Every
 * caller downstream (GET, POST free-confirm, POST pay) ends up needing the
 * full session row, not just its organizationId — fetch it once here and
 * thread it through instead of each branch re-querying dropInSessions.
 */
async function loadClaimWithSession(token: string) {
  const row = await findClaimByToken(token);
  if (!row) return { row: null, session: null };
  const db = getDb();
  const [session] = await db
    .select()
    .from(dropInSessions)
    .where(eq(dropInSessions.id, row.sessionId))
    .limit(1);
  return { row, session: session ?? null };
}

/** A refunded row's original charge went back to the customer — claiming
 *  it requires paying again. `stripeRefundId` is the durable marker the
 *  overflow refund stamps (and it is never cleared while the row is still
 *  pending_claim), so this cannot flip back to "free" on a re-read. */
function claimRequiresPayment(row: { stripeRefundId: string | null }): boolean {
  return row.stripeRefundId !== null;
}

/** Resolve what a paying claimant owes: their personal rate (member rate
 *  honored, same as a fresh booking) plus the card surcharge — identical
 *  math to the checkout the pay action mints. A $0 rate means no card
 *  charge happens at all, so the flat card surcharge doesn't apply.
 *  Takes the already-loaded session row (see loadClaimWithSession) instead
 *  of re-fetching it.
 *
 *  CLASS sessions are priced from the session's own rates via the shared
 *  class-walkup module, keyed to the booking's PARTICIPANT
 *  (`familyMemberId`) — never `resolveRate` + the org rate card, which is
 *  the ADULT PICKUP price list (see src/lib/classes/class-walkup.ts). A
 *  null configured rate returns null here (display-only; the caller omits
 *  `amountDueCents` rather than 409ing this GET). */
async function resolveAmountDueCents(
  row: { sessionId: string; userId: string; familyMemberId: string | null },
  session: typeof dropInSessions.$inferSelect | null,
): Promise<number | null> {
  if (!session) return null;
  const db = getDb();
  if (session.kind === "class") {
    if (!row.familyMemberId) return null;
    const quote = await resolveClassWalkUpRate(session, row.familyMemberId, db);
    if (!quote.ok) return null;
    return totalDueCents(quote.amountCents);
  }
  const [rateCard] = await db
    .select()
    .from(dropInRateCard)
    .where(eq(dropInRateCard.organizationId, session.organizationId))
    .limit(1);
  if (!rateCard) return null;
  const membership = await getActiveMembershipForUser(
    row.userId,
    session.organizationId,
  );
  const rate = resolveRate(session, { id: row.userId }, membership, rateCard);
  return totalDueCents(rate.amountCents);
}

/** Base rate + card surcharge; $0 base → $0 total (no charge, no surcharge). */
function totalDueCents(baseAmountCents: number): number {
  if (baseAmountCents === 0) return 0;
  return baseAmountCents + computeSurchargeCents(baseAmountCents, "card");
}

export const GET: APIRoute = async ({ params, locals }) => {
  const token = params.token;
  if (!token) return json({ error: "Token required" }, 400);

  const { row, session } = await loadClaimWithSession(token);
  if (!row) return json({ error: "Token invalid" }, 404);
  if (row.expired) return json({ error: "Window expired" }, 410);
  const sessionOrgId = session?.organizationId ?? null;
  if (locals.organization && sessionOrgId !== locals.organization.id) {
    // Don't leak that the token exists for a different org — same shape as not-found.
    return json({ error: "Token invalid" }, 404);
  }

  const paymentRequired = claimRequiresPayment(row);
  const amountDueCents = paymentRequired
    ? await resolveAmountDueCents(row, session)
    : null;

  return json(
    {
      bookingId: row.id,
      sessionId: row.sessionId,
      userId: row.userId,
      promotionExpiresAt: row.promotionExpiresAt,
      paymentMethod: row.paymentMethod,
      // amountPaidCents records the ORIGINAL charge, which for refunded
      // overflow rows went back to the customer — the UI must key its
      // "already paid" copy on paymentRequired, not on this figure.
      amountPaidCents: row.amountPaidCents,
      paymentRequired,
      amountDueCents,
    },
    200,
  );
};

export const POST: APIRoute = async ({ params, request, locals, url }) => {
  if (!locals.user) return json({ error: "Unauthorized" }, 401);

  const token = params.token;
  if (!token) return json({ error: "Token required" }, 400);

  const { row, session } = await loadClaimWithSession(token);
  if (!row) return json({ error: "Token invalid" }, 404);
  if (row.expired) return json({ error: "Window expired" }, 410);
  const sessionOrgId = session?.organizationId ?? null;
  if (locals.organization && sessionOrgId !== locals.organization.id) {
    return json({ error: "Token invalid" }, 404);
  }
  if (row.userId !== locals.user.id) {
    return json({ error: "This claim is for a different user" }, 403);
  }

  // Body is optional (the original free-confirm contract sends none).
  let action: string | null = null;
  try {
    const body = await request.json();
    if (body && typeof body.action === "string") action = body.action;
  } catch {
    // No/invalid body → bare confirm attempt.
  }

  if (claimRequiresPayment(row)) {
    // The original charge on this booking was refunded (overflow policy) —
    // this seat is NOT paid for. Never free-confirm it.
    if (action !== "pay") {
      return json(
        {
          error:
            "Your original payment for this session was refunded when it filled up, so this spot needs to be paid for before it can be confirmed.",
          paymentRequired: true,
        },
        422,
      );
    }
    // NOTE: the Stripe-configured check deliberately comes AFTER the amount
    // is resolved (below) — a zero-due claim confirms without touching
    // Stripe and must work even when no Stripe client is configured.
    const db = getDb();
    if (!session) return json({ error: "Session not found" }, 404);

    // CLASS sessions are priced from the session's own rates via the shared
    // class-walkup module, keyed to the booking's PARTICIPANT — never
    // `resolveRate` + the org rate card, which is the ADULT PICKUP price
    // list (see src/lib/classes/class-walkup.ts). This mirrors the paid
    // make-up door (POST /api/dropin/bookings) exactly.
    let rate: ResolvedRate;
    if (session.kind === "class") {
      if (!row.familyMemberId) {
        return json(
          { error: { code: CLASS_REQUIRES_CHILD, message: CLASS_REQUIRES_CHILD_MESSAGE } },
          422,
        );
      }
      const quote = await resolveClassWalkUpRate(session, row.familyMemberId, db);
      if (!quote.ok) {
        return classRateNotConfigured(session, quote.need, {
          component: "api/dropin/claim",
        });
      }
      rate = {
        amountCents: quote.amountCents,
        paymentMethod: "card_online",
        membershipId: quote.membershipId,
      };
    } else {
      const [rateCard] = await db
        .select()
        .from(dropInRateCard)
        .where(eq(dropInRateCard.organizationId, session.organizationId))
        .limit(1);
      if (!rateCard) return json({ error: "Rate card not configured" }, 500);

      const membership = await getActiveMembershipForUser(
        locals.user.id,
        session.organizationId,
      );
      rate = resolveRate(session, locals.user, membership, rateCard);
    }
    const totalCents = totalDueCents(rate.amountCents);

    // Zero-due claim: the claimant's CURRENT rate resolves to $0 (e.g. they
    // gained an unlimited/allotment membership between the overflow refund
    // and the claim). Stripe rejects zero-amount Checkout Sessions, and
    // there is nothing to charge — confirm directly, recording the
    // membership as the payment method. The row's original PI/refund pair
    // stays as settled history (amountPaidCents drops to 0: no money is
    // retained for this seat — the original charge was refunded in full).
    if (totalCents === 0) {
      return await db.transaction(async (tx) => {
        const [locked] = await tx
          .select()
          .from(dropInBookings)
          .where(eq(dropInBookings.id, row.id))
          .limit(1)
          .for("update");
        if (!locked || locked.status !== "pending_claim") {
          return json({ error: "Claim no longer valid" }, 409);
        }
        // Reuse the session row fetched before the transaction (assignTeam
        // only reads its static team-layout fields, and locked.sessionId is
        // the same session — no need to re-query it a third time here).
        const team = assignTeam(session, "all_levels", []);

        await tx
          .update(dropInBookings)
          .set({
            status: "confirmed",
            paymentMethod: rate.paymentMethod,
            membershipId: rate.membershipId,
            amountPaidCents: 0,
            promotionToken: null,
            promotionExpiresAt: null,
            teamAssignment: locked.teamAssignment ?? team,
            updatedAt: new Date(),
          })
          .where(eq(dropInBookings.id, locked.id));

        return json(
          { ok: true, bookingId: locked.id, paymentRequired: false },
          200,
        );
      });
    }

    if (!stripe) return json({ error: "Stripe not configured" }, 500);

    const checkout = await createDropInCheckoutSession({
      db,
      session,
      user: { id: locals.user.id, email: locals.user.email },
      rate,
      // Waiver was signed with the original booking; carry it through for
      // metadata completeness (the claim fulfillment path doesn't re-read it
      // — the booking row already stores the signed waiver).
      waiverSignedAt: row.waiverSignedAt ?? new Date(),
      waiverName: row.waiverSignedBy ?? "On file",
      origin: url.origin,
      overrides: {
        // checkout.session.completed for this type is deliberately ignored
        // (no row insert — the row exists); fulfillment rides on
        // payment_intent.succeeded → handle-dropin-claim-payment.ts.
        metadataType: "dropin_claim_payment",
        paymentIntentMetadata: {
          type: "dropin_claim_payment",
          booking_id: row.id,
          session_id: row.sessionId,
          organization_id: session.organizationId,
        },
        // One Checkout Session (→ one PaymentIntent) per booking+amount:
        // a double-clicked Pay button reuses the same session instead of
        // minting a second chargeable checkout.
        idempotencyKey: `${row.id}:claim-pay:${totalCents}`,
      },
    });

    return json(
      {
        paymentRequired: true,
        checkoutUrl: checkout.checkoutUrl,
        checkoutSessionId: checkout.checkoutSessionId,
      },
      200,
    );
  }

  const db = getDb();
  return await db.transaction(async (tx) => {
    // Re-lock the row inside the transaction.
    const [locked] = await tx
      .select()
      .from(dropInBookings)
      .where(eq(dropInBookings.id, row.id))
      .limit(1)
      .for("update");
    if (!locked || locked.status !== "pending_claim") {
      return json({ error: "Claim no longer valid" }, 409);
    }
    // Re-check the payment discriminator under the lock — the unlocked read
    // above could race the overflow refund/webhook stamping stripeRefundId.
    if (claimRequiresPayment(locked)) {
      return json(
        {
          error:
            "Your original payment for this session was refunded when it filled up, so this spot needs to be paid for before it can be confirmed.",
          paymentRequired: true,
        },
        422,
      );
    }

    // Re-run team assignment with the now-current confirmed roster.
    // (Pure-function call; takes a session shape — reuse the row already
    // fetched by loadClaimWithSession instead of re-querying it here.)
    if (!session) return json({ error: "Session not found" }, 404);

    const team = assignTeam(session, "all_levels", []);

    await tx
      .update(dropInBookings)
      .set({
        status: "confirmed",
        promotionToken: null,
        teamAssignment: locked.teamAssignment ?? team,
        updatedAt: new Date(),
      })
      .where(eq(dropInBookings.id, locked.id));

    return json({ ok: true, bookingId: locked.id }, 200);
  });
};
