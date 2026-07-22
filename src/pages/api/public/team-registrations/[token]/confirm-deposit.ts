import type { APIRoute } from "astro";
import { db } from "@/lib/db";
import { teamRegistrations } from "@/lib/db/schema";
import { eq, sql } from "drizzle-orm";
import { z } from "zod";
import { stripe } from "@/lib/stripe/client";
import { rateLimit, rateLimitedResponse } from "@/lib/auth/rate-limit";

const BodySchema = z.object({
  paymentIntentId: z.string().trim().min(1).max(255),
});

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

/**
 * Client-confirmed bridge over the same Stripe-webhook-lag window that
 * `payment-confirmation-signal.ts` covers for registration payments — but
 * server-side and money-relevant, so it can't be a localStorage stub.
 *
 * A captain who pays the $200 team deposit and immediately clicks "Register
 * myself" would otherwise be quoted full price: `teamDepositPaid()`
 * (captain-credit.ts) reads only webhook-written state
 * (`handle-team-deposit-succeeded.ts`), and the `payment_intent.succeeded`
 * webhook can take seconds to land. This endpoint lets the browser that just
 * watched Stripe confirm the deposit tell the server directly — but only
 * after the server independently re-verifies with Stripe (never trusting the
 * client beyond the PaymentIntent id).
 *
 * Deliberately a SUBSET of what the webhook does: it flips
 * `backstopStatus` "none" → "pending" and best-effort fills
 * `captainPaymentMethodId` when unset, which is all `teamDepositPaid()` and
 * the credit-preview math need. It never inserts the `payments` ledger row
 * or fires analytics — those remain the webhook's job, whichever order the
 * two land in. See `handleTeamDepositSucceeded`'s dedupe comment for how
 * that function stays correct regardless of whether this bridge already
 * flipped `backstopStatus`.
 */
export const POST: APIRoute = async ({ params, request, clientAddress, locals }) => {
  const token = params.token;
  if (!token) {
    return json({ error: "Missing token" }, 400);
  }

  if (!db) {
    return json({ error: "Database unavailable" }, 503);
  }

  // Public/unauthenticated by token, same idiom as team-registrations/index.ts.
  const ip = clientAddress || "unknown";
  const ipLimit = rateLimit(`team-confirm-deposit:ip:${ip}`, 5, 60_000);
  if (!ipLimit.allowed) {
    return rateLimitedResponse(ipLimit.retryAfter ?? 60);
  }

  let parsed;
  try {
    const body = await request.json();
    parsed = BodySchema.safeParse(body);
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }
  if (!parsed.success) {
    return json({ error: "Invalid input", issues: parsed.error.issues }, 400);
  }
  const { paymentIntentId } = parsed.data;

  try {
    const teamRow = await db
      .select({
        id: teamRegistrations.id,
        organizationId: teamRegistrations.organizationId,
      })
      .from(teamRegistrations)
      .where(eq(teamRegistrations.inviteToken, token))
      .limit(1);

    if (teamRow.length === 0) {
      return json({ error: "Team not found" }, 404);
    }
    const team = teamRow[0]!;

    // Cross-tenant guard: 404 (not 403) — consistent with the sibling
    // [token].ts and [token]/invite.ts handlers.
    const organization = locals.organization;
    if (!organization || team.organizationId !== organization.id) {
      return json({ error: "Not found" }, 404);
    }

    if (!stripe) {
      return json({ error: "Stripe not configured" }, 503);
    }

    let paymentIntent;
    try {
      paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);
    } catch (err) {
      console.error("[team-registrations/[token]/confirm-deposit] PI retrieve failed", err);
      return json({ error: "Invalid payment intent" }, 400);
    }

    if (
      paymentIntent.status !== "succeeded" ||
      paymentIntent.metadata?.kind !== "team_deposit" ||
      paymentIntent.metadata?.team_registration_id !== team.id
    ) {
      return json({ error: "Payment intent does not match this team's deposit" }, 400);
    }

    const paymentMethodId =
      typeof paymentIntent.payment_method === "string"
        ? paymentIntent.payment_method
        : (paymentIntent.payment_method?.id ?? null);

    // Single atomic UPDATE — no read-then-write race with the webhook.
    // `backstopStatus` only advances out of "none"; a status the webhook (or
    // a later backstop charge) has already moved past "pending" is left
    // alone. `captainPaymentMethodId` fills in only if still unset.
    await db
      .update(teamRegistrations)
      .set({
        backstopStatus: sql`CASE WHEN ${teamRegistrations.backstopStatus} = 'none' THEN 'pending' ELSE ${teamRegistrations.backstopStatus} END`,
        ...(paymentMethodId
          ? {
              captainPaymentMethodId: sql`COALESCE(${teamRegistrations.captainPaymentMethodId}, ${paymentMethodId})`,
            }
          : {}),
        updatedAt: new Date(),
      })
      .where(eq(teamRegistrations.id, team.id));

    return json({ ok: true }, 200);
  } catch (err) {
    console.error("[team-registrations/[token]/confirm-deposit] failed", err);
    return json({ error: "Could not confirm deposit" }, 500);
  }
};
