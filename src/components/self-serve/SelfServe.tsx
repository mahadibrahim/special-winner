"use client";

import { useEffect, useRef, useState } from "react";
import { useHydrationBeacon } from "@/lib/hooks/use-hydration-beacon";
import { WaiverCard } from "./WaiverCard";
import { PhotoCard } from "./PhotoCard";
import { PayCard } from "./PayCard";
import { PRIMARY_BTN } from "./card-styles";

interface Context {
  tokenKind: string;
  displayName: string;
  signerName: string | null;
  /** Authoritative guardian-vs-adult signal from resolveSigner — see
   *  build-context.ts. Never re-derive this from a name comparison. */
  isMinor: boolean;
  summary: string;
  spaceName?: string | null;
  outstanding: { waiver: boolean; photo: boolean; payment: boolean };
  /** Present (non-zero) when outstanding.payment is true. */
  amountDueCents?: number;
  /** Present when outstanding.payment is true — required to hit the kiosk
   *  payment endpoint, which is slug/UUID-scoped by location. */
  locationSlug?: string | null;
  bookingId?: string | null;
  /** The booking behind the token was cancelled (expiry sweep / admin
   *  cancel) — the hold no longer exists. Render the honest released
   *  state, never the checked-in screen. */
  cancelled?: boolean;
  /** A Stripe refund is on record for the booking (e.g. a payment that
   *  settled after the sweep was auto-refunded by the webhook). */
  refunded?: boolean;
  expiresAt: string;
}

/** The body of `GET /api/self-serve/<token>`. Exported so embedders (the
 *  kiosk) can hold a typed context without casting. */
export type SelfServeContext = Context;

/** Seconds the "checked in" screen waits before returning a kiosk to its
 *  landing page for the next person. */
const KIOSK_REDIRECT_SECONDS = 12;
const SLUG_RX = /^[a-z0-9]+(?:-[a-z0-9]+)*$/i;
// How often to re-check the token context for the webhook to flip
// outstanding.payment false after a client-side "succeeded" confirmation.
const PAYMENT_POLL_MS = 2000;
// Stop polling after this long — the webhook lands within seconds in
// practice; if it hasn't by then, let the customer retry rather than spin
// forever. PayCard's idempotency key (booking id + amount) makes a retry
// safe even if the original payment actually did succeed.
const PAYMENT_POLL_TIMEOUT_MS = 60_000;

export default function SelfServe({
  token,
  context,
  kioskSlug,
  publishableKey,
  brandId,
  onDone,
  onBusyChange,
  onUnboundedBusyChange,
  onActivity,
}: {
  token: string;
  context: Context;
  /** Kiosk slug from the ?kiosk= query param, when present. */
  kioskSlug?: string | null;
  /** Stripe publishable key, threaded from the Astro page's env — only
   *  needed when outstanding.payment is true. */
  publishableKey?: string;
  /** Brand driving the page's host — threaded down to PayCard so the
   *  mounted Stripe Elements iframe picks a matching theme. Optional;
   *  PayCard defaults to the light "stripe" theme (Aspire) when omitted. */
  brandId?: "aspire" | "soccerone";
  /** Kiosk-embedded mode: reset the kiosk in place instead of navigating.
   *  Absent for a texted link opened standalone. */
  onDone?: () => void;
  /** Kiosk-embedded mode: reports whether ANY child of this component has
   *  work in flight that a parent-owned idle timer must not interrupt — a
   *  confirmPayment/3DS round-trip, the post-confirmation webhook poll, a
   *  photo upload, or a waiver submit. Each of those has the same shape of
   *  failure: the request lands server-side while a reset unmounts the
   *  subtree, so the customer is bounced to the landing screen with no
   *  confirmation that the thing they just did actually happened. Children
   *  report their own busy windows and this component ORs them into one
   *  signal, so the parent never has to know the flow's internals. Absent
   *  for a standalone link, which has no idle timer to suppress. */
  onBusyChange?: (busy: boolean) => void;
  /** Kiosk-embedded mode: reports payConfirmBusy ALONE — the window covering
   *  `stripe.confirmPayment()` and any 3-D Secure challenge it triggers. This
   *  is the one component of `anyBusy` with no upper bound: an app-based 3DS
   *  approval waits on the customer unlocking their phone and completing
   *  bank-side auth, which can run well past a minute. The parent needs it
   *  isolated from the aggregate so it can give ONLY this window a longer
   *  suppression ceiling — see UNBOUNDED_BUSY_MAX_MS in KioskRoot. Optional
   *  and independent of onBusyChange; both default to unused for a
   *  standalone link, which has no idle timer to suppress. */
  onUnboundedBusyChange?: (busy: boolean) => void;
  /** Kiosk-embedded mode: forwarded to PayCard, which is the only child that
   *  can produce user activity the parent's window listeners cannot see (the
   *  cross-origin Stripe Elements iframe). Absent standalone. */
  onActivity?: () => void;
}) {
  useHydrationBeacon();

  const [waiverDone, setWaiverDone] = useState(!context.outstanding.waiver);
  const [photoDone, setPhotoDone] = useState(!context.outstanding.photo);
  // The photo is OPTIONAL — offered, never required. A customer who taps
  // "Not now" settles the step without a photo, and the completion gate below
  // treats settled exactly like done. Without this, an offered-but-declined
  // photo would hang the flow short of the checked-in screen forever.
  const [photoSkipped, setPhotoSkipped] = useState(false);
  const [paymentDone, setPaymentDone] = useState(!context.outstanding.payment);
  // True from the moment PayCard reports a client-side "succeeded" result
  // until the webhook-driven poll below confirms outstanding.payment is
  // false. The webhook is the source of truth — this component never sets
  // paymentDone itself from the client-side Stripe result.
  const [paymentProcessing, setPaymentProcessing] = useState(false);
  const [paymentPollTimedOut, setPaymentPollTimedOut] = useState(false);
  // In-flight windows reported by the cards themselves. paymentProcessing
  // (above) only covers the POST-confirmation webhook poll; payConfirmBusy
  // covers the far more dangerous window BEFORE it — confirmPayment and any
  // 3-D Secure challenge, during which a reset can strand a charge that
  // settles anyway. The photo/waiver windows are the same class of bug with
  // smaller stakes: the write lands, the customer never sees it.
  const [payConfirmBusy, setPayConfirmBusy] = useState(false);
  const [photoUploadBusy, setPhotoUploadBusy] = useState(false);
  const [waiverSubmitBusy, setWaiverSubmitBusy] = useState(false);
  const [allDone, setAllDone] = useState(false);
  // The hold behind this link was cancelled — either it arrived that way
  // (link opened after the expiry sweep) or the poll below discovered a
  // mid-session cancellation. Overrides every other screen.
  const [holdCancelled, setHoldCancelled] = useState(context.cancelled ?? false);
  const [holdRefunded, setHoldRefunded] = useState(context.refunded ?? false);

  // The kiosk this tab belongs to, if any — via the ?kiosk= query param.
  // Only used as a fallback when onDone isn't provided (a texted/emailed
  // link opened standalone, where a kiosk-issued token still carries the
  // param but there's no in-page kiosk to hand back to).
  const returnSlug = kioskSlug && SLUG_RX.test(kioskSlug) ? kioskSlug : null;

  // Always-current mirrors of the completion flags. maybeConsume can be
  // invoked from a long-lived callback chain — the payment poll below runs
  // for up to a minute off the closure captured when polling STARTED — so
  // its fallback reads must come from refs, not from that (potentially
  // stale) render's state bindings. Without this, a customer who signs the
  // waiver or adds a photo WHILE their payment is settling would never see
  // the confirmation screen until a reload: the poll's final maybeConsume
  // would see waiver/photo as they were when the poll began.
  const waiverDoneRef = useRef(waiverDone);
  waiverDoneRef.current = waiverDone;
  // "Settled", not "done": uploaded OR declined OR never asked for. This is
  // the value the completion gate consumes — the photo is the one step that
  // can complete without happening.
  const photoSettledRef = useRef(photoDone || photoSkipped);
  photoSettledRef.current = photoDone || photoSkipped;
  const paymentDoneRef = useRef(paymentDone);
  paymentDoneRef.current = paymentDone;
  const allDoneRef = useRef(allDone);
  allDoneRef.current = allDone;

  const maybeConsume = async (
    overrideWaiver?: boolean,
    /** "photo settled" — uploaded OR skipped. Never "photo uploaded". */
    overridePhoto?: boolean,
    overridePayment?: boolean,
  ) => {
    // Overrides exist because a caller's own setState hasn't re-rendered
    // (and thus refreshed the refs) yet within the same tick; every flag
    // the caller did NOT just flip falls back to the live ref value.
    const effectiveWaiver = overrideWaiver ?? waiverDoneRef.current;
    const effectivePhoto = overridePhoto ?? photoSettledRef.current;
    const effectivePayment = overridePayment ?? paymentDoneRef.current;
    if (
      effectiveWaiver &&
      effectivePhoto &&
      effectivePayment &&
      !allDoneRef.current
    ) {
      // Set the ref immediately so a concurrent caller in the same tick
      // can't double-consume before the state update lands.
      allDoneRef.current = true;
      try {
        await fetch(`/api/self-serve/${token}/consume`, { method: "POST" });
      } catch {
        // consume failure is non-blocking — the writes already landed
      }
      setAllDone(true);
    }
  };

  const onWaiverDone = () => {
    setWaiverDone(true);
    setTimeout(() => maybeConsume(true), 0);
  };

  const onPhotoDone = () => {
    setPhotoDone(true);
    setTimeout(() => maybeConsume(undefined, true), 0);
  };

  // "Not now". Identical to onPhotoDone as far as completion is concerned —
  // the step is settled either way — it just leaves no photo behind.
  const onPhotoSkip = () => {
    setPhotoSkipped(true);
    setTimeout(() => maybeConsume(undefined, true), 0);
  };

  // PayCard confirmed client-side. Don't mark payment done here — start
  // polling the token context instead and let the webhook flip it.
  const onPaySubmitted = () => {
    setPaymentPollTimedOut(false);
    setPaymentProcessing(true);
  };

  useEffect(() => {
    if (!paymentProcessing) return;
    let cancelled = false;
    const startedAt = Date.now();

    const poll = async () => {
      if (cancelled) return;
      try {
        const res = await fetch(`/api/self-serve/${token}`);
        if (res.ok) {
          const body = (await res.json()) as {
            outstanding?: { payment?: boolean };
            cancelled?: boolean;
            refunded?: boolean;
          };
          if (cancelled) return;
          // Mid-poll cancellation: the sweep released the hold while the
          // customer's payment was settling. Stop polling and show the
          // honest released state — the webhook auto-refunds a captured
          // charge in this exact race, which `refunded` reflects.
          if (body.cancelled === true) {
            setPaymentProcessing(false);
            setHoldCancelled(true);
            setHoldRefunded(body.refunded === true);
            return;
          }
          if (body.outstanding?.payment === false) {
            setPaymentProcessing(false);
            setPaymentDone(true);
            // Only payment is overridden — waiver/photo fall back to
            // maybeConsume's refs, which are always current even though
            // this callback's closure dates from when polling started
            // (the customer may have signed/photographed mid-poll).
            setTimeout(() => maybeConsume(undefined, undefined, true), 0);
            return;
          }
        }
      } catch {
        // Transient network blip — keep polling until the timeout below.
      }
      if (cancelled) return;
      if (Date.now() - startedAt >= PAYMENT_POLL_TIMEOUT_MS) {
        setPaymentProcessing(false);
        setPaymentPollTimedOut(true);
        return;
      }
      setTimeout(poll, PAYMENT_POLL_MS);
    };

    poll();
    return () => {
      cancelled = true;
    };
    // maybeConsume is deliberately not a dep: the instance captured here
    // may be stale, but it reads every completion flag through refs, so a
    // stale instance still sees current values.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paymentProcessing, token]);

  // One busy signal for the embedder (the kiosk's idle timer), OR-ed from
  // every window in which an interrupting reset would lose work the server
  // has already accepted. See onBusyChange's doc comment above.
  //
  // The pay hand-off is seamless by construction: PayCard clears
  // payConfirmBusy in the same batch as the onSuccess() that sets
  // paymentProcessing, so `anyBusy` is continuously true from the moment the
  // customer taps Pay until the webhook poll resolves — there is no tick in
  // between where the kiosk considers itself idle.
  const anyBusy =
    paymentProcessing || payConfirmBusy || photoUploadBusy || waiverSubmitBusy;
  useEffect(() => {
    onBusyChange?.(anyBusy);
  }, [anyBusy, onBusyChange]);

  // payConfirmBusy reported on its own, in addition to folding into anyBusy
  // above — see onUnboundedBusyChange's doc comment for why the parent needs
  // this window isolated from the (bounded) rest of anyBusy.
  useEffect(() => {
    onUnboundedBusyChange?.(payConfirmBusy);
  }, [payConfirmBusy, onUnboundedBusyChange]);

  // Cancelled wins over EVERYTHING below — a released hold must never show
  // the checked-in confirmation (the slot is gone), and with the context's
  // outstanding flags all false a cancelled booking would otherwise fall
  // straight into the nothingOutstanding branch.
  if (holdCancelled) {
    return (
      <HoldReleasedScreen
        displayName={context.displayName}
        summary={context.summary}
        refunded={holdRefunded}
        returnSlug={returnSlug}
        onDone={onDone}
      />
    );
  }

  // Nothing left to do — either the customer just finished every card, or
  // they opened the link with the waiver/photo/payment already on file.
  // Both cases show the confirmation rather than a bare, actionless header.
  const nothingOutstanding =
    !context.outstanding.waiver &&
    !context.outstanding.photo &&
    !context.outstanding.payment;

  if (allDone || nothingOutstanding) {
    return (
      <CheckedInScreen
        spaceName={context.spaceName ?? null}
        summary={context.summary}
        returnSlug={returnSlug}
        onDone={onDone}
      />
    );
  }

  const paymentOutstanding = context.outstanding.payment && !paymentDone;

  return (
    <div className="space-y-4">
      <header className="space-y-1">
        <h1 className="font-display text-3xl font-medium italic text-ink">
          Hi {context.displayName}
        </h1>
        <p className="text-sm text-ink-muted">{context.summary}</p>
      </header>

      {paymentOutstanding &&
        (paymentProcessing ? (
          <div className="p-4 rounded-xl border border-border bg-cream-2 text-ink-muted text-sm flex items-center gap-2">
            <span
              aria-hidden="true"
              className="inline-block h-3 w-3 rounded-full border-2 border-ink-faint border-t-transparent animate-spin"
            />
            <span>Payment processing…</span>
          </div>
        ) : (
          <div className="space-y-2">
            {paymentPollTimedOut && (
              <p className="text-xs text-ink-faint">
                We couldn't confirm your payment yet. If your card was charged,
                please see the front desk and they'll sort it out — otherwise
                you can try again below.
              </p>
            )}
            <PayCard
              token={token}
              amountDueCents={context.amountDueCents ?? 0}
              locationSlug={context.locationSlug ?? null}
              bookingId={context.bookingId ?? null}
              publishableKey={publishableKey ?? ""}
              brandId={brandId}
              onPaid={onPaySubmitted}
              onBusy={setPayConfirmBusy}
              onActivity={onActivity}
            />
          </div>
        ))}

      {context.outstanding.waiver && (
        <WaiverCard
          token={token}
          signerName={context.signerName ?? context.displayName}
          playerName={context.displayName}
          isMinor={context.isMinor}
          done={waiverDone}
          onDone={onWaiverDone}
          onBusy={setWaiverSubmitBusy}
        />
      )}
      {context.outstanding.photo && !photoSkipped && (
        <PhotoCard
          token={token}
          done={photoDone}
          onDone={onPhotoDone}
          onSkip={onPhotoSkip}
          onBusy={setPhotoUploadBusy}
        />
      )}
      {/* Skipped, but the flow is still open (a waiver or a payment is left).
          Offer the way back in — a mis-tapped "Not now" shouldn't cost the
          photo. Only reachable while other cards are up: when the photo was
          the last outstanding item, skipping completes the flow and this
          subtree is replaced by the checked-in screen. */}
      {context.outstanding.photo && photoSkipped && !photoDone && (
        <p className="text-sm text-ink-muted">
          Photo skipped.{" "}
          <button
            type="button"
            onClick={() => setPhotoSkipped(false)}
            className="underline underline-offset-2 text-ink hover:text-ink-muted transition-colors"
          >
            Add one after all
          </button>
        </p>
      )}
    </div>
  );
}

/**
 * Shared by every terminal screen that can be reached on a mounted kiosk:
 * counts down and hands the device back to `onDone` (kiosk-embedded) or
 * `returnSlug` (a kiosk-issued link opened standalone) so it's ready for the
 * next person, with a "Back to start" button to skip the wait. Renders
 * nothing when neither is present — a personal SMS/email link opened on the
 * customer's own phone, where there's nothing to "return" to.
 */
function KioskReturnControl({
  onDone,
  returnSlug,
}: {
  onDone?: () => void;
  returnSlug: string | null;
}) {
  const [secondsLeft, setSecondsLeft] = useState(KIOSK_REDIRECT_SECONDS);
  const returning = Boolean(onDone || returnSlug);

  useEffect(() => {
    if (!returning) return;
    if (secondsLeft <= 0) {
      if (onDone) onDone();
      else if (returnSlug) window.location.href = `/kiosk/${returnSlug}`;
      return;
    }
    const t = setTimeout(() => setSecondsLeft((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [secondsLeft, returning, returnSlug, onDone]);

  if (!returning) return null;

  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={() => (onDone ? onDone() : (window.location.href = `/kiosk/${returnSlug}`))}
        className={PRIMARY_BTN}
      >
        Back to start
      </button>
      <p className="text-center text-xs text-ink-muted">
        Returning to the start screen in {Math.max(secondsLeft, 0)}s…
      </p>
    </div>
  );
}

/**
 * The hold behind this link was cancelled — the expiry sweep released the
 * slot (or the front desk cancelled it). Honest terminal state: says what
 * happened, covers the money (refunded vs. will-be-refunded), and points
 * the customer at the front desk to rebook. Deliberately NOT the
 * checked-in screen — the customer has no slot.
 *
 * On a mounted kiosk this is reachable at any time (sweep expiry, front-desk
 * cancel, or a mid-poll cancellation detected while a payment was
 * settling) — it MUST hand the device back via KioskReturnControl just like
 * CheckedInScreen, or the kiosk strands on the previous customer's details.
 */
function HoldReleasedScreen({
  displayName,
  summary,
  refunded,
  returnSlug,
  onDone,
}: {
  displayName: string;
  summary: string;
  refunded: boolean;
  returnSlug: string | null;
  onDone?: () => void;
}) {
  return (
    <div className="space-y-4">
      <header className="space-y-1">
        <h1 className="font-display text-3xl font-medium italic text-ink">
          Hi {displayName}
        </h1>
        {summary && <p className="text-sm text-ink-muted">{summary}</p>}
      </header>
      <div className="p-6 rounded-xl border border-ochre/60 bg-ochre/10">
        <h2 className="text-lg font-semibold mb-2 text-ink">
          This hold has been released
        </h2>
        <p className="text-sm leading-relaxed text-ink-2">
          {refunded
            ? "Any charge on your card has been refunded."
            : "If your card was charged, the payment will be refunded automatically."}
        </p>
        <p className="mt-2 text-sm leading-relaxed text-ink-2">
          Want to play? See the front desk — if the session still has room,
          they can set you up with a new spot.
        </p>
      </div>
      <KioskReturnControl onDone={onDone} returnSlug={returnSlug} />
    </div>
  );
}

/**
 * Final "you're checked in" screen. On a kiosk (a return slug is known) it
 * counts down and redirects back to the kiosk landing so the device is ready
 * for the next person; a "Back to start" button skips the wait. Opened from a
 * personal SMS/email link (no kiosk), it just shows the confirmation.
 */
function CheckedInScreen({
  spaceName,
  summary,
  returnSlug,
  onDone,
}: {
  spaceName: string | null;
  summary: string;
  returnSlug: string | null;
  onDone?: () => void;
}) {
  return (
    <div className="space-y-4">
      <div className="p-6 rounded-xl border border-sage/60 bg-sage/10">
        <h1 className="text-lg font-semibold mb-2 text-ink">You're checked in</h1>
        <p className="text-sm leading-relaxed text-ink-2">
          {spaceName
            ? `Head over to ${spaceName} — your game is on. Enjoy!`
            : "You're all set — enjoy your game!"}
        </p>
        {summary && (
          <p className="mt-2 text-xs text-ink-2">{summary}</p>
        )}
      </div>
      <KioskReturnControl onDone={onDone} returnSlug={returnSlug} />
    </div>
  );
}
