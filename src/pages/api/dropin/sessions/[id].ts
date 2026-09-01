/**
 * GET /api/dropin/sessions/:id
 *
 * Detail endpoint for the session detail page. Returns:
 *   - the session row
 *   - venue name + venue id
 *   - confirmed count + waitlist count
 *   - rate-card defaults (cancel window, promo window, default rates)
 *   - per-user resolved price IF the request is authenticated
 *
 * The per-user resolved price is what the BookButton displays. Anonymous
 * visitors see the public session rate.
 */
import type { APIRoute } from "astro";
import { and, eq, sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import {
  dropInSessions,
  dropInBookings,
  dropInRateCard,
} from "@/lib/db/schema/drop-in";
import { venues } from "@/lib/db/schema/teams";
import { users } from "@/lib/db/schema/users";
import { hostProfiles } from "@/lib/db/schema/hosts";
import { familyMembers } from "@/lib/db/schema/registrations";
import { hasValidLiabilityWaiver } from "@/lib/consents/liability";
import { resolveRate } from "@/lib/dropin/pricing";
import { getActiveMembershipForUser } from "@/lib/dropin/booking";
import { resolveClassWalkUpRate } from "@/lib/classes/class-walkup";
import { reportClassRateNotConfigured } from "@/lib/classes/class-rate";
import { stripe } from "@/lib/stripe/client";
import { getSignedGetUrl } from "@/lib/storage/r2";

export const prerender = false;

// pending_payment (kiosk walk-in hold) is included so a customer who
// already holds a walk-in hold sees "already booked" instead of a duplicate
// "Book now" CTA on the public session page — see BookButton.tsx.
const ACTIVE_BOOKING_STATUSES = ["confirmed", "waitlisted", "pending_payment", "pending_claim"];

// Per-process dedupe for the "unpriced class" ops report. This endpoint is
// polled every ~1.5s for up to 20s after a fresh paid booking (see
// SessionDetail's success poll), so without this a single misconfigured
// class session could file the same config-error report dozens of times per
// visitor. Mirrors GET /api/kiosk/[locationSlug]/sessions's identical
// per-session dedupe. Keyed by `${sessionId}:${need}` since the "session"
// and "member" rate needs are independent config gaps.
const reportedUnpricedClassNeeds = new Set<string>();

function reportUnpricedClassOnce(
  session: { id: string; organizationId: string },
  need: "session" | "member",
) {
  const key = `${session.id}:${need}`;
  if (reportedUnpricedClassNeeds.has(key)) return;
  reportedUnpricedClassNeeds.add(key);
  reportClassRateNotConfigured(session, need, {
    component: "api/dropin/sessions/[id]",
  });
}

const json = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

export const GET: APIRoute = async ({ params, locals, url }) => {
  const sessionId = params.id;
  if (!sessionId) return json({ error: "session id required" }, 400);

  const db = getDb();
  const [row] = await db
    .select({
      session: dropInSessions,
      venueName: venues.name,
    })
    .from(dropInSessions)
    .leftJoin(venues, eq(venues.id, dropInSessions.venueId))
    .where(eq(dropInSessions.id, sessionId))
    .limit(1);

  if (!row) return json({ error: "Session not found" }, 404);

  // Multi-tenant guard.
  if (locals.organization && row.session.organizationId !== locals.organization.id) {
    return json({ error: "Forbidden" }, 403);
  }

  // Host block — only shown for an active, org-scoped host profile. A
  // paused/revoked host still has hostUserId set on old sessions, but the
  // public page shouldn't surface them as a live host.
  let host: { firstName: string; photoUrl: string | null; bio: string | null } | null = null;
  if (row.session.hostUserId) {
    const [profile] = await db
      .select({
        firstName: users.firstName,
        bio: hostProfiles.bio,
        photoKey: hostProfiles.photoKey,
      })
      .from(hostProfiles)
      .innerJoin(users, eq(users.id, hostProfiles.userId))
      .where(
        and(
          eq(hostProfiles.userId, row.session.hostUserId),
          eq(hostProfiles.organizationId, row.session.organizationId),
          eq(hostProfiles.status, "active"),
        ),
      )
      .limit(1);
    if (profile) {
      // Resolve the photo URL defensively — this is a public, unauthenticated
      // endpoint, and a signing failure must never break the whole booking
      // page for a session that otherwise has everything it needs.
      let photoUrl: string | null = null;
      if (profile.photoKey) {
        if (profile.photoKey.startsWith("https://")) {
          // Link-mode application (no-R2 degrade path) stored a full URL —
          // pass it through as-is rather than trying to sign it as an R2 key.
          photoUrl = profile.photoKey;
        } else if (process.env.R2_MOCK === "1") {
          photoUrl = `https://mock-r2.local/${profile.photoKey}`;
        } else {
          try {
            photoUrl = await getSignedGetUrl(profile.photoKey);
          } catch (err) {
            console.error("[dropin] failed to sign host photo URL", err);
            photoUrl = null;
          }
        }
      }
      host = {
        // users.firstName is nullable in the schema; a host profile without
        // one is unusual but shouldn't crash the public page.
        firstName: profile.firstName ?? "Your host",
        bio: profile.bio,
        photoUrl,
      };
    }
  }

  // confirmedCount backs the capacity meter AND the "is this session full"
  // check the public page uses to switch the CTA to "Join waitlist" — it
  // must count every status that actually occupies a slot, not just
  // 'confirmed'. A pending_payment walk-in hold or a pending_claim promoted
  // waitlister both hold a real seat (the sweep in expireOverduePromotions
  // is what releases it, nothing before that) — undercounting here would
  // let a guest see room that doesn't exist and try to book into an
  // already-held slot.
  // waitlistCount counts ONLY `waitlisted` — pending_claim is deliberately
  // excluded because it's already counted above as taken (a promoted
  // waitlister mid-claim-window occupies the seat, not the queue). Counting
  // it in both places double-reported the same row as both "taken" and
  // "still waiting".
  const [counts] = await db
    .select({
      confirmedCount: sql<number>`COUNT(*) FILTER (WHERE status IN ('confirmed', 'pending_payment', 'pending_claim'))::int`,
      waitlistCount: sql<number>`COUNT(*) FILTER (WHERE status = 'waitlisted')::int`,
    })
    .from(dropInBookings)
    .where(eq(dropInBookings.sessionId, sessionId));

  const [rateCard] = await db
    .select()
    .from(dropInRateCard)
    .where(eq(dropInRateCard.organizationId, row.session.organizationId))
    .limit(1);

  // Resolve the rate. For anonymous visitors this is the public session
  // rate (resolveRate with no user/membership) so the guest booking CTA
  // can show a real price; for authenticated users it's their personal
  // (possibly member) rate.
  //
  // CLASS sessions ('kind' === "class") are priced from the SESSION's own
  // rates via the shared class-walkup module below, never resolveRate + this
  // rate card — that card is the ADULT PICKUP price list, and a parent's own
  // adult membership (including unlimited_pickup) must never discount or
  // zero out their kid's class. See src/lib/classes/class-walkup.ts.
  let resolvedAmountCents: number | null = null;
  let resolvedPaymentMethod: string | null = null;
  let alreadyBookedStatus: string | null = null;
  // The resolved booking's id + waiver state — powers the post-payment
  // "sign the waiver" card on the session page (waiver is captured AFTER
  // payment; see /api/dropin/bookings/[id]/waiver).
  let bookingId: string | null = null;
  let bookingWaiverSigned: boolean | null = null;
  // The resolved booking's actual paymentMethod — e.g. "pack_credit" when a
  // class session was paid from a purchased credit grant. Powers the "Paid
  // with class credit" badge; this is what ACTUALLY happened, distinct from
  // resolvedAmountCents/resolvedPaymentMethod above (which quote what a NEW
  // booking would cost right now).
  let bookingPaymentMethod: string | null = null;
  // The resolved booking's PARTICIPANT, needed to answer "is this person
  // already covered by the annual waiver?" (bookingWaiverOnFile below) and
  // to render/record the guardian assent sentence on the waiver card.
  let bookingFamilyMemberId: string | null = null;
  if (row.session.kind !== "class" && rateCard) {
    const membership = locals.user
      ? await getActiveMembershipForUser(
          locals.user.id,
          row.session.organizationId,
        )
      : null;
    const rate = resolveRate(row.session, locals.user, membership, rateCard);
    resolvedAmountCents = rate.amountCents;
    resolvedPaymentMethod = rate.paymentMethod;
  }
  if (locals.user) {
    // Active booking lookup so the UI can switch the CTA from "Book" to
    // "View / Cancel".
    const [existing] = await db
      .select({
        id: dropInBookings.id,
        status: dropInBookings.status,
        waiverSigned: dropInBookings.waiverSigned,
        familyMemberId: dropInBookings.familyMemberId,
        paymentMethod: dropInBookings.paymentMethod,
      })
      .from(dropInBookings)
      .where(
        and(
          eq(dropInBookings.sessionId, sessionId),
          eq(dropInBookings.userId, locals.user.id),
        ),
      )
      .orderBy(dropInBookings.createdAt)
      .limit(1);
    if (existing && ACTIVE_BOOKING_STATUSES.includes(existing.status)) {
      alreadyBookedStatus = existing.status;
      bookingId = existing.id;
      bookingWaiverSigned = existing.waiverSigned;
      bookingFamilyMemberId = existing.familyMemberId;
      bookingPaymentMethod = existing.paymentMethod;
    }
  }

  // Guest fallback #1 (inline Payment Element flow): an existing-account
  // guest who paid inline gets no login session (account-takeover
  // prevention), so the user lookup above finds nothing and the success
  // page would poll forever. The success URL carries the PaymentIntent id
  // (`?payment_intent=…`, appended by the client on success / by Stripe on
  // a 3DS return) — an unguessable capability only the buyer holds, same
  // trust model as the hosted flow's checkout_session_id. Resolve the
  // booking row it paid for directly; no Stripe round-trip needed.
  const paymentIntentParam = url.searchParams.get("payment_intent");
  if (alreadyBookedStatus === null && paymentIntentParam) {
    const [booked] = await db
      .select({
        id: dropInBookings.id,
        status: dropInBookings.status,
        waiverSigned: dropInBookings.waiverSigned,
        familyMemberId: dropInBookings.familyMemberId,
        paymentMethod: dropInBookings.paymentMethod,
      })
      .from(dropInBookings)
      .where(
        and(
          eq(dropInBookings.sessionId, sessionId),
          eq(dropInBookings.stripePaymentIntentId, paymentIntentParam),
        ),
      )
      .limit(1);
    if (booked && ACTIVE_BOOKING_STATUSES.includes(booked.status)) {
      alreadyBookedStatus = booked.status;
      bookingId = booked.id;
      bookingWaiverSigned = booked.waiverSigned;
      bookingFamilyMemberId = booked.familyMemberId;
      bookingPaymentMethod = booked.paymentMethod;
    }
  }

  // Guest fallback #2 (legacy hosted Checkout flow): same situation, but the
  // success_url carried the checkout session id instead — resolve it to its
  // PaymentIntent via Stripe. Only hit Stripe when we still have no status,
  // to avoid a round-trip per poll for signed-in users.
  const checkoutSessionId = url.searchParams.get("checkout_session_id");
  if (alreadyBookedStatus === null && checkoutSessionId && stripe) {
    try {
      const cs = await stripe.checkout.sessions.retrieve(checkoutSessionId);
      const paymentIntentId =
        typeof cs.payment_intent === "string"
          ? cs.payment_intent
          : (cs.payment_intent?.id ?? null);
      if (paymentIntentId) {
        const [booked] = await db
          .select({
            id: dropInBookings.id,
            status: dropInBookings.status,
            waiverSigned: dropInBookings.waiverSigned,
            familyMemberId: dropInBookings.familyMemberId,
            paymentMethod: dropInBookings.paymentMethod,
          })
          .from(dropInBookings)
          .where(
            and(
              eq(dropInBookings.sessionId, sessionId),
              eq(dropInBookings.stripePaymentIntentId, paymentIntentId),
            ),
          )
          .limit(1);
        if (booked && ACTIVE_BOOKING_STATUSES.includes(booked.status)) {
          alreadyBookedStatus = booked.status;
          bookingId = booked.id;
          bookingWaiverSigned = booked.waiverSigned;
          bookingFamilyMemberId = booked.familyMemberId;
          bookingPaymentMethod = booked.paymentMethod;
        }
      }
    } catch {
      // Non-fatal: a bad/expired checkout id just leaves the status null and
      // the page falls back to its normal polling/timeout behavior.
    }
  }

  // CLASS quote, resolved now that bookingFamilyMemberId (if any) is known.
  // An anonymous viewer, or an authed viewer with no known child on this
  // session, has no participant to look up a child membership for — they
  // see the PUBLIC session rate, taken directly off the session row (never
  // the rate card). An AUTHED viewer whose existing booking on this session
  // names a child may see the discounted member rate instead, exactly like
  // the paid make-up door — server-verified via the child's own membership,
  // never the booking parent's adult membership. A null rate on the session
  // is a configuration error: report it for ops visibility and OMIT the
  // quote fields rather than 409ing a public page (the report-only posture
  // src/lib/classes/class-rate.ts documents for surfaces with no request to
  // fail).
  if (row.session.kind === "class") {
    const childForQuote = locals.user ? bookingFamilyMemberId : null;
    if (childForQuote) {
      const quote = await resolveClassWalkUpRate(row.session, childForQuote, db);
      if (quote.ok) {
        resolvedAmountCents = quote.amountCents;
        resolvedPaymentMethod = "card_online";
      } else {
        reportUnpricedClassOnce(row.session, quote.need);
      }
    } else if (row.session.sessionRateCents !== null) {
      resolvedAmountCents = row.session.sessionRateCents;
      resolvedPaymentMethod = "card_online";
    } else {
      reportUnpricedClassOnce(row.session, "session");
    }
  }

  // The resolved booking's participant name — only needed to render/record
  // the guardian assent sentence on the post-payment waiver card ("I am the
  // parent or legal guardian of {name}…"). One follow-up lookup rather than
  // joining familyMembers into every booking-lookup block above.
  let bookingFamilyMemberName: string | null = null;
  if (bookingFamilyMemberId) {
    const [fm] = await db
      .select({ firstName: familyMembers.firstName, lastName: familyMembers.lastName })
      .from(familyMembers)
      .where(eq(familyMembers.id, bookingFamilyMemberId))
      .limit(1);
    if (fm) bookingFamilyMemberName = `${fm.firstName} ${fm.lastName}`.trim();
  }

  // ANNUAL WAIVER, display side. `bookingWaiverSigned` is a PER-BOOKING flag:
  // it is false on every newly created row, including one whose participant
  // signed a fortnight ago at another door. Rendering the "one more step
  // before you play" card off that flag alone re-asks a family the platform
  // rule already covers — and the endpoint the card posts to
  // (/api/dropin/bookings/:id/waiver) would just short-circuit
  // `alreadySigned` anyway. Answer the same question here so the page can
  // skip the ask instead of collecting a redundant signature.
  //
  // Scoped to bookings that carry a PARTICIPANT (`family_member_id` — the
  // child class/make-up doors), exactly like that endpoint's on-file branch.
  // An adult drop-in has no `family_members` row, so there is no person for a
  // person-scoped consent to hang on and nothing to skip; see the same
  // limitation documented on the waiver endpoint.
  //
  // Fails toward ASKING: any lookup error leaves this false, and the local
  // `waiverSigned` flag remains the only other input.
  let bookingWaiverOnFile: boolean | null = null;
  if (bookingId && bookingWaiverSigned === false) {
    bookingWaiverOnFile = false;
    if (bookingFamilyMemberId) {
      try {
        bookingWaiverOnFile = await hasValidLiabilityWaiver(
          bookingFamilyMemberId,
          row.session.organizationId,
          db,
        );
      } catch (err) {
        console.error("[dropin] waiver validity lookup failed", err);
      }
    }
  }

  return json(
    {
      session: row.session,
      venueName: row.venueName,
      confirmedCount: counts?.confirmedCount ?? 0,
      waitlistCount: counts?.waitlistCount ?? 0,
      rateCard,
      resolvedAmountCents,
      resolvedPaymentMethod,
      alreadyBookedStatus,
      bookingId,
      bookingWaiverSigned,
      bookingWaiverOnFile,
      // The booking's ACTUAL paymentMethod (e.g. "pack_credit") — distinct
      // from resolvedPaymentMethod above, which quotes what a NEW booking
      // would cost right now. Powers the "Paid with class credit" badge.
      bookingPaymentMethod,
      // The booking's PARTICIPANT id/name — powers the guardian assent
      // sentence on the waiver card ("I am the parent or legal guardian of
      // {name}…"). Null for an adult drop-in (no family_members row).
      bookingFamilyMemberId,
      bookingFamilyMemberName,
      host,
    },
    200,
  );
};
