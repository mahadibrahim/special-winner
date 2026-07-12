/**
 * POST /api/kiosk/[locationSlug]/walkin/start
 *
 * Creates a walk-in registration slot for an adult or minor arriving at the
 * kiosk without a prior online booking. Flow:
 *
 *   1. requireKioskLocation(slug) — resolve facility + org
 *   2. Validate the target session (a space in this facility, status=scheduled)
 *   3. Validate contact / parent fields; reject minors without parent info.
 *      contact.dob is optional for adults (owner decision 2026-07-12) but
 *      required whenever a `parent` payload is sent (the child/COPPA path) —
 *      without it we can't compute age and gate minor status at all.
 *   4. Create or find the booker user record (parent for minors, self for adults)
 *   5. For minors: create a family_members row (parent_user_id path). Adults
 *      never get a family_members row here — only a `users` row — so a
 *      missing DOB never touches the NOT NULL family_members.birth_date
 *      column (see resolvePerson: kind:"self" dedupes purely on
 *      selfUserId, never birthDate, so this endpoint intentionally skips it
 *      for the adult walk-in path rather than needing a sentinel DOB like
 *      add-walkup-to-pickup.ts's ADULT_SENTINEL_DOB).
 *   6. Resolve amountDueCents from session override or org rate card
 *   7. Inside one transaction: reject (409) if the session is already at
 *      capacity (checkSessionCapacityLocked — confirmed + pending_payment +
 *      pending_claim all count as occupying a seat, so a kiosk attendant
 *      can't hand out a hold for a seat that's already spoken for) or if the
 *      booker already has an active booking on this session, otherwise
 *      insert a dropInBookings row in `pending_payment` status with
 *      `promotionExpiresAt = now + 2h`.
 *      Real lifecycle now: the hold is a genuine payment-pending state —
 *      `expireOverduePromotions` (src/lib/dropin/promotion.ts) sweeps and
 *      cancels holds whose `promotionExpiresAt` has passed (freeing the
 *      slot for the waitlist), and a pre-expiry reminder is dispatched
 *      to the booker before that happens. See docs/superpowers/plans/
 *      2026-07-12-walkin-remote-payment.md for the full design.
 *      DUPLICATE GUARD: the partial unique index
 *      `drop_in_bookings_one_active_per_user_session` predicates on
 *      `status IN ('confirmed','waitlisted','pending_claim')` — it predates
 *      `pending_payment` and can't be extended by an additive migration
 *      without a same-transaction enum-use hazard (see the Task 1 report).
 *      So the "one active hold per user+session" rule is enforced here at
 *      the application layer instead of by the DB constraint.
 *   8. Mint a `walkin_session` self-service token pointing at the booking
 *   9. Return { token, url, bookingId, amountDueCents }
 */
import type { APIRoute } from "astro";
import { and, eq, inArray } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { dropInSessions, dropInBookings, dropInRateCard } from "@/lib/db/schema/drop-in";
import { users } from "@/lib/db/schema/users";
import { venues } from "@/lib/db/schema/teams";
import { resolvePerson } from "@/lib/registrations/resolve-person";
import { requireKioskLocation } from "@/lib/check-in/kiosk-auth";
import { mintToken } from "@/lib/check-in/tokens-db";
import { resolveRate, DEFAULT_WALK_UP_RATE_CENTS } from "@/lib/dropin/pricing";
import { checkSessionCapacityLocked } from "@/lib/dropin/booking";
import { rateLimit, rateLimitedResponse } from "@/lib/auth/rate-limit";

export const prerender = false;

const json = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

// How long a walk-in payment hold occupies its slot before the
// expire-pending-claims sweep releases it. Keep in sync with the
// walkin_session token TTL minted below (ttlHours) — the pay link should
// not outlive the hold it pays for. Exported so src/lib/dropin/promotion.ts
// can reuse the same constant for its sweep window instead of duplicating
// the magic number.
export const WALK_IN_HOLD_TTL_MS = 2 * 3_600_000;

function computeAge(dobStr: string): number {
  const dob = new Date(dobStr);
  const now = new Date();
  let age = now.getUTCFullYear() - dob.getUTCFullYear();
  const monthDiff = now.getUTCMonth() - dob.getUTCMonth();
  if (monthDiff < 0 || (monthDiff === 0 && now.getUTCDate() < dob.getUTCDate())) {
    age -= 1;
  }
  return age;
}

export const POST: APIRoute = async ({ params, request, clientAddress }) => {
  const slug = params.locationSlug ?? "";

  // The kiosk slug is public (non-secret), and this endpoint creates booking
  // rows + downstream PaymentIntents — throttle per IP+location as defense in
  // depth. 10/min is generous for a real front-desk attendant. (In-memory/
  // fail-open limiter; durable shared store is the real fix — see rate-limit.ts.)
  const ip = clientAddress || "unknown";
  const ipLimit = rateLimit(`kiosk-walkin-start:${slug}:${ip}`, 10, 60_000);
  if (!ipLimit.allowed) {
    return rateLimitedResponse(ipLimit.retryAfter ?? 60);
  }

  const locationResult = await requireKioskLocation(slug);
  if (!locationResult.ok) return locationResult.response;
  const { location } = locationResult;

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }

  const sessionId = body.sessionId as string | undefined;
  const contact = body.contact as Record<string, unknown> | undefined;
  const parent = body.parent as Record<string, unknown> | undefined;

  // --- Validate required fields ---
  if (!sessionId) return json({ error: "sessionId is required" }, 422);
  if (!contact) return json({ error: "contact is required" }, 422);

  const contactFirstName = (contact.firstName as string | undefined)?.trim();
  const contactLastName = (contact.lastName as string | undefined)?.trim();
  const contactEmail = (contact.email as string | undefined)?.trim().toLowerCase();
  const contactPhone = (contact.phone as string | undefined)?.trim() ?? null;
  const contactDobRaw = (contact.dob as string | undefined)?.trim();
  const contactDob = contactDobRaw && contactDobRaw.length > 0 ? contactDobRaw : undefined;

  if (!contactFirstName) return json({ error: "contact.firstName is required" }, 422);
  if (!contactLastName) return json({ error: "contact.lastName is required" }, 422);
  if (!contactEmail) return json({ error: "contact.email is required" }, 422);

  // DOB is optional for adult self walk-ins (owner decision 2026-07-12) but
  // still required whenever the caller is submitting a child (signalled by a
  // `parent` payload, the same signal WalkInFlow/WalkInWizard use to decide
  // whether to collect parent fields) — without a DOB we can't verify age
  // for the COPPA path. `body.parent` is only ever sent by the client when
  // the submitter believes this is a minor.
  if (!contactDob && parent) {
    return json({ error: "contact.dob is required for minors" }, 422);
  }

  // Validate dob format when present.
  if (contactDob && !/^\d{4}-\d{2}-\d{2}$/.test(contactDob)) {
    return json({ error: "contact.dob must be YYYY-MM-DD" }, 422);
  }

  // No DOB → treat as an adult (minors always carry a DOB per the check
  // above). When a DOB IS present, age still gates minor status regardless
  // of whether `parent` was sent — this is what already protects against a
  // real minor's DOB being submitted without parent info (see the
  // isMinor-required-parent-fields check below).
  const age = contactDob ? computeAge(contactDob) : null;
  const isMinor = age !== null && age < 18;

  // For minors, parent fields are required
  const parentFirstName = (parent?.firstName as string | undefined)?.trim();
  const parentLastName = (parent?.lastName as string | undefined)?.trim();
  const parentEmail = (parent?.email as string | undefined)?.trim().toLowerCase();
  const parentPhone = (parent?.phone as string | undefined)?.trim() ?? null;

  if (isMinor) {
    if (!parentFirstName) return json({ error: "parent.firstName is required for minors" }, 422);
    if (!parentLastName) return json({ error: "parent.lastName is required for minors" }, 422);
    if (!parentEmail) return json({ error: "parent.email is required for minors" }, 422);
  }

  const db = getDb();

  // --- Validate session ---
  const [session] = await db
    .select()
    .from(dropInSessions)
    .where(eq(dropInSessions.id, sessionId))
    .limit(1);

  if (!session) return json({ error: "Session not found" }, 404);

  // The kiosk is facility-scoped: the chosen session may run in any space
  // of this location. Confirm its venue belongs to the kiosk's facility.
  const [sessionVenue] = await db
    .select({ locationId: venues.locationId })
    .from(venues)
    .where(eq(venues.id, session.venueId))
    .limit(1);
  if (!sessionVenue || sessionVenue.locationId !== location.id) {
    return json({ error: "Session is not at this facility" }, 422);
  }

  if (session.status !== "scheduled") return json({ error: "Session is not open for registration" }, 422);

  // --- Resolve rate ---
  let [rateCard] = await db
    .select()
    .from(dropInRateCard)
    .where(eq(dropInRateCard.organizationId, location.organizationId))
    .limit(1);
  if (!rateCard) {
    // Ensure a rate card exists (upsert)
    await db
      .insert(dropInRateCard)
      .values({ organizationId: location.organizationId })
      .onConflictDoNothing();
    [rateCard] = await db
      .select()
      .from(dropInRateCard)
      .where(eq(dropInRateCard.organizationId, location.organizationId))
      .limit(1);
  }
  // Kiosk walk-ins always pay the walk-up rate (no membership lookup here).
  const amountDueCents = rateCard
    ? resolveRate(session, null, null, rateCard, "walk_up").amountCents
    : DEFAULT_WALK_UP_RATE_CENTS;

  // --- Create or find booker user ---
  // For adults: contact IS the booker.
  // For minors: parent is the booker; contact info (name + dob) goes on family_members.
  const bookerEmail = isMinor ? parentEmail! : contactEmail;
  const bookerFirstName = isMinor ? parentFirstName! : contactFirstName;
  const bookerLastName = isMinor ? parentLastName! : contactLastName;
  const bookerPhone = isMinor ? parentPhone : contactPhone;

  let [existingUser] = await db
    .select()
    .from(users)
    .where(eq(users.email, bookerEmail))
    .limit(1);

  let bookerUserId: string;
  if (existingUser) {
    bookerUserId = existingUser.id;
  } else {
    const [newUser] = await db
      .insert(users)
      .values({
        email: bookerEmail,
        firstName: bookerFirstName,
        lastName: bookerLastName,
        phone: bookerPhone,
        emailVerified: false,
        phoneVerified: false,
      })
      .returning({ id: users.id });
    bookerUserId = newUser.id;
  }

  // --- For minors: ensure a family_members row exists (parentUserId path) ---
  // resolvePerson dedupes on (parentUserId, name, birthDate) and avoids the
  // self/parent XOR constraint race — replaces the hand-rolled lookup.
  if (isMinor) {
    // isMinor is only ever true when contactDob was present and parsed
    // (see the age computation above) — non-null assertion is safe here.
    await resolvePerson(db, {
      kind: "dependent",
      parentUserId: bookerUserId,
      firstName: contactFirstName,
      lastName: contactLastName,
      birthDate: contactDob!,
    });
  }

  // --- Duplicate-hold guard + insert, atomically ---
  // See module-level comment: the DB unique index doesn't cover
  // pending_payment, so a second hold on the same session for the same
  // booker is rejected here rather than by a constraint violation.
  const ACTIVE_BOOKING_STATUSES = [
    "confirmed",
    "waitlisted",
    "pending_claim",
    "pending_payment",
  ] as const;

  const holdResult = await db.transaction(
    async (
      tx,
    ): Promise<
      | { kind: "created"; row: typeof dropInBookings.$inferSelect }
      | { kind: "duplicate" }
      | { kind: "session_gone" }
      | { kind: "session_full" }
    > => {
      // Lock the session row FIRST — this serializes concurrent walk-in
      // starts on the same session, so the existence/capacity checks below
      // can't race a parallel insert (the check + insert would otherwise be
      // a TOCTOU window the partial unique index can't backstop, since its
      // predicate doesn't cover pending_payment). Lock ordering: every
      // transaction that touches both the session row and a booking row
      // locks the session first — same order as createConfirmedBookingFreePath
      // and handle-dropin-checkout-complete.ts. (handle-dropin-walkin-payment.ts
      // locks only a booking row and never the session row in its
      // transaction, so it can't deadlock against this ordering.)
      const [lockedSession] = await tx
        .select({ id: dropInSessions.id, status: dropInSessions.status })
        .from(dropInSessions)
        .where(eq(dropInSessions.id, session.id))
        .for("update");
      // Re-check under the lock: the earlier (unlocked) validation could
      // have raced a session cancel/delete.
      if (!lockedSession || lockedSession.status !== "scheduled") {
        return { kind: "session_gone" };
      }

      // Capacity gate — shared with the free-path orchestrator and the
      // paid Checkout webhook (checkSessionCapacityLocked). A kiosk hold
      // occupies a real physical seat just like a confirmed booking, so it
      // must not be handed out past capacity.
      const capCheck = await checkSessionCapacityLocked(tx, session.id);
      if (capCheck.full) {
        return { kind: "session_full" };
      }

      const [existingActive] = await tx
        .select({ id: dropInBookings.id })
        .from(dropInBookings)
        .where(
          and(
            eq(dropInBookings.sessionId, session.id),
            eq(dropInBookings.userId, bookerUserId),
            inArray(dropInBookings.status, ACTIVE_BOOKING_STATUSES),
          ),
        )
        .limit(1);
      if (existingActive) {
        return { kind: "duplicate" };
      }

      const [row] = await tx
        .insert(dropInBookings)
        .values({
          sessionId: session.id,
          userId: bookerUserId,
          status: "pending_payment",
          source: "walk_up",
          paymentMethod: "card_online",
          amountPaidCents: 0,
          promotionExpiresAt: new Date(Date.now() + WALK_IN_HOLD_TTL_MS),
          // At-facility kiosk: no brand host signal. Column default ("aspire") applies.
        })
        .returning();
      return { kind: "created", row };
    },
  );

  if (holdResult.kind === "session_gone") {
    return json({ error: "Session is not open for registration" }, 422);
  }
  if (holdResult.kind === "session_full") {
    return json({ error: "Session is full" }, 409);
  }
  if (holdResult.kind === "duplicate") {
    return json(
      { error: "This person already has an active booking for this session" },
      409,
    );
  }
  const booking = holdResult.row;

  // --- Mint self-service token ---
  const recipientEmail = bookerEmail;
  const recipientPhone = bookerPhone ?? null;
  const appUrl = import.meta.env.PUBLIC_APP_URL ?? "http://localhost:4321";

  const tok = await mintToken({
    kind: "walkin_session",
    targetId: booking.id,
    organizationId: location.organizationId,
    venueId: session.venueId,
    sentVia: "kiosk_search",
    recipientUserId: bookerUserId,
    recipientEmail,
    recipientPhone,
    createdByUserId: null,
    ttlHours: 2, // Walk-in token expires in 2h — shorter TTL than the default 6h
  });

  return json(
    {
      token: tok.token,
      url: `${appUrl}/self-serve/${tok.token}`,
      bookingId: booking.id,
      amountDueCents,
    },
    200,
  );
};
