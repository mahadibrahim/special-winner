/**
 * Shared context builder for the self-serve token flow.
 *
 * Both `/api/self-serve/[token]` (GET — used for PayCard polling after the
 * initial page load) and `/self-serve/[token].astro` (initial page render)
 * need this exact payload. The Astro page used to get it by `fetch()`-ing
 * its own API route server-side — re-running the whole middleware chain for
 * a request that never leaves the same process. Calling this function
 * directly from the page skips that round-trip; the API route keeps calling
 * it too, unchanged, for the PayCard's client-side polling.
 *
 * Preserve the exact returned shape — both callers depend on it.
 */
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { dropInBookings, dropInSessions, dropInRateCard } from "@/lib/db/schema/drop-in";
import { fieldRentals } from "@/lib/db/schema/field-rentals";
import { venues } from "@/lib/db/schema/teams";
import { locations } from "@/lib/db/schema/organizations";
import { verifyToken } from "@/lib/check-in/tokens-db";
import { resolveSigner } from "@/lib/check-in/resolve-signer";
import { resolvePhotoTarget, hasPhotoOnFile } from "@/lib/check-in/photo-target";
import { resolveRate, DEFAULT_WALK_UP_RATE_CENTS } from "@/lib/dropin/pricing";
import { formatEmailDateTime, DEFAULT_TIMEZONE } from "@/lib/email/format";

export interface SelfServeContextBody {
  tokenKind: string;
  displayName: string;
  signerName: string | null;
  /** True when the signer is a parent/guardian signing on behalf of a minor
   *  (family_members.parent_user_id set) — resolveSigner is the authority,
   *  not a name-string comparison. False for every adult-signer path. */
  isMinor: boolean;
  summary: string;
  spaceName: string | null;
  outstanding: { waiver: boolean; photo: boolean; payment: boolean };
  amountDueCents: number;
  locationSlug: string | null;
  bookingId: string | null;
  cancelled: boolean;
  refunded: boolean;
  expiresAt: Date | string;
}

export type SelfServeContextResult =
  | { ok: true; status: 200; body: SelfServeContextBody }
  | { ok: false; status: number; body: { error: string } };

/**
 * Resolve the self-serve context payload for a token. Mirrors the previous
 * inline logic in the API route exactly — same status codes, same error
 * strings, same success shape.
 */
export async function buildSelfServeContext(
  tokenValue: string,
): Promise<SelfServeContextResult> {
  const v = await verifyToken(tokenValue);
  if (!v.ok) {
    const status =
      v.reason === "expired" || v.reason === "consumed" ? 410 : 404;
    return { ok: false, status, body: { error: v.reason } };
  }
  const tok = v.token;

  const signer = await resolveSigner(tok.kind, tok.targetId, tok.organizationId);
  if (!signer) {
    return { ok: false, status: 410, body: { error: "Target gone" } };
  }

  const db = getDb();
  let summary = "";
  // The space (venue) name — lets the completion screen say "head to X".
  let spaceName: string | null = null;
  const outstanding = { waiver: false, photo: false, payment: false };
  // Populated only for drop-in bookings (kiosk walk-ins and, in principle,
  // any other drop_in_booking whose status is pending_payment — see the
  // shared resolver below). 0 / null when payment isn't outstanding.
  let amountDueCents = 0;
  let locationSlug: string | null = null;
  // Booking id for the same drop_in_booking/walkin_session cases below —
  // PayCard carries it as a prop even though the payment endpoint itself
  // only needs the token (targetId is re-derived server-side from it).
  let bookingId: string | null = null;
  // True when the booking behind the token was cancelled (expiry sweep,
  // admin cancel-hold, …). The page must render an honest "hold released"
  // state — never the checked-in screen. `refunded` accompanies it: true
  // when a Stripe refund is on record for the booking (the late-payment
  // auto-refund in handle-dropin-walkin-payment.ts, or any other refund).
  let cancelled = false;
  let refunded = false;

  // drop_in_booking and walkin_session tokens both point at a dropInBookings
  // row (walk-in kiosk holds mint walkin_session; regular drop-in bookings
  // mint drop_in_booking) — same joins, same "is payment outstanding" rule.
  // Sharing the query means a drop_in_booking token honestly reflects
  // outstanding.payment too, if a future flow ever mints one against a
  // pending_payment row (none does today — see the Task 6 report).
  if (tok.kind === "drop_in_booking" || tok.kind === "walkin_session") {
    const [b] = await db
      .select({
        status: dropInBookings.status,
        waiverSigned: dropInBookings.waiverSigned,
        stripeRefundId: dropInBookings.stripeRefundId,
        startsAt: dropInSessions.startsAt,
        venueName: venues.name,
        timezone: locations.timezone,
        sportLabel: dropInSessions.sportOrClassLabel,
        // Rate-override fields for resolveRate below.
        sessionRateCents: dropInSessions.sessionRateCents,
        memberRateCents: dropInSessions.memberRateCents,
        walkUpRateCents: dropInSessions.walkUpRateCents,
        organizationId: dropInSessions.organizationId,
        locationSlug: locations.slug,
      })
      .from(dropInBookings)
      .innerJoin(dropInSessions, eq(dropInSessions.id, dropInBookings.sessionId))
      .innerJoin(venues, eq(venues.id, dropInSessions.venueId))
      .innerJoin(locations, eq(locations.id, venues.locationId))
      .where(eq(dropInBookings.id, tok.targetId))
      .limit(1);
    if (!b) return { ok: false, status: 410, body: { error: "Booking gone" } };
    bookingId = tok.targetId;
    summary =
      tok.kind === "walkin_session"
        ? `Walk-in registration — ${b.sportLabel} on ${formatEmailDateTime(b.startsAt, b.timezone ?? DEFAULT_TIMEZONE)} at ${b.venueName}`
        : `${b.sportLabel} on ${formatEmailDateTime(b.startsAt, b.timezone ?? DEFAULT_TIMEZONE)} at ${b.venueName}`;
    spaceName = b.venueName;
    if (b.status === "cancelled") {
      // Hold released (expiry sweep / admin cancel). Nothing is actionable
      // — leave every outstanding flag false so the page can't offer the
      // waiver/photo/pay cards for a slot that no longer exists.
      cancelled = true;
      refunded = b.stripeRefundId !== null;
    } else {
      outstanding.waiver = !b.waiverSigned;
      outstanding.payment = b.status === "pending_payment";
      if (outstanding.payment) {
        // Amount must match what /api/kiosk/[locationSlug]/walkin/payment
        // will actually charge — the SAME resolveRate(..., "walk_up") path
        // (pricing.ts), NOT check-in/event.ts's walkUp ?? session fallback
        // chain: the two diverge when the session has no walk-up override
        // (resolveRate falls back to the rate card's default walk-up rate,
        // not the session rate). Read-only here — payment.ts upserts the
        // rate card on demand; a GET shouldn't write, so mirror its
        // missing-card fallback constant instead.
        const [rateCard] = await db
          .select()
          .from(dropInRateCard)
          .where(eq(dropInRateCard.organizationId, b.organizationId))
          .limit(1);
        amountDueCents = rateCard
          ? resolveRate(b, null, null, rateCard, "walk_up").amountCents
          : DEFAULT_WALK_UP_RATE_CENTS;
        locationSlug = b.locationSlug;
      }
    }
  } else if (tok.kind === "field_rental") {
    const [r] = await db
      .select({
        startsAt: fieldRentals.startsAt,
        venueName: venues.name,
        timezone: locations.timezone,
        waiverSigned: fieldRentals.waiverSigned,
      })
      .from(fieldRentals)
      .innerJoin(venues, eq(venues.id, fieldRentals.venueId))
      .innerJoin(locations, eq(locations.id, venues.locationId))
      .where(eq(fieldRentals.id, tok.targetId))
      .limit(1);
    if (!r) return { ok: false, status: 410, body: { error: "Rental gone" } };
    summary = `Field rental on ${formatEmailDateTime(r.startsAt, r.timezone ?? DEFAULT_TIMEZONE)} at ${r.venueName}`;
    spaceName = r.venueName;
    outstanding.waiver = !r.waiverSigned;
  } else if (tok.kind === "roster_entry") {
    summary = `Today's game`;
    outstanding.waiver = true;
  }

  // A cancelled hold has nothing actionable — leave every outstanding flag
  // false so the page can't offer a photo (or anything else) for a slot that
  // no longer exists, and skip deriving the flag entirely since it would just
  // be discarded. NOTE: this is the ONLY case that skips the lookup — this
  // context is rebuilt on every PayCard poll (every 2s during a payment) and
  // `cancelled` is false throughout one, so the photo lookup below DOES run
  // on each of those polls. That is a deliberate accepted cost (two indexed
  // point reads), not an optimization this branch buys back.
  //
  // Is a photo outstanding? Kind-independent: it depends only on WHO the
  // token resolves to. The target is derived by the same helper the upload
  // endpoint uses to pick where the file lands (minor → family_members.photoUrl,
  // otherwise → users.avatarUrl), so the card is only ever offered to the
  // person the upload would actually be saved against. No target (e.g. an
  // admin-created field rental for a renter with no account) → no photo step.
  //
  // Returning customers with a photo already on file are not asked again.
  //
  // Historical note: this flag was initialized to `false` and never assigned,
  // so PhotoCard — which SelfServe gates on it — had NEVER rendered for any
  // customer in production. It is now real, and the client treats it as an
  // OFFER: PhotoCard carries a "Not now" skip and the completion gate counts
  // a skipped photo as settled, so the photo can never block a kiosk.
  if (!cancelled) {
    try {
      const photoTarget = resolvePhotoTarget(signer, tok.recipientUserId);
      if (photoTarget) outstanding.photo = !(await hasPhotoOnFile(photoTarget));
    } catch {
      // Never block (and never 500) a check-in over an optional photo.
      outstanding.photo = false;
    }
  }

  return {
    ok: true,
    status: 200,
    body: {
      tokenKind: tok.kind,
      displayName: signer?.displayName ?? "Guest",
      signerName: signer?.signerName ?? null,
      isMinor: signer?.isMinor ?? false,
      summary,
      spaceName,
      outstanding,
      amountDueCents,
      locationSlug,
      bookingId,
      cancelled,
      refunded,
      expiresAt: tok.expiresAt,
    },
  };
}
