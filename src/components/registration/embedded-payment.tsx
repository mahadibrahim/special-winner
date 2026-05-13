"use client";

import { useMemo, useState } from "react";
import { loadStripe, type Stripe as StripeJs } from "@stripe/stripe-js";
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

interface EmbeddedPaymentProps {
  /** PaymentIntent client secret (pi_xxx_secret_xxx). */
  clientSecret: string;
  publishableKey: string;
  seasonItem: SeasonItem;
  /** Amount being charged right now (deposit, balance, or full) — cents */
  valueCents: number;
  paymentType: CheckoutPaymentType;
  coupon?: string;
  /** Where Stripe sends the user back after SCA / 3DS (absolute URL) */
  returnUrl: string;
  /**
   * The customer's bank-vs-card choice from the previous screen. The
   * PaymentIntent was created with payment_method_types narrowed to
   * match, so we use this prop to order methods within the card family.
   * Defaults to undefined for callers (e.g. pay-balance-form) that
   * haven't adopted the bank/card split yet.
   */
  paymentMethodCategory?: "bank" | "card";
  /** Called after a synchronous (non-redirect) successful confirm. */
  onSuccess: (paymentIntentId: string) => void;
  /** Called when the user clicks Back to abandon this in-flight intent. */
  onCancel: () => void;
}

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

// Card-family ordering — Card first, then Link / BNPL / wallets. Each entry
// must be a payment method type accepted by Stripe; wallet brands like
// Apple Pay / Google Pay ride on top of "card" and are not separate entries.
const CARD_METHOD_ORDER = [
  "card",
  "link",
  "cashapp",
  "amazon_pay",
  "klarna",
  "affirm",
  "afterpay_clearpay",
];

export function EmbeddedPayment(props: EmbeddedPaymentProps) {
  const stripePromise = useMemo(
    () => getStripePromise(props.publishableKey),
    [props.publishableKey],
  );

  return (
    <Elements
      stripe={stripePromise}
      options={{
        clientSecret: props.clientSecret,
        appearance: {
          theme: "flat",
          variables: {
            colorPrimary: "#1a1a1a",
            colorBackground: "#fdfaf2",
            colorText: "#1a1a1a",
            colorDanger: "#b91c1c",
            fontFamily: "system-ui, -apple-system, sans-serif",
            borderRadius: "8px",
          },
        },
        loader: "auto",
      }}
    >
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
  paymentMethodCategory,
  onSuccess,
  onCancel,
}: Omit<EmbeddedPaymentProps, "clientSecret" | "publishableKey">) {
  const stripe = useStripe();
  const elements = useElements();
  const [isReady, setIsReady] = useState(false);
  const [isComplete, setIsComplete] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasFiredAddPaymentInfo, setHasFiredAddPaymentInfo] = useState(false);

  const handlePay = async () => {
    if (!stripe || !elements) return;
    setIsSubmitting(true);
    setError(null);

    const { error: submitError } = await elements.submit();
    if (submitError) {
      setError(submitError.message ?? "Card details are invalid");
      setIsSubmitting(false);
      return;
    }

    const { error: confirmError, paymentIntent } = await stripe.confirmPayment({
      elements,
      confirmParams: { return_url: returnUrl },
      redirect: "if_required",
    });

    if (confirmError) {
      setError(confirmError.message ?? "Payment failed");
      setIsSubmitting(false);
      return;
    }

    if (paymentIntent && paymentIntent.status === "succeeded") {
      trackPurchase(
        paymentIntent.id,
        seasonItem,
        valueCents,
        paymentType,
        coupon,
      );
      onSuccess(paymentIntent.id);
      return;
    }

    // status: "processing" | "requires_action" — Stripe will have redirected
    // for redirect-required flows because of the return_url; for processing,
    // hand off to the return page so it can poll status.
    if (paymentIntent) {
      window.location.href = `${returnUrl}?payment_intent=${paymentIntent.id}`;
    }
  };

  return (
    <div className="space-y-4">
      <PaymentElement
        options={{
          layout: "accordion",
          ...(paymentMethodCategory === "card"
            ? { paymentMethodOrder: CARD_METHOD_ORDER }
            : {}),
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
