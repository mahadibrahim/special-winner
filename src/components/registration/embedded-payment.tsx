"use client";

import { useMemo, useState } from "react";
import { loadStripe, type Stripe as StripeJs } from "@stripe/stripe-js";
import {
  CheckoutProvider,
  PaymentElement,
  useCheckout,
} from "@stripe/react-stripe-js/checkout";
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
  /** Custom Checkout Session client secret (cs_xxx_secret_xxx). */
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
   * Checkout Session was created with the corresponding amount/line items;
   * this prop only drives display ordering inside the PaymentElement.
   * Defaults to "card" for callers (e.g. pay-balance-form) that haven't
   * adopted the bank/card split yet.
   */
  paymentMethodCategory?: "bank" | "card";
  /** Called after a synchronous (non-redirect) successful confirm. */
  onSuccess: (sessionId: string) => void;
  /** Called when the user clicks Back to abandon this in-flight session. */
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

  // CheckoutProvider holds the clientSecret in a stable closure — passing
  // a Promise that resolves to the current value matches Stripe's API and
  // avoids re-creating the session on re-render.
  const fetchClientSecret = useMemo(
    () => () => Promise.resolve(props.clientSecret),
    [props.clientSecret],
  );

  return (
    <CheckoutProvider
      stripe={stripePromise}
      options={{
        fetchClientSecret,
        elementsOptions: { appearance: APPEARANCE },
      }}
    >
      <PaymentForm {...props} />
    </CheckoutProvider>
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
  const checkoutState = useCheckout();
  const [isComplete, setIsComplete] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasFiredAddPaymentInfo, setHasFiredAddPaymentInfo] = useState(false);

  if (checkoutState.type === "loading") {
    return (
      <div className="flex items-center justify-center gap-2 py-12 text-ink-muted">
        <Loader2 className="h-4 w-4 animate-spin" />
        <span>Loading secure payment form…</span>
      </div>
    );
  }

  if (checkoutState.type === "error") {
    return (
      <ErrorBanner
        message={
          checkoutState.error?.message ??
          "We couldn't load the payment form. Please try again."
        }
      />
    );
  }

  const { checkout } = checkoutState;

  const handlePay = async () => {
    setIsSubmitting(true);
    setError(null);

    const result = await checkout.confirm({
      returnUrl,
      redirect: "if_required",
    });

    if (result.type === "error") {
      setError(result.error.message ?? "Payment failed");
      setIsSubmitting(false);
      return;
    }

    // type === "success" — non-redirect path completed. For methods that
    // require a redirect (3DS, bank flows), Stripe will have navigated to
    // returnUrl before this point.
    trackPurchase(
      result.session.id,
      seasonItem,
      valueCents,
      paymentType,
      coupon,
    );
    onSuccess(result.session.id);
  };

  return (
    <div className="space-y-4">
      <PaymentElement
        options={{
          // Tabs is cleaner than accordion when the session has been
          // narrowed to a small set of methods on the previous screen.
          layout: "tabs",
          ...(paymentMethodCategory === "card"
            ? { paymentMethodOrder: CARD_METHOD_ORDER }
            : {}),
        }}
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
          disabled={!isComplete || isSubmitting}
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
