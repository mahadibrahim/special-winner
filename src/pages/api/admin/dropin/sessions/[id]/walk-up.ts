/**
 * POST /api/admin/dropin/sessions/:id/walk-up
 *
 * Front-desk walk-up flow. Two paths:
 *
 * 1. Free-rate caller (member with allotment/unlimited, or session-rate
 *    override = $0). The orchestrator's free path runs and we return a
 *    confirmed booking immediately — no Terminal interaction.
 *
 * 2. Paid caller. Server creates a card-present PaymentIntent (with
 *    `transfer_data` if the venue carries a partner_stripe_account_id)
 *    and returns the `client_secret` so the front-desk panel can drive
 *    the paired Stripe Terminal reader via @stripe/terminal-js. After
 *    the reader confirms, the front-desk panel POSTs back to
 *    /api/admin/dropin/sessions/:id/walk-up/confirm (a sibling endpoint)
 *    or the existing webhook handles it via PaymentIntent.succeeded.
 *
 * Body shape:
 *   { userId: string }                                  // existing user
 * | { newAccount: { firstName, lastName, email, phone?, gender? } }
 *
 * The endpoint will create a stub user row when newAccount is provided.
 */
import type { APIRoute } from "astro";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import {
  dropInSessions,
  dropInRateCard,
  type NewDropInBooking,
} from "@/lib/db/schema/drop-in";
import { users } from "@/lib/db/schema/users";

type UserGender = "male" | "female" | "non_binary" | "prefer_not_to_say";
import { venues } from "@/lib/db/schema/teams";
import { stripe } from "@/lib/stripe/client";
import { requireAdminAccess } from "@/lib/auth/roles";
import { resolveRate } from "@/lib/dropin/pricing";
import {
  createConfirmedBookingFreePath,
  getActiveMembershipForUser,
} from "@/lib/dropin/booking";

export const prerender = false;

const json = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

interface NewAccount {
  firstName: string;
  lastName: string;
  email: string;
  phone?: string;
  gender?: UserGender;
}

export const POST: APIRoute = async (context) => {
  const auth = await requireAdminAccess(context);
  if (!auth.authorized) return auth.response;

  const sessionId = context.params.id;
  if (!sessionId) return json({ error: "session id required" }, 400);

  let body: { userId?: string; newAccount?: NewAccount };
  try {
    body = await context.request.json();
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }

  const db = getDb();
  const [session] = await db
    .select()
    .from(dropInSessions)
    .where(eq(dropInSessions.id, sessionId))
    .limit(1);
  if (!session) return json({ error: "Session not found" }, 404);

  if (
    context.locals.organization &&
    session.organizationId !== context.locals.organization.id
  ) {
    return json({ error: "Forbidden" }, 403);
  }

  if (session.status !== "scheduled") {
    return json({ error: "Session not open for booking" }, 409);
  }

  // Resolve user (existing or newly created stub).
  let userId = body.userId ?? null;
  if (!userId && body.newAccount) {
    const [newUser] = await db
      .insert(users)
      .values({
        email: body.newAccount.email,
        firstName: body.newAccount.firstName,
        lastName: body.newAccount.lastName,
        phone: body.newAccount.phone ?? null,
        gender: body.newAccount.gender ?? null,
      })
      .onConflictDoUpdate({
        target: users.email,
        set: {
          firstName: body.newAccount.firstName,
          lastName: body.newAccount.lastName,
        },
      })
      .returning({ id: users.id });
    userId = newUser.id;
  }
  if (!userId) {
    return json({ error: "userId or newAccount required" }, 400);
  }

  const [rateCard] = await db
    .select()
    .from(dropInRateCard)
    .where(eq(dropInRateCard.organizationId, session.organizationId))
    .limit(1);
  if (!rateCard) return json({ error: "Rate card not configured" }, 500);

  const membership = await getActiveMembershipForUser(
    userId,
    session.organizationId,
  );
  const rate = resolveRate(session, { id: userId }, membership, rateCard);

  // Free path (member allotment / unlimited / $0 override): create immediately.
  if (rate.amountCents === 0) {
    const result = await createConfirmedBookingFreePath({
      sessionId,
      userId,
      source: "walk_up",
    });
    if (!result.ok) {
      return json({ error: result.error }, 409);
    }
    return json(
      {
        paymentRequired: false,
        bookingId: result.bookingId,
        teamAssignment: result.teamAssignment,
      },
      200,
    );
  }

  // Paid path: card-present PaymentIntent for the Terminal reader.
  if (!stripe) return json({ error: "Stripe not configured" }, 500);

  const [venue] = await db
    .select()
    .from(venues)
    .where(eq(venues.id, session.venueId))
    .limit(1);

  const partnerStripeAccountId = venue?.partnerStripeAccountId ?? null;
  const applicationFeePct = venue?.partnerApplicationFeePct ?? 0;
  const applicationFeeCents = partnerStripeAccountId
    ? Math.round((rate.amountCents * applicationFeePct) / 100)
    : undefined;

  const intent = await stripe.paymentIntents.create({
    amount: rate.amountCents,
    currency: "usd",
    payment_method_types: ["card_present"],
    capture_method: "automatic",
    metadata: {
      type: "dropin_booking_walk_up",
      session_id: sessionId,
      user_id: userId,
      payment_method: rate.paymentMethod,
      membership_id: rate.membershipId ?? "",
      organization_id: session.organizationId,
    },
    application_fee_amount: applicationFeeCents,
    transfer_data: partnerStripeAccountId
      ? { destination: partnerStripeAccountId }
      : undefined,
  });

  // Note: the booking row gets inserted on PaymentIntent.succeeded webhook.
  // We expose a metadata payload here so the front-desk panel can render
  // a confirmation screen once the reader returns.
  const intentBookingPayload: Pick<
    NewDropInBooking,
    "sessionId" | "userId" | "paymentMethod" | "membershipId"
  > = {
    sessionId,
    userId,
    paymentMethod: rate.paymentMethod,
    membershipId: rate.membershipId ?? null,
  };

  return json(
    {
      paymentRequired: true,
      paymentIntentId: intent.id,
      clientSecret: intent.client_secret,
      amountCents: rate.amountCents,
      bookingPreview: intentBookingPayload,
    },
    200,
  );
};
