/**
 * POST /api/rentals/blocks/:token/pay
 *
 * Mints a fresh Stripe Checkout Session for whatever the block owes right now
 * - deposit first, then the balance. Minting on demand (rather than at
 * send-link time) is the same pattern as /api/rentals/bookings/:id/pay: a
 * stale email link can never outlive its Stripe session, because the email
 * links to this page and the session is created at the click.
 *
 * The token is the only credential. NO session required - block renters
 * arrive from a text message and never sign up.
 *
 * Conflicts are re-checked HERE as well as inside the webhook transaction. A
 * block that has already lost its slots should never reach a card form; the
 * webhook check is the backstop for a slot lost during checkout itself.
 */
import type { APIRoute } from "astro";
import { and, asc, eq, ne } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { fieldRentals } from "@/lib/db/schema/field-rentals";
import { venues } from "@/lib/db/schema/teams";
import { stripe } from "@/lib/stripe/client";
import { rateLimit, rateLimitedResponse } from "@/lib/auth/rate-limit";
import { resolveBlockTokenResult, computeBlockOwed } from "@/lib/rentals/blocks/tokens";
import { findBlockRaceConflicts } from "@/lib/rentals/blocks/lifecycle";

export const prerender = false;

const json = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

export const POST: APIRoute = async ({ params, url, clientAddress }) => {
  // Unauthenticated endpoint that talks to Stripe - per-IP burst limit first.
  const ip = clientAddress || "unknown";
  const rl = rateLimit(`rental-block-pay:ip:${ip}`, 10, 60_000);
  if (!rl.allowed) return rateLimitedResponse(rl.retryAfter ?? 60);

  const token = params.token ?? "";
  const resolved = await resolveBlockTokenResult(token);
  if (!resolved.ok) {
    return json({ error: resolved.reason }, resolved.reason === "expired" ? 410 : 404);
  }
  const { block } = resolved;

  if (block.status === "cancelled") {
    return json({ error: "This booking was cancelled" }, 422);
  }

  const owed = computeBlockOwed(block);
  if (owed.kind === "none") {
    return json({ error: "Nothing is due on this booking" }, 422);
  }
  if (!stripe) return json({ error: "Stripe not configured" }, 500);

  const db = getDb();
  const sessions = await db
    .select({
      id: fieldRentals.id,
      venueId: fieldRentals.venueId,
      fieldNumber: fieldRentals.fieldNumber,
      startsAt: fieldRentals.startsAt,
      endsAt: fieldRentals.endsAt,
      partnerStripeAccountId: venues.partnerStripeAccountId,
      partnerApplicationFeePct: venues.partnerApplicationFeePct,
      venueName: venues.name,
    })
    .from(fieldRentals)
    .innerJoin(venues, eq(venues.id, fieldRentals.venueId))
    .where(and(eq(fieldRentals.blockId, block.id), ne(fieldRentals.status, "cancelled")))
    .orderBy(asc(fieldRentals.startsAt));

  if (sessions.length === 0) {
    return json({ error: "This booking has no sessions left" }, 422);
  }

  // Race re-check: the deposit leg is the one at risk (its sessions are only
  // pending_payment holds). Once the block is active its sessions are
  // confirmed and hold firm ledger rows, so nothing can have taken them.
  if (owed.kind === "deposit") {
    const conflicts = await findBlockRaceConflicts(block.id);
    if (conflicts.length > 0) {
      return json(
        {
          error:
            "Some of these dates are no longer available. Call the facility and we'll requote.",
          conflicts,
        },
        409,
      );
    }
  }

  // Connect split follows the first session's venue - a block spans one
  // location, and SoccerOne's partner venues share a single payout account.
  const first = sessions[0];
  const partnerStripeAccountId = first.partnerStripeAccountId ?? null;
  const applicationFeePct = first.partnerApplicationFeePct ?? 0;
  const applicationFeeCents = partnerStripeAccountId
    ? Math.round((owed.cents * applicationFeePct) / 100)
    : undefined;

  const appUrl = url.origin;
  const returnUrl = `${appUrl}/rentals/blocks/${token}`;

  try {
    const checkout = await stripe.checkout.sessions.create(
      {
        mode: "payment",
        payment_method_types: ["card"],
        customer_email: block.renterEmail ?? undefined,
        line_items: [
          {
            price_data: {
              currency: "usd",
              product_data: {
                name: `Field rental block - ${block.label}`,
                description:
                  owed.kind === "deposit"
                    ? `Deposit for ${sessions.length} session${sessions.length === 1 ? "" : "s"}`
                    : `Balance for ${sessions.length} session${sessions.length === 1 ? "" : "s"}`,
              },
              unit_amount: owed.cents,
            },
            quantity: 1,
          },
        ],
        metadata: {
          type: owed.kind === "deposit" ? "rental_block_deposit" : "rental_block_balance",
          block_id: block.id,
          organization_id: block.organizationId,
          brand: block.brand,
          renter_user_id: block.renterUserId ?? "",
          base_amount_cents: String(owed.cents),
        },
        payment_intent_data: partnerStripeAccountId
          ? {
              application_fee_amount: applicationFeeCents,
              transfer_data: { destination: partnerStripeAccountId },
            }
          : undefined,
        success_url: `${returnUrl}?paid=${owed.kind}`,
        cancel_url: `${returnUrl}?cancelled=1`,
      },
      { idempotencyKey: `${block.id}:${owed.kind}:${owed.cents}` },
    );
    return json({ checkoutUrl: checkout.url }, 200);
  } catch (err) {
    console.error("[rentals] block pay checkout session create failed", err);
    return json({ error: "Could not start checkout" }, 502);
  }
};
