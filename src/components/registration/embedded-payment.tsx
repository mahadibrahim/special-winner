"use client";

import { useMemo, useState } from "react";
import {
  loadStripe,
  type Stripe as StripeJs,
  type PaymentIntentResult,
} from "@stripe/stripe-js";
import {
  Elements,
  PaymentElement,
  useStripe,
  useElements,
} from "@stripe/react-stripe-js";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ErrorBanner } from "@/components/ui/error-banner";
import {
  trackAddPaymentInfo,
  trackPurchase,
  type SeasonItem,
  type CheckoutPaymentType,
} from "@/lib/analytics/datalayer";

/** Deferred-mode callback result: the new PaymentIntent's client secret, or a
 *  user-facing error string if the registration/intent couldn't be created. */
export type CreateIntentResult = { clientSecret: string } | { error: string };

type EmbeddedPaymentBase = {
  publishableKey: string;
  seasonItem: SeasonItem;
  /** Amount charged right now (deposit, balance, or full) — cents. Drives the
   *  deferred Elements amount and the Pay button label. */
  valueCents: number;
  paymentType: CheckoutPaymentType;
  coupon?: string;
  /** Where Stripe sends the user back after SCA / 3DS (absolute URL). */
  returnUrl: string;
  /** Called after a synchronous (non-redirect) successful confirm. */
  onSuccess: (paymentIntentId: string) => void;
  /** Called when the user clicks Back. */
  onCancel: () => void;
};

/**
 * Two mutually-exclusive modes:
 *  - `clientSecret`: the PaymentIntent already exists (pay-balance page). The
 *    card form mounts against it directly.
 *  - `createIntent`: DEFERRED. The card form mounts with no PaymentIntent; the
 *    registration row + PaymentIntent are created on Pay via this callback,
 *    which returns the new clientSecret. Nothing is written for visitors who
 *    reach the step but never pay (the registration funnel).
 */
export type EmbeddedPaymentProps = EmbeddedPaymentBase &
  (
    | { clientSecret: string; createIntent?: undefined }
    | { createIntent: () => Promise<CreateIntentResult>; clientSecret?: undefined }
  );

// Cache one Stripe.js promise per publishableKey for the page lifetime.
const stripePromiseCache = new Map<string, Promise<StripeJs | null>>();
function getStripePromise(publishableKey: string): Promise<StripeJs | null> {
  let p = stripePromiseCache.get(publishableKey);
  if (!p) {
    p = loadStripe(publishableKey);
    stripePromiseCache.set(publishableKey, p);
  }
  return p;
}

const APPEARANCE = {
  theme: "flat" as const,
  variables: {
    colorPrimary: "#1a1a1a",
    colorBackground: "#fdfaf2",
    colorText: "#1a1a1a",
    colorDanger: "#b91c1c",
    fontFamily: "system-ui, -apple-system, sans-serif",
    borderRadius: "8px",
  },
};

export function EmbeddedPayment(props: EmbeddedPaymentProps) {
  const stripePromise = useMemo(
    () => getStripePromise(props.publishableKey),
    [props.publishableKey],
  );

  // Card-only everywhere: Link / ACH / Klarna / BNPL are disabled account-wide
  // in the Stripe Dashboard, so the Payment Element shows just the card fields
  // plus Apple Pay / Google Pay (which ride on "card") on supported devices.
  //
  // Deferred mode omits clientSecret and passes mode+amount so the form mounts
  // with no PaymentIntent; Stripe requires paymentMethodTypes to be set
  // explicitly in this mode.
  const options = props.createIntent
    ? {
        mode: "payment" as const,
        amount: props.valueCents,
        currency: "usd",
        paymentMethodTypes: ["card"],
        appearance: APPEARANCE,
        loader: "auto" as const,
      }
    : {
        clientSecret: props.clientSecret,
        appearance: APPEARANCE,
        loader: "auto" as const,
      };

  return (
    <Elements stripe={stripePromise} options={options}>
      <PaymentForm {...props} />
    </Elements>
  );
}

function PaymentForm({
  seasonItem,
  valueCents,
  paymentType,
  coupon,
  returnUrl,
  createIntent,
  onSuccess,
  onCancel,
}: EmbeddedPaymentProps) {
  const stripe = useStripe();
  const elements = useElements();
  const [isReady, setIsReady] = useState(false);
  const [isComplete, setIsComplete] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasFiredAddPaymentInfo, setHasFiredAddPaymentInfo] = useState(false);

  const settleConfirmResult = (result: PaymentIntentResult) => {
    const { error: confirmError, paymentIntent } = result;

    if (confirmError) {
      setError(confirmError.message ?? "Payment failed");
      setIsSubmitting(false);
      return;
    }

    if (paymentIntent && paymentIntent.status === "succeeded") {
      trackPurchase(paymentIntent.id, seasonItem, valueCents, paymentType, coupon);
      onSuccess(paymentIntent.id);
      return;
    }

    // status "processing" | "requires_action" — Stripe redirects for
    // redirect-required flows via return_url; for processing, hand off to the
    // return page to poll status.
    if (paymentIntent) {
      window.location.href = `${returnUrl}?payment_intent=${paymentIntent.id}`;
    }
  };

  const handlePay = async () => {
    if (!stripe || !elements || isSubmitting) return;
    setIsSubmitting(true);
    setError(null);

    // Validate + collect the card / wallet details from the mounted element.
    const { error: submitError } = await elements.submit();
    if (submitError) {
      setError(submitError.message ?? "Card details are invalid");
      setIsSubmitting(false);
      return;
    }

    if (createIntent) {
      // Deferred: create the registration + PaymentIntent now (on Pay), then
      // confirm against its clientSecret. No row/intent for people who bail.
      const created = await createIntent();
      if ("error" in created) {
        setError(created.error);
        setIsSubmitting(false);
        return;
      }
      const result = await stripe.confirmPayment({
        elements,
        clientSecret: created.clientSecret,
        confirmParams: { return_url: returnUrl },
        redirect: "if_required",
      });
      settleConfirmResult(result);
      return;
    }

    // clientSecret mode: the intent already exists in the Elements group.
    const result = await stripe.confirmPayment({
      elements,
      confirmParams: { return_url: returnUrl },
      redirect: "if_required",
    });
    settleConfirmResult(result);
  };

  return (
    <div className="space-y-4">
      <PaymentElement
        options={{
          layout: "accordion",
          wallets: { applePay: "auto", googlePay: "auto" },
        }}
        onReady={() => setIsReady(true)}
        onChange={(e) => {
          setIsComplete(e.complete);
          if (e.complete && !hasFiredAddPaymentInfo) {
            const methodType = (e.value?.type as string) ?? "card";
            trackAddPaymentInfo(seasonItem, valueCents, methodType, coupon);
            setHasFiredAddPaymentInfo(true);
          }
        }}
      />

      {error && <ErrorBanner message={error} />}

      <div className="flex items-center justify-between gap-3">
        <Button variant="ghost" onClick={onCancel} disabled={isSubmitting}>
          Back
        </Button>
        <Button
          onClick={handlePay}
          disabled={!stripe || !isReady || !isComplete || isSubmitting}
          className="bg-primary hover:bg-primary/90"
        >
          {isSubmitting ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Processing…
            </>
          ) : (
            `Pay $${(valueCents / 100).toFixed(2)}`
          )}
        </Button>
      </div>
    </div>
  );
}
