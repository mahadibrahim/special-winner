"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import {
  EmbeddedPayment,
  type CreateIntentResult,
} from "@/components/registration/embedded-payment";
import { computeSurchargeCents } from "@/lib/payments/surcharge";

interface BookButtonProps {
  sessionId: string;
  /**
   * Per-user resolved amount in cents from the detail endpoint. Null if
   * unauthenticated; the click handler bounces to /signin in that case.
   */
  resolvedAmountCents: number | null;
  /** True when capacity gate is closed; the click joins the waitlist. */
  isFull: boolean;
  /** Existing booking status, if any. */
  alreadyBookedStatus: string | null;
  isAuthenticated: boolean;
  /** Server-threaded STRIPE_PUBLISHABLE_KEY — mounts the inline deferred
   *  Payment Element for paid bookings. Empty string degrades the paid path
   *  to the legacy hosted-Checkout redirect. */
  stripePublishableKey: string;
  /** Session labels — analytics purchase item for the inline payment. */
  sportOrClassLabel: string;
  formatLabel: string | null;
  venueName: string | null;
}

// NOTE — no waiver here by design ("sign before you PLAY, not before you
// pay"): first-week ads data showed the pre-payment waiver dialog cost
// pickup conversions. The waiver is captured AFTER payment on the booking
// confirmation surface (see SessionDetail's waiver card), with email,
// dashboard, and host-roster backstops. Guests provide only the contact
// details the charge/receipt/account require.

export function BookButton({
  sessionId,
  resolvedAmountCents,
  isFull,
  alreadyBookedStatus,
  isAuthenticated,
  stripePublishableKey,
  sportOrClassLabel,
  formatLabel,
  venueName,
}: BookButtonProps) {
  const [busy, setBusy] = useState(false);
  // Guest-only minimal step: email + first/last name (needed for the
  // charge/receipt/account). Signed-in players skip straight past it.
  const [showGuestDetails, setShowGuestDetails] = useState(false);
  // Paid sessions: the inline deferred card form renders in place of the
  // Book button (no redirect to Stripe).
  const [showPayment, setShowPayment] = useState(false);

  // Guest-mode contact fields — drop-ins are impulse purchases, so
  // anonymous visitors book with name + email instead of bouncing to
  // /signin (see /api/dropin/guest-checkout). Waitlist still requires an
  // account: joining one is a commitment to come back later.
  const [guestFirstName, setGuestFirstName] = useState("");
  const [guestLastName, setGuestLastName] = useState("");
  const [guestEmail, setGuestEmail] = useState("");

  // Referral attribution (?src=host-share, etc.) — captured once on mount so
  // it survives whatever the dialog does to the URL/history. Threaded
  // into the booking POST body for both the free path and the paid intent
  // creation; sanitizeReferralSource is the actual allow-list, applied
  // server-side before it ever reaches the booking row.
  const [referralSrc] = useState<string | null>(() =>
    typeof window !== "undefined"
      ? new URLSearchParams(window.location.search).get("src")
      : null,
  );

  if (!isAuthenticated && isFull) {
    return (
      <Button asChild size="lg" className="w-full">
        <a href={`/signin?redirect=/dropin/${sessionId}`}>
          Sign in to join waitlist
        </a>
      </Button>
    );
  }

  if (alreadyBookedStatus === "confirmed") {
    // The dashboard is auth-gated. A guest who booked without signing in
    // (existing-account guest — new guests get an auto-session) would be
    // bounced to /signin from "View in dashboard", so send them there
    // explicitly with a clearer label instead.
    return (
      <Button asChild size="lg" variant="outline" className="w-full">
        {isAuthenticated ? (
          <a href="/dashboard/bookings">View in dashboard</a>
        ) : (
          <a href="/signin?redirect=/dashboard/bookings">
            Sign in to manage your booking
          </a>
        )}
      </Button>
    );
  }
  if (alreadyBookedStatus === "waitlisted") {
    return (
      <Button size="lg" disabled className="w-full">
        On waitlist
      </Button>
    );
  }
  if (alreadyBookedStatus === "pending_claim") {
    return (
      <Button asChild size="lg" className="w-full">
        <a href="/dashboard/bookings">Confirm spot</a>
      </Button>
    );
  }
  if (alreadyBookedStatus === "pending_payment") {
    // Walk-in kiosk hold — this page doesn't mint self-serve tokens (that's
    // the PayCard surface, reached via the pay link texted/emailed at
    // check-in), so it can't offer a "Pay now" action here. Just stop the
    // visitor from double-booking a session they already hold a slot on,
    // without contradicting the pay link they may already be holding.
    return (
      <Button size="lg" disabled className="w-full">
        Hold pending payment — use the pay link we sent, or see the front desk
      </Button>
    );
  }

  // Inline payment applies to a bookable (not full) paid session, and needs
  // both a mountable amount and the publishable key. Anything else keeps the
  // legacy submit path (free booking, waitlist join, or — if the key is ever
  // missing — the hosted-Checkout redirect fallback).
  const paidInline =
    !isFull &&
    resolvedAmountCents !== null &&
    resolvedAmountCents > 0 &&
    stripePublishableKey.length > 0;

  // Drop-in payments are card-only, so the card surcharge always applies —
  // same computation the server runs (computeSurchargeCents is shared), so
  // the mounted Elements amount always equals the created intent's amount.
  const chargeCents =
    resolvedAmountCents !== null && resolvedAmountCents > 0
      ? resolvedAmountCents + computeSurchargeCents(resolvedAmountCents, "card")
      : 0;

  const buildPayload = (): Record<string, unknown> =>
    isAuthenticated
      ? {
          sessionId,
          ...(referralSrc ? { src: referralSrc } : {}),
        }
      : {
          sessionId,
          firstName: guestFirstName.trim(),
          lastName: guestLastName.trim(),
          email: guestEmail.trim(),
          ...(referralSrc ? { src: referralSrc } : {}),
        };

  const endpoint = isAuthenticated
    ? "/api/dropin/bookings"
    : "/api/dropin/guest-checkout";

  /** Post-booking navigation, mirroring the server's success_url behavior:
   *  the session page's ?booking=success banner, carrying the PaymentIntent
   *  id so guests without a login session can still resolve their booking
   *  (see /api/dropin/sessions/[id]). */
  const goToBookedSession = (paymentIntentId: string | null) => {
    const url = new URL(`/dropin/${sessionId}`, window.location.origin);
    url.searchParams.set("booking", "success");
    if (paymentIntentId) url.searchParams.set("payment_intent", paymentIntentId);
    window.location.href = url.toString();
  };

  /** Free-booking navigation. Free bookings now land back on the session
   *  page's confirmed surface (not the dashboard) so the post-payment
   *  waiver card is the very next thing the player sees. */
  const goAfterFreeBooking = () => {
    window.location.href = `/dropin/${sessionId}?booking=success`;
  };

  /**
   * Legacy submit path: free bookings, waitlist joins, and the hosted
   * Checkout redirect fallback. Paid inline bookings never come through
   * here — they go straight to the inline card form → createIntent.
   */
  const submitBooking = async () => {
    setBusy(true);
    setShowGuestDetails(false);
    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(buildPayload()),
      });
      const json = await res.json();
      if (!res.ok) {
        toast.error(
          typeof json.error === "string"
            ? json.error
            : json.error?.message || "Booking failed",
        );
        return;
      }
      if (json.paymentRequired && json.checkoutUrl) {
        window.location.href = json.checkoutUrl;
        return;
      }
      toast.success(
        json.teamAssignment
          ? `Booked — Team ${json.teamAssignment}`
          : "Booked",
      );
      goAfterFreeBooking();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Network error");
    } finally {
      setBusy(false);
    }
  };

  /**
   * Deferred create-on-Pay: mint the booking PaymentIntent when the customer
   * clicks Pay in the inline card form. Nothing is created for visitors who
   * open the form but never pay. The booking row itself is inserted by the
   * payment_intent.succeeded webhook, exactly like the hosted flow.
   */
  const createIntent = async (): Promise<CreateIntentResult> => {
    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...buildPayload(),
          paymentFlow: "embedded",
          // Fresh per Pay click — scopes the server's Stripe idempotency key
          // to this attempt (a retry after a decline mints a new intent).
          attemptId:
            typeof crypto !== "undefined" && "randomUUID" in crypto
              ? crypto.randomUUID()
              : `${Date.now()}-${Math.random().toString(36).slice(2)}`,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        return {
          error:
            typeof json.error === "string"
              ? json.error
              : json.error?.message || "Booking failed",
        };
      }
      if (json.paymentRequired === false) {
        // The server re-resolved the rate to $0 (e.g. a membership benefit
        // kicked in since page load) and booked immediately — no payment to
        // collect. Navigate to success; the pending promise is abandoned by
        // the page unload.
        goAfterFreeBooking();
        return new Promise<CreateIntentResult>(() => {});
      }
      if (typeof json.clientSecret !== "string") {
        return { error: "Payment could not be started. Please try again." };
      }
      return { clientSecret: json.clientSecret };
    } catch (err) {
      return {
        error: err instanceof Error ? err.message : "Network error",
      };
    }
  };

  /** Book click. Signed-in players go straight to the inline card form (or
   *  straight to booking for free/legacy paths) — no dialog at all. Guests
   *  get the one minimal contact step first. */
  const handleBookClick = () => {
    if (!isAuthenticated) {
      setShowGuestDetails(true);
      return;
    }
    if (paidInline) {
      setShowPayment(true);
      return;
    }
    void submitBooking();
  };

  const confirmGuestDetails = () => {
    if (paidInline) {
      setShowGuestDetails(false);
      setShowPayment(true);
      return;
    }
    void submitBooking();
  };

  const guestFieldsValid =
    guestFirstName.trim().length > 0 &&
    guestLastName.trim().length > 0 &&
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(guestEmail.trim());

  const label = isFull
    ? "Join waitlist"
    : resolvedAmountCents === 0
      ? "Book — free"
      : resolvedAmountCents == null
        ? "Book"
        : `Book — $${(resolvedAmountCents / 100).toFixed(2)}`;

  if (showPayment && paidInline) {
    return (
      <div className="rounded-lg border border-cream-3 bg-paper p-4 space-y-4">
        <div className="flex items-baseline justify-between gap-3">
          <p className="font-medium text-ink">Pay to book your spot</p>
          <p className="text-sm text-ink-muted">
            ${(chargeCents / 100).toFixed(2)}
          </p>
        </div>
        <EmbeddedPayment
          createIntent={createIntent}
          publishableKey={stripePublishableKey}
          seasonItem={{
            id: sessionId,
            name: formatLabel
              ? `${sportOrClassLabel} ${formatLabel}`
              : sportOrClassLabel,
            category: sportOrClassLabel,
            category2: venueName ?? "Drop-in",
            priceCents: chargeCents,
          }}
          valueCents={chargeCents}
          paymentType="full"
          returnUrl={`${typeof window !== "undefined" ? window.location.origin : ""}/dropin/${sessionId}?booking=success`}
          onSuccess={(paymentIntentId) => goToBookedSession(paymentIntentId)}
          onCancel={() => setShowPayment(false)}
        />
      </div>
    );
  }

  return (
    <>
      <Button
        onClick={handleBookClick}
        disabled={busy}
        size="lg"
        className="w-full"
      >
        {busy ? "Working…" : label}
      </Button>

      <Dialog open={showGuestDetails} onOpenChange={setShowGuestDetails}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Almost in — who's playing?</DialogTitle>
          </DialogHeader>

          <div className="space-y-3 pb-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="guest-first-name" className="text-sm">
                  First name
                </Label>
                <Input
                  id="guest-first-name"
                  value={guestFirstName}
                  onChange={(e) => setGuestFirstName(e.target.value)}
                  autoComplete="given-name"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="guest-last-name" className="text-sm">
                  Last name
                </Label>
                <Input
                  id="guest-last-name"
                  value={guestLastName}
                  onChange={(e) => setGuestLastName(e.target.value)}
                  autoComplete="family-name"
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="guest-email" className="text-sm">
                Email
              </Label>
              <Input
                id="guest-email"
                type="email"
                value={guestEmail}
                onChange={(e) => setGuestEmail(e.target.value)}
                autoComplete="email"
                placeholder="you@email.com"
              />
              <p className="text-xs text-ink-faint">
                For your receipt and booking details.
              </p>
            </div>
            <p className="text-xs text-ink-faint">
              Already have an account?{" "}
              <a
                href={`/signin?redirect=/dropin/${sessionId}`}
                className="underline hover:text-ink-2"
              >
                Sign in
              </a>{" "}
              to use your saved details and member pricing.
            </p>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowGuestDetails(false)}
              disabled={busy}
            >
              Cancel
            </Button>
            <Button
              onClick={confirmGuestDetails}
              disabled={!guestFieldsValid || busy}
            >
              {busy
                ? "Working…"
                : paidInline
                  ? "Continue to payment"
                  : "Confirm & book"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
