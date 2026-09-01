"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { ErrorBanner } from "@/components/ui/error-banner";
import { LoadingSkeleton } from "@/components/ui/loading-skeleton";
import { useHydrationBeacon } from "@/lib/hooks/use-hydration-beacon";
import { toast } from "sonner";

/**
 * Shape-tolerant error extraction for /api/dropin/claim/:token's error
 * bodies. Three shapes are in play on this endpoint:
 *   - `{ error: { code, message } }` — the class-walkup guard's coded shape
 *     (422 class_requires_child).
 *   - `{ error: "slug", message: "friendly sentence" }` —
 *     classRateNotConfigured's shape (409 class_rate_not_configured). Note
 *     `error` here is a MACHINE slug, not prose — rendering it verbatim
 *     would show "class_rate_not_configured" instead of the sentence.
 *   - `{ error: "a friendly sentence" }` — every other refusal on this
 *     endpoint (expired window, wrong user, Stripe not configured, …).
 * Precedence matters: the nested object's `.message` wins first, then a
 * top-level `message` (this is what catches the slug+message pair BEFORE
 * its `error` string gets mistaken for the whole story), then the bare
 * string, then the fallback. Doesn't reuse walk-up-error.ts's
 * `walkUpErrorMessage` — that helper returns a bare string `error`
 * immediately without checking a sibling `message`, which is exactly wrong
 * for the slug+message shape this endpoint uses.
 */
function claimErrorMessage(json: unknown, fallback: string): string {
  if (!json || typeof json !== "object") return fallback;
  const body = json as { error?: unknown; message?: unknown };
  if (body.error && typeof body.error === "object") {
    const nested = (body.error as { message?: unknown }).message;
    if (typeof nested === "string") return nested;
  }
  if (typeof body.message === "string") return body.message;
  if (typeof body.error === "string") return body.error;
  return fallback;
}

interface ClaimInfo {
  bookingId: string;
  sessionId: string;
  promotionExpiresAt: string;
  paymentMethod: string;
  amountPaidCents: number;
  /** True when the row's original charge was refunded (overflow policy) —
   *  confirming this claim requires paying again. */
  paymentRequired: boolean;
  /** What the claimant owes (personal rate + card surcharge) when
   *  paymentRequired; null otherwise. */
  amountDueCents: number | null;
}

interface ClaimPageProps {
  token: string;
  isAuthenticated: boolean;
}

export default function ClaimPage({ token, isAuthenticated }: ClaimPageProps) {
  useHydrationBeacon();

  const [info, setInfo] = useState<ClaimInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const fetchClaim = async () => {
      try {
        const res = await fetch(`/api/dropin/claim/${token}`);
        const json = await res.json();
        if (!res.ok) {
          setError(
            res.status === 410
              ? "This claim window has expired."
              : claimErrorMessage(json, "Invalid claim"),
          );
          return;
        }
        setInfo(json);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load");
      } finally {
        setLoading(false);
      }
    };
    void fetchClaim();
  }, [token]);

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  if (loading) return <LoadingSkeleton />;
  if (error) return <ErrorBanner message={error} />;
  if (!info) return null;

  const expiresAt = new Date(info.promotionExpiresAt).getTime();
  const remainingMs = Math.max(0, expiresAt - now);
  const remainingMin = Math.floor(remainingMs / 60000);
  const remainingSec = Math.floor((remainingMs % 60000) / 1000);
  const expired = remainingMs <= 0;
  // A paid claim GET that can't resolve an amount (e.g. a class session
  // missing its rate — see the report-only posture on
  // GET /api/dropin/sessions/[id] and resolveAmountDueCents in
  // claim/[token].ts) means the "pay" action is a guaranteed 422 — don't
  // dangle a "Pay & confirm" button into that. Disable it with a note
  // instead of letting the click round-trip to a refusal.
  const priceUnavailable = info.paymentRequired && info.amountDueCents == null;

  const claim = async () => {
    setBusy(true);
    try {
      const res = await fetch(`/api/dropin/claim/${token}`, { method: "POST" });
      const json = await res.json();
      if (!res.ok) {
        toast.error(claimErrorMessage(json, "Claim failed"));
        return;
      }
      toast.success("Spot confirmed");
      window.location.href = `/dropin/${info.sessionId}?booking=success`;
    } finally {
      setBusy(false);
    }
  };

  // Payment step for refunded (overflow) claims: the original charge went
  // back to the customer when the session filled up, so confirming this
  // spot means paying for it — the endpoint mints a Stripe Checkout Session
  // and the webhook confirms the booking once the charge settles.
  const payAndClaim = async () => {
    setBusy(true);
    try {
      const res = await fetch(`/api/dropin/claim/${token}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "pay" }),
      });
      const json = await res.json();
      if (!res.ok) {
        toast.error(claimErrorMessage(json, "Could not start payment"));
        setBusy(false);
        return;
      }
      // Zero-due claim (e.g. a membership now covers the session): the
      // endpoint confirms directly with nothing to charge.
      if (json.ok && !json.checkoutUrl) {
        toast.success("Spot confirmed");
        window.location.href = `/dropin/${info.sessionId}?booking=success`;
        return;
      }
      if (!json.checkoutUrl) {
        toast.error("Could not start payment");
        setBusy(false);
        return;
      }
      window.location.href = json.checkoutUrl;
      // No setBusy(false) on success — we're navigating away to Stripe.
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Network error");
      setBusy(false);
    }
  };

  return (
    <div className="max-w-md mx-auto space-y-6">
      <header>
        <h1 className="text-2xl font-bold text-stone-900">Claim your spot</h1>
        <p className="mt-1 text-sm text-stone-600">
          A waitlist spot opened up for you.
        </p>
      </header>

      <div className="rounded-xl border border-stone-200 bg-white p-5 space-y-3">
        <div className="text-sm text-stone-700">
          {expired ? (
            <span className="text-amber-700 font-medium">Window expired</span>
          ) : (
            <>
              <span className="font-medium">{remainingMin}:{String(remainingSec).padStart(2, "0")}</span>{" "}
              left to claim
            </>
          )}
        </div>

        {info.paymentRequired ? (
          <p className="text-sm text-stone-600">
            Your earlier payment was refunded when this session filled up —
            pay now to lock in this spot.
          </p>
        ) : (
          info.paymentMethod === "card_online" &&
          info.amountPaidCents > 0 && (
            <p className="text-sm text-stone-600">
              Already paid — claim confirms your spot.
            </p>
          )
        )}

        {!isAuthenticated && (
          <Button asChild className="w-full">
            <a href={`/signin?redirect=/dropin/claim/${token}`}>Sign in to claim</a>
          </Button>
        )}

        {isAuthenticated && (
          <Button
            onClick={info.paymentRequired ? payAndClaim : claim}
            disabled={busy || expired || priceUnavailable}
            className="w-full"
          >
            {busy
              ? "Working…"
              : expired
                ? "Expired"
                : priceUnavailable
                  ? "Pricing unavailable"
                  : info.paymentRequired
                    ? `Pay $${(info.amountDueCents! / 100).toFixed(2)} & confirm`
                    : "Confirm my spot"}
          </Button>
        )}
        {isAuthenticated && priceUnavailable && !expired && (
          <p className="text-xs text-amber-700 text-center">
            We can't calculate what you owe right now — contact the front
            desk to confirm this spot.
          </p>
        )}

        <a
          href={`/dropin/${info.sessionId}`}
          className="block text-center text-xs text-stone-500 hover:text-stone-900"
        >
          See session details
        </a>
      </div>
    </div>
  );
}
