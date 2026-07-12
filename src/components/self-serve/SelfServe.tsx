"use client";

import { useEffect, useState } from "react";
import { useHydrationBeacon } from "@/lib/hooks/use-hydration-beacon";
import { KIOSK_RETURN_SLUG_KEY } from "@/lib/kiosk/return-slug";
import { WaiverCard } from "./WaiverCard";
import { PhotoCard } from "./PhotoCard";
import { PayCard } from "./PayCard";

interface Context {
  tokenKind: string;
  displayName: string;
  signerName: string | null;
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
}: {
  token: string;
  context: Context;
  /** Kiosk slug from the ?kiosk= query param, when present. */
  kioskSlug?: string | null;
  /** Stripe publishable key, threaded from the Astro page's env — only
   *  needed when outstanding.payment is true. */
  publishableKey?: string;
}) {
  useHydrationBeacon();

  const [waiverDone, setWaiverDone] = useState(!context.outstanding.waiver);
  const [photoDone, setPhotoDone] = useState(!context.outstanding.photo);
  const [paymentDone, setPaymentDone] = useState(!context.outstanding.payment);
  // True from the moment PayCard reports a client-side "succeeded" result
  // until the webhook-driven poll below confirms outstanding.payment is
  // false. The webhook is the source of truth — this component never sets
  // paymentDone itself from the client-side Stripe result.
  const [paymentProcessing, setPaymentProcessing] = useState(false);
  const [paymentPollTimedOut, setPaymentPollTimedOut] = useState(false);
  const [allDone, setAllDone] = useState(false);
  // The hold behind this link was cancelled — either it arrived that way
  // (link opened after the expiry sweep) or the poll below discovered a
  // mid-session cancellation. Overrides every other screen.
  const [holdCancelled, setHoldCancelled] = useState(context.cancelled ?? false);
  const [holdRefunded, setHoldRefunded] = useState(context.refunded ?? false);

  // The kiosk this tab belongs to, if any. Prefer the ?kiosk= query param;
  // fall back to the slug the kiosk stashed in sessionStorage before
  // navigating here — that survives the multi-step self-serve flow reliably.
  const [returnSlug, setReturnSlug] = useState<string | null>(
    kioskSlug && SLUG_RX.test(kioskSlug) ? kioskSlug : null,
  );
  useEffect(() => {
    if (returnSlug) return;
    try {
      const stored = sessionStorage.getItem(KIOSK_RETURN_SLUG_KEY);
      if (stored && SLUG_RX.test(stored)) setReturnSlug(stored);
    } catch {
      /* sessionStorage unavailable — this isn't a kiosk session */
    }
  }, [returnSlug]);

  const maybeConsume = async (
    overrideWaiver?: boolean,
    overridePhoto?: boolean,
    overridePayment?: boolean,
  ) => {
    const effectiveWaiver = overrideWaiver ?? waiverDone;
    const effectivePhoto = overridePhoto ?? photoDone;
    const effectivePayment = overridePayment ?? paymentDone;
    if (effectiveWaiver && effectivePhoto && effectivePayment && !allDone) {
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
    setTimeout(() => maybeConsume(true, photoDone, paymentDone), 0);
  };

  const onPhotoDone = () => {
    setPhotoDone(true);
    setTimeout(() => maybeConsume(waiverDone, true, paymentDone), 0);
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
            setTimeout(() => maybeConsume(waiverDone, photoDone, true), 0);
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
    // waiverDone/photoDone are read via maybeConsume's own default params
    // (fresh closure each render isn't needed here — the override args
    // above always carry the current values).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paymentProcessing, token]);

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
      />
    );
  }

  const paymentOutstanding = context.outstanding.payment && !paymentDone;

  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-xl font-semibold">Hi {context.displayName}</h1>
        <p className="text-sm text-stone-600">{context.summary}</p>
      </header>

      {paymentOutstanding &&
        (paymentProcessing ? (
          <div className="p-4 rounded-lg border bg-stone-50 text-stone-700 text-sm flex items-center gap-2">
            <span
              aria-hidden="true"
              className="inline-block h-3 w-3 rounded-full border-2 border-stone-400 border-t-transparent animate-spin"
            />
            <span>Payment processing…</span>
          </div>
        ) : (
          <div className="space-y-2">
            {paymentPollTimedOut && (
              <p className="text-xs text-stone-500">
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
              onPaid={onPaySubmitted}
            />
          </div>
        ))}

      {context.outstanding.waiver && (
        <WaiverCard
          token={token}
          signerName={context.signerName ?? context.displayName}
          done={waiverDone}
          onDone={onWaiverDone}
        />
      )}
      {context.outstanding.photo && (
        <PhotoCard token={token} done={photoDone} onDone={onPhotoDone} />
      )}
    </div>
  );
}

/**
 * The hold behind this link was cancelled — the expiry sweep released the
 * slot (or the front desk cancelled it). Honest terminal state: says what
 * happened, covers the money (refunded vs. will-be-refunded), and points
 * the customer at the front desk to rebook. Deliberately NOT the
 * checked-in screen — the customer has no slot.
 */
function HoldReleasedScreen({
  displayName,
  summary,
  refunded,
}: {
  displayName: string;
  summary: string;
  refunded: boolean;
}) {
  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-xl font-semibold">Hi {displayName}</h1>
        {summary && <p className="text-sm text-stone-600">{summary}</p>}
      </header>
      <div className="p-6 rounded-lg border border-amber-200 bg-amber-50 text-amber-900">
        <h2 className="text-lg font-semibold mb-2">
          This hold has been released
        </h2>
        <p className="text-sm leading-relaxed">
          {refunded
            ? "Any charge on your card has been refunded."
            : "If your card was charged, the payment will be refunded automatically."}
        </p>
        <p className="mt-2 text-sm leading-relaxed">
          Want to play? See the front desk — if the session still has room,
          they can set you up with a new spot.
        </p>
      </div>
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
}: {
  spaceName: string | null;
  summary: string;
  returnSlug: string | null;
}) {
  const [secondsLeft, setSecondsLeft] = useState(KIOSK_REDIRECT_SECONDS);

  useEffect(() => {
    if (!returnSlug) return;
    if (secondsLeft <= 0) {
      window.location.href = `/kiosk/${returnSlug}`;
      return;
    }
    const t = setTimeout(() => setSecondsLeft((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [secondsLeft, returnSlug]);

  return (
    <div className="space-y-4">
      <div className="p-6 rounded-lg border border-emerald-200 bg-emerald-50 text-emerald-900">
        <h1 className="text-lg font-semibold mb-2">You're checked in</h1>
        <p className="text-sm leading-relaxed">
          {spaceName
            ? `Head over to ${spaceName} — your game is on. Enjoy!`
            : "You're all set — enjoy your game!"}
        </p>
        {summary && (
          <p className="mt-2 text-xs text-emerald-800/70">{summary}</p>
        )}
      </div>
      {returnSlug && (
        <div className="space-y-2">
          <a
            href={`/kiosk/${returnSlug}`}
            className="block w-full rounded-lg bg-primary px-6 py-3 text-center text-sm font-medium text-cream transition-colors hover:bg-primary/90"
          >
            Back to start
          </a>
          <p className="text-center text-xs text-ink-muted">
            Returning to the start screen in {Math.max(secondsLeft, 0)}s…
          </p>
        </div>
      )}
    </div>
  );
}
