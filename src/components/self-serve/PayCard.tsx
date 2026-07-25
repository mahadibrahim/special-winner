"use client";

import { useEffect, useRef, useState } from "react";
import { loadStripe } from "@stripe/stripe-js";
import {
  Elements,
  PaymentElement,
  useStripe,
  useElements,
} from "@stripe/react-stripe-js";
import type { Stripe as StripeJs } from "@stripe/stripe-js";
import { toast } from "sonner";
import { ErrorBanner } from "@/components/ui/error-banner";
import { CARD_CLASS, GHOST_BTN, PRIMARY_BTN } from "./card-styles";

// Mirrors src/components/kiosk/WalkInWizard.tsx's stripe-js loading —
// module-level cache so repeated mounts (e.g. this card re-rendering while
// SelfServe polls) reuse the same loadStripe() promise instead of
// re-initializing Stripe.js. Unlike the wizard, the promise is resolved
// into state (see below) so a stripe.js load FAILURE renders an
// ErrorBanner instead of a permanently blank card: a rejected promise
// handed straight to <Elements> just leaves the form empty forever. A
// rejected promise is also evicted from the cache so a retry re-attempts
// the network load instead of replaying the cached failure.
const stripePromiseCache = new Map<string, Promise<StripeJs | null>>();
function getStripePromise(publishableKey: string): Promise<StripeJs | null> {
  let p = stripePromiseCache.get(publishableKey);
  if (!p) {
    p = loadStripe(publishableKey);
    p.catch(() => stripePromiseCache.delete(publishableKey));
    stripePromiseCache.set(publishableKey, p);
  }
  return p;
}

interface PaymentAmounts {
  baseAmountCents: number;
  surchargeCents: number;
  totalCents: number;
}

export interface PayCardProps {
  token: string;
  amountDueCents: number;
  locationSlug: string | null;
  bookingId: string | null;
  publishableKey: string;
  /** Drives the mounted Stripe Elements iframe's theme — our CSS custom
   *  properties can't reach into it. Optional; defaults to Aspire's light
   *  "stripe" theme so any other caller keeps working unchanged. */
  brandId?: "aspire" | "soccerone";
  onPaid: () => void;
  /** Reports "a confirmPayment / 3-D Secure challenge is in flight" to the
   *  embedder (the kiosk), so its idle timer can't hard-reset the screen
   *  between the customer tapping Pay and Stripe answering. A reset there is
   *  the worst outcome in the whole flow: the charge still settles
   *  server-side while the customer is looking at the landing screen with no
   *  confirmation they paid. Optional — the standalone /self-serve/[token]
   *  page has no idle timer and passes nothing. */
  onBusy?: (busy: boolean) => void;
  /** Fires on any interaction INSIDE the Stripe Elements iframe. Stripe
   *  renders card fields cross-origin, so keystrokes there never reach the
   *  parent window's pointerdown/keydown listeners — to a window-level idle
   *  timer, a customer carefully typing a 16-digit card number looks exactly
   *  like an abandoned kiosk. PaymentElement's onChange/onFocus DO fire in
   *  the parent React tree, which is the only activity signal we get from
   *  inside that iframe. Optional. */
  onActivity?: () => void;
}

const fmt = (cents: number) => `$${(cents / 100).toFixed(2)}`;

/**
 * Self-serve payment card for a walk-in pay-link hold. Fetches the
 * PaymentIntent from the same kiosk endpoint the front-desk wizard uses
 * (`POST /api/kiosk/[locationSlug]/walkin/payment`), then mounts Stripe's
 * PaymentElement — same publishable key source, appearance, and
 * redirect-if-required flow as WalkInWizard's PaymentStep.
 *
 * On a client-side `succeeded` result this calls `onPaid()` — it does NOT
 * mark the booking paid itself. The webhook
 * (`handleDropinWalkinPayment`) is the source of truth; SelfServe polls the
 * token context afterward until `outstanding.payment` flips false.
 */
export function PayCard({
  token,
  amountDueCents,
  locationSlug,
  bookingId,
  publishableKey,
  brandId,
  onPaid,
  onBusy,
  onActivity,
}: PayCardProps) {
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [amounts, setAmounts] = useState<PaymentAmounts | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  // Resolved stripe.js instance. Kept in state (not a raw promise handed
  // to <Elements>) so load failures surface as an ErrorBanner.
  const [stripeInstance, setStripeInstance] = useState<StripeJs | null>(null);
  const [stripeLoadError, setStripeLoadError] = useState<string | null>(null);
  // Bumping retries the stripe.js load after a failure (cache was evicted).
  const [stripeLoadAttempt, setStripeLoadAttempt] = useState(0);

  useEffect(() => {
    if (!publishableKey) {
      // Misconfiguration (env var missing) — an honest banner beats a
      // blank card or a loadStripe throw.
      setStripeLoadError(
        "Payments aren't set up on this page. Please see the front desk to pay.",
      );
      return;
    }
    let cancelled = false;
    setStripeLoadError(null);
    getStripePromise(publishableKey)
      .then((s) => {
        if (cancelled) return;
        if (!s) {
          setStripeLoadError(
            "The secure payment form couldn't be loaded. Please see the front desk to pay.",
          );
          return;
        }
        setStripeInstance(s);
      })
      .catch(() => {
        if (cancelled) return;
        setStripeLoadError(
          "Couldn't load the secure payment form — check your connection and try again.",
        );
      });
    return () => {
      cancelled = true;
    };
  }, [publishableKey, stripeLoadAttempt]);

  useEffect(() => {
    if (!locationSlug) {
      setLoadError("Payment isn't available for this link. Ask the front desk for help.");
      setLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/kiosk/${locationSlug}/walkin/payment`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token }),
        });
        const body = await res.json().catch(() => ({}));
        if (cancelled) return;
        if (!res.ok) {
          setLoadError(
            (body as { error?: string }).error ?? `Could not start payment (${res.status})`,
          );
          return;
        }
        const pay = body as {
          clientSecret: string;
          amountCents: number;
          baseAmountCents: number;
          surchargeCents: number;
        };
        setClientSecret(pay.clientSecret);
        setAmounts({
          baseAmountCents: pay.baseAmountCents,
          surchargeCents: pay.surchargeCents,
          totalCents: pay.amountCents,
        });
      } catch (err) {
        if (!cancelled) {
          setLoadError(err instanceof Error ? err.message : "Network error");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // bookingId isn't used by the fetch (the token alone identifies the
    // booking server-side) — it's carried as a prop for callers/telemetry.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, locationSlug]);

  return (
    <div className={CARD_CLASS} data-booking-id={bookingId ?? undefined}>
      <div>
        <h2 className="font-semibold text-ink">Complete payment</h2>
        <p className="text-sm text-ink-muted">
          Your spot is held until payment is complete.
        </p>
      </div>

      {loading && (
        <div className="text-sm text-ink-muted">Loading payment…</div>
      )}

      <ErrorBanner message={loadError} onDismiss={() => setLoadError(null)} />

      {stripeLoadError && (
        <div className="space-y-2">
          <ErrorBanner message={stripeLoadError} />
          {Boolean(publishableKey) && (
            <button
              type="button"
              onClick={() => setStripeLoadAttempt((n) => n + 1)}
              className={GHOST_BTN}
            >
              Try again
            </button>
          )}
        </div>
      )}

      {!loading && clientSecret && stripeInstance && (
        <Elements
          stripe={stripeInstance}
          options={{
            clientSecret,
            appearance: { theme: brandId === "soccerone" ? "night" : "stripe" },
          }}
        >
          <PayCardForm
            amounts={amounts}
            fallbackAmountCents={amountDueCents}
            onSuccess={onPaid}
            onBusy={onBusy}
            onActivity={onActivity}
          />
        </Elements>
      )}
    </div>
  );
}

function PayCardForm({
  amounts,
  fallbackAmountCents,
  onSuccess,
  onBusy,
  onActivity,
}: {
  amounts: PaymentAmounts | null;
  fallbackAmountCents: number;
  onSuccess: () => void;
  onBusy?: (busy: boolean) => void;
  onActivity?: () => void;
}) {
  const stripe = useStripe();
  const elements = useElements();
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const totalLabel = amounts ? fmt(amounts.totalCents) : fmt(fallbackAmountCents);

  // `busy` is set BEFORE confirmPayment (below) and cleared in its `finally`,
  // so mirroring it upward covers the entire confirm + 3-D Secure window —
  // including the inline challenge iframe, which produces no parent-window
  // activity either. Deriving the signal from state, with an unmount release,
  // is what guarantees no exit path (success, decline, throw, reset) can
  // leave the kiosk wedged in a suppressed state where it never resets.
  //
  // The success hand-off has no gap: onSuccess() flips SelfServe's
  // paymentProcessing true in the same batch that clears `busy`, so the
  // aggregate busy signal SelfServe reports stays continuously true from tap
  // to webhook confirmation.
  const onBusyRef = useRef(onBusy);
  onBusyRef.current = onBusy;
  useEffect(() => {
    onBusyRef.current?.(busy);
    return () => {
      if (busy) onBusyRef.current?.(false);
    };
  }, [busy]);

  const onPay = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!stripe || !elements) return;
    setBusy(true);
    setFormError(null);
    try {
      const result = await stripe.confirmPayment({
        elements,
        confirmParams: { return_url: window.location.href },
        redirect: "if_required",
      });
      if (result.error) {
        // Card declines, validation errors, etc. — transient and
        // retryable, so a toast (not a persistent banner) per house rules.
        toast.error(result.error.message ?? "Payment failed");
        setFormError(result.error.message ?? "Payment failed");
        return;
      }
      if (result.paymentIntent?.status === "succeeded") {
        onSuccess();
        return;
      }
      // requires_action / processing / other non-terminal state — surface
      // it and let the customer retry; the webhook remains the source of
      // truth for anything that does eventually settle.
      toast.error("Payment did not complete. Please try again.");
      setFormError("Payment did not complete. Please try again.");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Network error";
      toast.error(message);
      setFormError(message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={onPay} className="space-y-3">
      {amounts && (
        <div className="text-sm space-y-1 border border-border rounded p-3 bg-cream-2">
          <div className="flex justify-between text-ink-muted">
            <span>Session</span>
            <span>{fmt(amounts.baseAmountCents)}</span>
          </div>
          {amounts.surchargeCents > 0 && (
            <div className="flex justify-between text-ink-muted">
              <span>Card processing fee</span>
              <span>{fmt(amounts.surchargeCents)}</span>
            </div>
          )}
          <div className="flex justify-between font-medium text-ink border-t border-border pt-1">
            <span>Total</span>
            <span>{fmt(amounts.totalCents)}</span>
          </div>
        </div>
      )}

      {/* onChange/onFocus are the ONLY activity we can observe from inside
          Stripe's cross-origin iframe — keystrokes on the card fields never
          bubble to the parent window. Without them the kiosk's idle timer
          counts a customer mid-card-entry as an abandoned session. */}
      <PaymentElement
        onChange={() => onActivity?.()}
        onFocus={() => onActivity?.()}
      />

      <ErrorBanner message={formError} onDismiss={() => setFormError(null)} />

      <button type="submit" disabled={busy || !stripe || !elements} className={PRIMARY_BTN}>
        {busy ? "Processing…" : `Pay ${totalLabel}`}
      </button>
    </form>
  );
}
