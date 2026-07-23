import type { APIRoute } from "astro";
import { db } from "@/lib/db";
import { z } from "zod";
import { stripe } from "@/lib/stripe/client";
import { rateLimit, rateLimitedResponse } from "@/lib/auth/rate-limit";
import { createSession } from "@/lib/auth";
import { finalizeTeamDeposit } from "@/lib/registrations/finalize-team-deposit";

const BodySchema = z.object({ paymentIntentId: z.string().trim().min(1).max(255) });

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

/**
 * Finalize a paid team deposit: create the captain account (if a guest) + the
 * team, then log the guest in. The browser calls this the instant Stripe
 * confirms the deposit; the `payment_intent.succeeded` webhook is an idempotent
 * backstop that does the same team creation (minus the session) if this call
 * never lands. Server independently re-verifies the intent with Stripe — the
 * client is trusted for nothing beyond the PaymentIntent id.
 */
export const POST: APIRoute = async (context) => {
  const { request, locals, clientAddress } = context;
  if (!db) return json({ error: "Database unavailable" }, 503);
  if (!stripe) return json({ error: "Payments are temporarily unavailable" }, 503);

  const ip = clientAddress || "unknown";
  const limit = rateLimit(`team-finalize:ip:${ip}`, 10, 60_000);
  if (!limit.allowed) return rateLimitedResponse(limit.retryAfter ?? 60);

  let parsed;
  try {
    parsed = BodySchema.safeParse(await request.json());
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }
  if (!parsed.success) return json({ error: "Invalid input" }, 400);

  let pi;
  try {
    pi = await stripe.paymentIntents.retrieve(parsed.data.paymentIntentId);
  } catch (err) {
    console.error("[team-finalize] PI retrieve failed", err);
    return json({ error: "Invalid payment" }, 400);
  }

  if (pi.status !== "succeeded" || pi.metadata?.kind !== "team_deposit_pending") {
    return json({ error: "This deposit hasn't completed yet." }, 400);
  }
  // Cross-tenant guard: the intent must belong to the resolved org.
  if (!locals.organization || pi.metadata?.organizationId !== locals.organization.id) {
    return json({ error: "Not found" }, 404);
  }

  let result;
  try {
    result = await finalizeTeamDeposit(pi);
  } catch (err) {
    console.error("[team-finalize] finalize failed", err);
    return json({ error: "We couldn't finish setting up your team. Your deposit is safe — please refresh." }, 500);
  }

  // Log a brand-new guest captain in (the webhook backstop can't set a cookie,
  // so this is the only place the session gets created for the happy path).
  if (result.wasNewUser && result.captainUserId) {
    try {
      await createSession(result.captainUserId, context);
    } catch (err) {
      console.error("[team-finalize] session create failed", err);
      // Non-fatal: the team exists; they can sign in with their email to reach it.
    }
  }

  return json(
    {
      ok: true,
      teamRegistrationId: result.teamRegistrationId,
      inviteToken: result.inviteToken,
      joinUrl: `/team/${result.inviteToken}`,
    },
    200,
  );
};
