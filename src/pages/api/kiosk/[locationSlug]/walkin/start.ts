/**
 * POST /api/kiosk/[locationSlug]/walkin/start
 *
 * Creates a walk-in registration slot for an adult or minor arriving at the
 * kiosk without a prior online booking. Flow:
 *
 *   1. requireKioskLocation(slug) — resolve facility + org
 *   2. Validate the target session (a space in this facility, status=scheduled,
 *      endsAt still in the future — mirrors the GET /sessions listing filter,
 *      but enforced server-side since this endpoint is public/unauthenticated)
 *   3. Validate contact / parent fields; reject minors without parent info.
 *      contact.dob is optional for adults (owner decision 2026-07-12) but
 *      required whenever a `parent` payload is sent (the child/COPPA path) —
 *      without it we can't compute age and gate minor status at all.
 *   4. Create or find the booker user record (parent for minors, self for adults)
 *   5. For minors: create a family_members row (parent_user_id path) and stamp
 *      its id onto the booking (`family_member_id`) — the booking's userId is
 *      the PARENT, so this column is the only thing that says who actually
 *      plays. resolveSigner() reads it to hand the guardian the GUARDIAN
 *      waiver and to file the kiosk photo against the child. Adults
 *      never get a family_members row here — only a `users` row — so a
 *      missing DOB never touches the NOT NULL family_members.birth_date
 *      column (see resolvePerson: kind:"self" dedupes purely on
 *      selfUserId, never birthDate, so this endpoint intentionally skips it
 *      for the adult walk-in path rather than needing a sentinel DOB like
 *      add-walkup-to-pickup.ts's ADULT_SENTINEL_DOB).
 *   6. Resolve amountDueCents. PICKUP: session override or org rate card
 *      (walk-up channel). CLASS (`kind='class'`): the session's own class
 *      rates only — member rate when the CHILD holds an active membership,
 *      otherwise the public class rate; never the rate card (that card is the
 *      adult pickup price list). A class also REQUIRES a child participant
 *      and must pass the class-slot template's age gate — both enforced
 *      before any row is written. See src/lib/classes/class-walkup.ts.
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
 *      DUPLICATE GUARD: migration 0086 replaced the partial unique index
 *      with `drop_in_bookings_one_active_per_user_session_v2`, whose
 *      predicate covers
 *      `status IN ('confirmed','waitlisted','pending_claim','pending_payment')`
 *      — DB-level protection is restored now that scripts/db-migrate.ts
 *      applies each migration file in its own transaction (see that
 *      script's header; the Task 1 report has the original hazard). The
 *      application-layer check inside the transaction below stays as
 *      belt-and-suspenders (returns a clean 409 pre-insert instead of
 *      surfacing a raw unique-violation from the DB).
 *   8. Mint a `walkin_session` self-service token pointing at the booking
 *   9. Return { token, url, bookingId, amountDueCents }
 */
import type { APIRoute } from "astro";
import { and, eq, inArray, isNull } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { dropInSessions, dropInBookings, dropInRateCard } from "@/lib/db/schema/drop-in";
import { users } from "@/lib/db/schema/users";
import { venues } from "@/lib/db/schema/teams";
import { resolvePerson } from "@/lib/registrations/resolve-person";
import {
  WAIVER_ON_FILE_ATTRIBUTION,
  hasValidLiabilityWaiver,
} from "@/lib/consents/liability";
import { requireKioskLocation } from "@/lib/check-in/kiosk-auth";
import { mintToken } from "@/lib/check-in/tokens-db";
import { resolveRate, DEFAULT_WALK_UP_RATE_CENTS } from "@/lib/dropin/pricing";
import { checkSessionCapacityLocked } from "@/lib/dropin/booking";
import { classRateNotConfigured } from "@/lib/classes/class-rate";
import {
  CLASS_AGE_INELIGIBLE,
  CLASS_AGE_INELIGIBLE_MESSAGE,
  CLASS_REQUIRES_CHILD,
  CLASS_REQUIRES_CHILD_DESK_MESSAGE,
  isClassWalkUpAgeIneligible,
  resolveClassWalkUpRate,
} from "@/lib/classes/class-walkup";
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

export const POST: APIRoute = async ({ params, request, clientAddress, locals }) => {
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

  const locationResult = await requireKioskLocation(
    slug,
    locals.organization?.id ?? null,
  );
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

  // The GET /sessions listing already hides sessions whose endsAt is in the
  // past (a walk-in must never be able to pay to join this morning's 9am
  // pickup at 8pm) — but that's a UI-only filter. This endpoint is public
  // and unauthenticated, and a kiosk iPad left open for hours can still
  // submit a stale sessionId from an earlier fetch. Enforce the same rule
  // server-side so a direct/stale call can't start (and later pay for) a
  // walk-in on a session that has already ended.
  if (session.endsAt <= new Date()) {
    return json({ error: "That session has already ended. Please pick another." }, 422);
  }

  // --- CLASS eligibility (kind='class' only) -----------------------------
  // A class is a kids' product: every class booking path (allotment, trial,
  // credit, paid make-up) is keyed to a `family_members` row, and the online
  // door refuses a bare adult booking with `class_requires_child`. The desk
  // must refuse it too — otherwise an adult could walk themselves into a
  // children's class at the kiosk, priced (before this change) off the adult
  // pickup rate card. At this endpoint the child is signalled by minor
  // status: a minor contact carries a `parent` payload and gets the
  // `family_members` row created below; an adult contact never does.
  if (session.kind === "class") {
    if (!isMinor) {
      return json(
        { error: CLASS_REQUIRES_CHILD_DESK_MESSAGE, code: CLASS_REQUIRES_CHILD },
        422,
      );
    }
    // Age gate against the class-slot template, anchored on the session the
    // walk-up is buying. `contactDob` is always present for a minor (checked
    // above). A template with no min/max, or a session with no template,
    // skips the gate — see isClassWalkUpAgeIneligible.
    if (await isClassWalkUpAgeIneligible(session, contactDob!, db)) {
      return json(
        { error: CLASS_AGE_INELIGIBLE_MESSAGE, code: CLASS_AGE_INELIGIBLE },
        422,
      );
    }
    // Cheap pre-check, before any row is written: a class carrying NEITHER
    // rate can't be priced for anybody, member or not. The real, membership-
    // sensitive decision happens once the person exists (see "Resolve rate"
    // below) — this only spares a doomed request the user + family_members
    // rows it would otherwise leave behind on its way to the same 409.
    if (session.sessionRateCents === null && session.memberRateCents === null) {
      return classRateNotConfigured(session, "session", {
        component: "api/kiosk/walkin/start",
      });
    }
  }

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
  // The row's id is carried onto the booking below (dropInBookings.familyMemberId)
  // — that is the ONLY link from the booking back to the child. The booking's
  // userId is the PARENT, so without it resolveSigner() cannot tell a minor
  // walk-in from an adult one: the guardian would be handed the adult waiver
  // and the child's photo would be written to the parent's avatar.
  let bookingFamilyMemberId: string | null = null;
  if (isMinor) {
    // isMinor is only ever true when contactDob was present and parsed
    // (see the age computation above) — non-null assertion is safe here.
    const person = await resolvePerson(db, {
      kind: "dependent",
      parentUserId: bookerUserId,
      firstName: contactFirstName,
      lastName: contactLastName,
      birthDate: contactDob!,
    });
    bookingFamilyMemberId = person.id;
  }

  // --- Resolve rate ------------------------------------------------------
  // Deliberately AFTER the person resolution above: a class is priced for the
  // CHILD (their membership, not the booker's), so the price can't be quoted
  // until the `family_members` row exists.
  let amountDueCents: number;
  if (session.kind === "class") {
    // CLASS: the price comes from the session (copied down from its
    // class-slot template) and from the CHILD's own membership — never from
    // `resolveRate` + the org `drop_in_rate_card`, which is the ADULT PICKUP
    // price list. See src/lib/classes/class-walkup.ts. The rate-card
    // read/upsert below is skipped entirely on this branch: there is nothing
    // in that card a class may consult, including its DEFAULT_WALK_UP_RATE_CENTS
    // fallback. A class with no rate configured is a config error → 409,
    // before any hold is created.
    // bookingFamilyMemberId is non-null here: `session.kind === "class"`
    // required isMinor above, and every minor gets a person row.
    const quote = await resolveClassWalkUpRate(session, bookingFamilyMemberId!, db);
    if (!quote.ok) {
      return classRateNotConfigured(session, quote.need, {
        component: "api/kiosk/walkin/start",
      });
    }
    amountDueCents = quote.amountCents;
  } else {
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
    amountDueCents = rateCard
      ? resolveRate(session, null, null, rateCard, "walk_up").amountCents
      : DEFAULT_WALK_UP_RATE_CENTS;
  }

  // --- Annual waiver: is this participant already covered? -------------
  // A booking is BORN with the on-file shape when the person already has a
  // valid liability consent for this org. Without it the row would sit at
  // `waiverSigned: false` forever — the kiosk and self-serve surfaces skip
  // the ask (build-context consults the same predicate), so nothing would
  // ever flip the flag, and the STAFF surfaces that count it — the day
  // view's `waiversOutstanding` (src/lib/check-in/day-view.ts:85) and the
  // roll-call chip — would show a phantom outstanding waiver and reproduce
  // the redundant ask at the desk.
  //
  // Only the MINOR path has a person today: adult walk-ins get a `users`
  // row and no `family_members` row (see step 5 in the module doc), so
  // `bookingFamilyMemberId` is null and this is skipped. Keyed on the id
  // rather than on `isMinor` so it extends itself the day adults gain one.
  //
  // Read OUTSIDE the transaction on purpose: the tx below holds a row lock
  // on the session and serializes every concurrent walk-in start on it, so
  // an extra indexed read belongs before the lock, not inside it. The race
  // it admits — a consent expiring in the microseconds between here and the
  // insert — costs one redundant waiver ask.
  let participantWaiverOnFile = false;
  if (bookingFamilyMemberId) {
    try {
      participantWaiverOnFile = await hasValidLiabilityWaiver(
        bookingFamilyMemberId,
        location.organizationId,
        db,
      );
    } catch (err) {
      // Fail towards ASKING — a kiosk must never 500 over this, and a
      // redundant signature is far cheaper than a missing release.
      console.error("[walkin.start] waiver validity lookup failed", err);
    }
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
        .select({
          id: dropInSessions.id,
          status: dropInSessions.status,
          capacity: dropInSessions.capacity,
        })
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
      // must not be handed out past capacity. `lockedSession.capacity` was
      // already fetched above (same locked row) — pass it through instead
      // of re-selecting it.
      const capCheck = await checkSessionCapacityLocked(
        tx,
        session.id,
        lockedSession.capacity,
      );
      if (capCheck.full) {
        return { kind: "session_full" };
      }

      // Duplicate check keys on the PARTICIPANT, not the booker (#397).
      // A minor booking carries the parent's userId with the child in
      // familyMemberId — keying on userId alone 409'd a parent's second
      // child as a duplicate of the first. familyMemberId NULL means "the
      // booking's user is the participant" (adult walk-ins, online drop-ins),
      // so the adult predicate also requires NULL: a parent who walked a
      // child in can still walk themselves in. The participant-keyed
      // partial unique index (_v3, COALESCE(family_member_id, user_id))
      // backstops the same rule at the DB layer.
      const [existingActive] = await tx
        .select({ id: dropInBookings.id })
        .from(dropInBookings)
        .where(
          and(
            eq(dropInBookings.sessionId, session.id),
            inArray(dropInBookings.status, ACTIVE_BOOKING_STATUSES),
            bookingFamilyMemberId
              ? eq(dropInBookings.familyMemberId, bookingFamilyMemberId)
              : and(
                  eq(dropInBookings.userId, bookerUserId),
                  isNull(dropInBookings.familyMemberId),
                ),
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
          // Minor walk-in: the participant is the child, not the booker.
          familyMemberId: bookingFamilyMemberId,
          status: "pending_payment",
          source: "walk_up",
          paymentMethod: "card_online",
          amountPaidCents: 0,
          // Born covered by the person's ANNUAL waiver — see the lookup
          // above. `waiverSignedAt` is deliberately left unset (NULL): this
          // is a derived copy of an earlier signature, and
          // hasValidLiabilityWaiver's legacy fallback accepts any DATED
          // drop_in_bookings row, so dating it would let each new hold renew
          // the very window it was derived from.
          ...(participantWaiverOnFile
            ? {
                waiverSigned: true,
                waiverSignedBy: WAIVER_ON_FILE_ATTRIBUTION,
              }
            : {}),
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
