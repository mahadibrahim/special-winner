/**
 * POST /api/dropin/guest-checkout
 *
 * Guest booking for drop-in sessions — the drop-in counterpart of
 * /api/registrations/guest-checkout. Drop-ins are impulse purchases;
 * bouncing anonymous visitors to /signin was costing the lowest-friction
 * sale in the catalog.
 *
 * Mirrors the registration guest-checkout semantics exactly:
 *   - upsert a passwordless user by email (parent role for new users)
 *   - existing email → booking attaches to that account; NO session
 *     cookie is set (account-takeover prevention), so the booker pays
 *     but can't read the account
 *   - new user → Lucia session cookie so the success page shows their
 *     booking
 *
 * Rate resolution uses the upserted user, so an existing member who
 * guest-books still gets their member rate. Paid path reuses
 * createDropInCheckoutSession — identical webhook metadata contract,
 * booking row created by `checkout.session.completed`. Free path books
 * immediately via the shared orchestrator.
 *
 * Waitlist is deliberately NOT offered to guests — joining one is a
 * commitment to come back later, which only makes sense with an account.
 * The UI shows "Sign in to join waitlist" when the session is full.
 */
import type { APIRoute } from "astro";
import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { users, userRoles, roles } from "@/lib/db/schema";
import {
  dropInSessions,
  dropInRateCard,
  dropInBookings,
} from "@/lib/db/schema/drop-in";
import { stripe } from "@/lib/stripe/client";
import { resolveRate } from "@/lib/dropin/pricing";
import {
  createConfirmedBookingFreePath,
  getActiveMembershipForUser,
} from "@/lib/dropin/booking";
import { createDropInCheckoutSession } from "@/lib/dropin/create-checkout";
import { createSession } from "@/lib/auth";
import { rateLimit, rateLimitedResponse } from "@/lib/auth/rate-limit";
import { brandFromHost } from "@/lib/organization/soccerone-routing";

export const prerender = false;

const bodySchema = z.object({
  sessionId: z.string().uuid(),
  firstName: z.string().trim().min(1).max(100),
  lastName: z.string().trim().min(1).max(100),
  email: z.string().trim().toLowerCase().email().max(320),
  waiverAccepted: z.literal(true),
  waiverName: z.string().trim().min(1).max(200),
});

const json = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

export const POST: APIRoute = async (context) => {
  const { request, locals, clientAddress } = context;

  // Signed-in users have the richer authed flow — don't let a stale tab
  // create a second parallel path.
  if (locals.user) {
    return json({ error: "Already signed in — use the standard booking flow" }, 409);
  }

  // Unauthenticated write endpoint → per-IP burst limit.
  const ip = clientAddress || "unknown";
  const ipLimit = rateLimit(`dropin-guest:ip:${ip}`, 5, 60_000);
  if (!ipLimit.allowed) {
    return rateLimitedResponse(ipLimit.retryAfter ?? 60);
  }

  let parsed;
  try {
    parsed = bodySchema.safeParse(await request.json());
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }
  if (!parsed.success) {
    return json(
      { error: "Validation failed", details: parsed.error.flatten().fieldErrors },
      400,
    );
  }
  const data = parsed.data;

  const db = getDb();
  const [session] = await db
    .select()
    .from(dropInSessions)
    .where(eq(dropInSessions.id, data.sessionId))
    .limit(1);
  if (!session) return json({ error: "Session not found" }, 404);

  // Multi-tenant guard — booking endpoint is host-scoped.
  if (locals.organization && session.organizationId !== locals.organization.id) {
    return json({ error: "Forbidden" }, 403);
  }

  if (session.status !== "scheduled") {
    return json({ error: "Session not open for booking" }, 409);
  }

  const [rateCard] = await db
    .select()
    .from(dropInRateCard)
    .where(eq(dropInRateCard.organizationId, session.organizationId))
    .limit(1);
  if (!rateCard) {
    return json({ error: "Rate card not configured" }, 500);
  }

  // Upsert user by email — same semantics as registration guest-checkout.
  let wasNewUser = false;
  const inserted = await db
    .insert(users)
    .values({
      email: data.email,
      passwordHash: null,
      firstName: data.firstName,
      lastName: data.lastName,
      emailVerified: false,
    })
    .onConflictDoNothing({ target: users.email })
    .returning();

  let userRow: typeof users.$inferSelect;
  if (inserted.length > 0) {
    userRow = inserted[0];
    wasNewUser = true;
    const [parentRole] = await db
      .select()
      .from(roles)
      .where(eq(roles.name, "parent"));
    if (parentRole) {
      await db.insert(userRoles).values({
        userId: userRow.id,
        roleId: parentRole.id,
        scopeType: "global",
      });
    }
  } else {
    const [existing] = await db
      .select()
      .from(users)
      .where(eq(users.email, data.email));
    if (!existing) {
      return json({ error: "Internal server error" }, 500);
    }
    userRow = existing;
  }

  // If this account already holds an active booking for the session,
  // surface that instead of double-charging.
  const [existingBooking] = await db
    .select({ status: dropInBookings.status })
    .from(dropInBookings)
    .where(
      and(
        eq(dropInBookings.sessionId, data.sessionId),
        eq(dropInBookings.userId, userRow.id),
      ),
    )
    .orderBy(dropInBookings.createdAt)
    .limit(1);
  if (
    existingBooking &&
    ["confirmed", "waitlisted", "pending_claim"].includes(existingBooking.status)
  ) {
    return json(
      {
        error:
          "This email already has a booking for this session. Sign in to view it.",
      },
      409,
    );
  }

  const membership = await getActiveMembershipForUser(
    userRow.id,
    session.organizationId,
  );
  const rate = resolveRate(session, userRow, membership, rateCard);
  const waiverSignedAt = new Date();

  // Free path → create immediately.
  if (rate.amountCents === 0) {
    const result = await createConfirmedBookingFreePath({
      sessionId: data.sessionId,
      userId: userRow.id,
      source: "online_booking",
      waiverSigned: true,
      waiverSignedAt,
      waiverSignedBy: data.waiverName,
    });
    if (!result.ok) {
      const httpStatus = result.error.code === "session_not_found" ? 404 : 409;
      return json({ error: result.error }, httpStatus);
    }
    if (wasNewUser) {
      await createSession(userRow.id, context);
    }
    return json(
      {
        bookingId: result.bookingId,
        paymentRequired: false,
        teamAssignment: result.teamAssignment,
        wasNewUser,
      },
      200,
    );
  }

  // Paid path → Stripe Checkout. Booking row created on webhook.
  if (!stripe) {
    return json({ error: "Stripe not configured" }, 500);
  }

  const checkout = await createDropInCheckoutSession({
    db,
    session,
    user: { id: userRow.id, email: userRow.email },
    rate,
    waiverSignedAt,
    waiverName: data.waiverName,
    extraMetadata: {
      via_guest_checkout: "true",
      // Storefront brand — host-derived, since both brands share one org.
      brand: brandFromHost(request.headers.get("host") ?? ""),
    },
  });

  // Account-takeover prevention: only set a session for genuinely new users.
  if (wasNewUser) {
    await createSession(userRow.id, context);
  }

  return json(
    {
      paymentRequired: true,
      checkoutUrl: checkout.checkoutUrl,
      checkoutSessionId: checkout.checkoutSessionId,
      wasNewUser,
    },
    200,
  );
};
