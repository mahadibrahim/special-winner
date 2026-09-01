"use client";

import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ErrorBanner } from "@/components/ui/error-banner";
import { LoadingSkeleton } from "@/components/ui/loading-skeleton";
import { toast } from "sonner";
import { useHydrationBeacon } from "@/lib/hooks/use-hydration-beacon";
import { useBrandId } from "@/lib/hooks/use-brand-id";
import { deriveDropInSuccessPhase } from "@/lib/dropin/success-phase";
import {
  DROPIN_WAIVER_TEXT,
  DROPIN_WAIVER_ACCEPT_LABEL,
} from "@/lib/dropin/waiver-text";
import { BookButton } from "./BookButton";

interface DetailResponse {
  session: {
    id: string;
    kind: "pickup" | "class";
    sportOrClassLabel: string;
    formatLabel: string | null;
    startsAt: string;
    endsAt: string;
    capacity: number;
    capacityMale: number | null;
    capacityFemale: number | null;
    skillLevel: string;
    audience: string;
    membersOnly: boolean;
    sessionRateCents: number | null;
    memberRateCents: number | null;
  };
  venueName: string | null;
  /** Confirmed + pending-payment holds + pending-claim promotions — every
   *  status that occupies a real seat (see dropin/sessions/[id].ts). */
  confirmedCount: number;
  waitlistCount: number;
  rateCard: {
    cancelWindowHours: number;
    promotionWindowMinutes: number;
    defaultSessionRateCents: number;
    defaultMemberRateCents: number;
  } | null;
  resolvedAmountCents: number | null;
  resolvedPaymentMethod: string | null;
  alreadyBookedStatus: string | null;
  /** The resolved booking's id + waiver state — null when no booking was
   *  resolved. Powers the post-payment "sign the waiver" card. */
  bookingId: string | null;
  bookingWaiverSigned: boolean | null;
  /** Whether the resolved booking's PARTICIPANT is already covered by the
   *  org's annual liability waiver. Only computed for an unsigned booking
   *  (null otherwise) and only ever true for a booking that carries a
   *  `family_member_id` — an adult drop-in has no person row to check.
   *  Server-computed by the same predicate the waiver POST short-circuits on,
   *  so the card and the endpoint can't disagree about who still has to sign.
   *  Absent/undefined from an older response body reads as NOT covered — the
   *  skip must fail toward asking. */
  bookingWaiverOnFile?: boolean | null;
  host: { firstName: string; photoUrl: string | null; bio: string | null } | null;
}

interface SessionDetailProps {
  sessionId: string;
  isAuthenticated: boolean;
  bannerKind: "success" | "cancelled" | null;
  /** Stripe checkout session id from a legacy hosted-Checkout success
   *  redirect; lets the detail API resolve the booking for guests who
   *  returned anonymous. */
  checkoutSessionId?: string | null;
  /** PaymentIntent id from an inline-payment success (appended by the
   *  client on success or by Stripe on a 3DS return) — same guest
   *  booking-resolution role as checkoutSessionId, for the embedded flow. */
  paymentIntentId?: string | null;
  /** Server-threaded STRIPE_PUBLISHABLE_KEY for the inline payment form. */
  stripePublishableKey: string;
}

/**
 * Post-payment waiver capture — "sign before you PLAY, not before you pay".
 * Shown on the session page whenever the visitor's resolved booking hasn't
 * signed yet (fresh booking-confirmed surface, a return visit, the email's
 * sign-the-waiver link, or the dashboard's Sign waiver CTA). SOFT block:
 * nothing anywhere refuses a booking or check-in over an unsigned waiver.
 */
function WaiverCard({
  bookingId,
  paymentIntentId,
  onSigned,
}: {
  bookingId: string;
  /** Guest capability token — lets a buyer with no login session sign. */
  paymentIntentId: string | null;
  onSigned: () => void;
}) {
  const [accepted, setAccepted] = useState(false);
  const [name, setName] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const submit = async () => {
    setSubmitting(true);
    try {
      const res = await fetch(`/api/dropin/bookings/${bookingId}/waiver`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          waiverName: name.trim(),
          ...(paymentIntentId ? { paymentIntentId } : {}),
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(
          typeof json.error === "string" ? json.error : "Could not save waiver",
        );
        return;
      }
      onSigned();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Network error");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="rounded-xl border border-amber-200 bg-amber-50/60 p-5 space-y-4">
      <div>
        <h2 className="font-semibold text-ink">
          One more step before you play: sign the waiver
        </h2>
        <p className="mt-1 text-sm text-ink-2">
          Takes ten seconds — do it now and you're straight onto the field at
          check-in.
        </p>
      </div>

      <p className="text-sm text-ink-2 leading-relaxed">{DROPIN_WAIVER_TEXT}</p>

      <div className="flex items-start gap-3">
        <Checkbox
          id="waiver-accept"
          checked={accepted}
          onCheckedChange={(checked) => setAccepted(checked === true)}
        />
        <Label
          htmlFor="waiver-accept"
          className="text-sm leading-snug cursor-pointer"
        >
          {DROPIN_WAIVER_ACCEPT_LABEL}
        </Label>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="waiver-name" className="text-sm">
          Full name (typed signature)
        </Label>
        <Input
          id="waiver-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Your full name"
        />
      </div>

      <Button
        onClick={() => void submit()}
        disabled={!accepted || name.trim().length === 0 || submitting}
        className="w-full sm:w-auto"
      >
        {submitting ? "Saving…" : "Sign waiver"}
      </Button>
    </div>
  );
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export default function SessionDetail({
  sessionId,
  isAuthenticated,
  bannerKind,
  checkoutSessionId,
  paymentIntentId,
  stripePublishableKey,
}: SessionDetailProps) {
  useHydrationBeacon();

  const brand = useBrandId();
  const allSessionsHref = brand === "soccerone" ? "/pickup" : "/dropin";

  const [data, setData] = useState<DetailResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pollExhausted, setPollExhausted] = useState(false);
  // Auto-advance: after a fresh, confirmed booking, signed-in users glide to
  // their dashboard on a short countdown (with opt-out). Guests are never
  // auto-advanced — the dashboard is auth-gated, so it'd dump them on /signin.
  const [redirectIn, setRedirectIn] = useState<number | null>(null);
  const [stayHere, setStayHere] = useState(false);
  // Waiver just captured on this page view — flips the card to its signed
  // confirmation state without refetching.
  const [waiverJustSigned, setWaiverJustSigned] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let pollTimer: ReturnType<typeof setTimeout> | undefined;
    const POLL_INTERVAL_MS = 1500;
    const pollDeadline = Date.now() + 20_000;

    // Guest booking resolution: the inline flow carries the PaymentIntent
    // id, the legacy hosted flow the checkout session id. Either lets the
    // detail API find the booking for a buyer with no login session.
    const detailParams = new URLSearchParams();
    if (paymentIntentId) detailParams.set("payment_intent", paymentIntentId);
    else if (checkoutSessionId)
      detailParams.set("checkout_session_id", checkoutSessionId);
    const qs = detailParams.toString();
    const detailUrl = `/api/dropin/sessions/${sessionId}${qs ? `?${qs}` : ""}`;

    const load = async (isPoll: boolean) => {
      try {
        const res = await fetch(detailUrl);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = (await res.json()) as DetailResponse;
        if (cancelled) return;
        setData(json);
        setLoading(false);

        // A paid checkout redirects here, but the booking row is created
        // asynchronously by the Stripe webhook. If we arrived first, poll
        // until it lands (or give up and let the user refresh).
        if (bannerKind === "success" && json.alreadyBookedStatus === null) {
          if (Date.now() < pollDeadline) {
            pollTimer = setTimeout(() => void load(true), POLL_INTERVAL_MS);
          } else {
            setPollExhausted(true);
          }
        }
      } catch (err) {
        if (cancelled) return;
        // A failed poll is non-fatal — keep the last good data on screen.
        if (!isPoll) {
          setError(err instanceof Error ? err.message : "Failed to load");
          setLoading(false);
        }
      }
    };

    void load(false);
    return () => {
      cancelled = true;
      if (pollTimer) clearTimeout(pollTimer);
    };
  }, [sessionId, bannerKind, checkoutSessionId, paymentIntentId]);

  // Auto-advance to the dashboard for a signed-in user who just confirmed a
  // booking (fresh ?booking=success). Guests are excluded — their dashboard is
  // auth-gated. Opt out via "Stay here". 5s gives a beat to see the receipt.
  const AUTO_ADVANCE_SECONDS = 5;
  useEffect(() => {
    if (!data || stayHere || bannerKind !== "success" || !isAuthenticated) {
      return;
    }
    // Never glide away from an unsigned waiver — the sign-the-waiver card is
    // the whole point of this surface now. (Signing it here doesn't restart
    // the countdown; the player already chose to engage with this page.)
    // A booking whose participant is already covered by the annual waiver has
    // NO card to hold them for, so it must not hold the countdown either —
    // otherwise the skip would trade one friction (a redundant signature) for
    // another (a dead-ended success page).
    if (data.bookingWaiverSigned === false && data.bookingWaiverOnFile !== true)
      return;
    const phase = deriveDropInSuccessPhase({
      bannerKind,
      bookingStatus: data.alreadyBookedStatus,
      pollExhausted,
    });
    if (phase !== "confirmed") return;

    setRedirectIn(AUTO_ADVANCE_SECONDS);
    const tick = setInterval(() => {
      setRedirectIn((n) => (n !== null && n > 0 ? n - 1 : 0));
    }, 1000);
    const go = setTimeout(() => {
      window.location.href = "/dashboard/bookings";
    }, AUTO_ADVANCE_SECONDS * 1000);
    return () => {
      clearInterval(tick);
      clearTimeout(go);
    };
  }, [data, bannerKind, pollExhausted, isAuthenticated, stayHere]);

  if (loading) return <LoadingSkeleton />;
  if (error) return <ErrorBanner message={error} />;
  if (!data) return null;

  const { session } = data;
  const isFull = data.confirmedCount >= session.capacity;
  const fillPct = Math.min(
    100,
    Math.round((data.confirmedCount / Math.max(1, session.capacity)) * 100),
  );
  const successPhase = deriveDropInSuccessPhase({
    bannerKind,
    bookingStatus: data.alreadyBookedStatus,
    pollExhausted,
  });
  const finalizing =
    successPhase === "finalizing" || successPhase === "finalizing-timed-out";

  // ANNUAL WAIVER: the participant already signed within the window, so this
  // booking's own `waiverSigned: false` is just an unstamped new row — the
  // sign endpoint would short-circuit `alreadySigned` if we asked. Only
  // strict `true` counts; undefined (older response shape) and false both
  // mean ASK, because a missing answer must never suppress a real ask.
  const waiverCovered = data.bookingWaiverOnFile === true;

  // Post-payment waiver capture: shown for any resolved, confirmed booking
  // that hasn't signed yet AND isn't already covered — fresh success surface,
  // a return visit, or the email backstop link (which carries
  // ?payment_intent for guests).
  const waiverPending =
    data.bookingId !== null &&
    data.bookingWaiverSigned === false &&
    !waiverCovered &&
    data.alreadyBookedStatus === "confirmed";

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      {successPhase === "confirmed" && (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-emerald-900">
          <p className="font-medium">Booking confirmed.</p>
          {redirectIn !== null && !stayHere ? (
            <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
              <span>Taking you to your dashboard in {redirectIn}s…</span>
              <a href="/dashboard/bookings" className="font-medium underline">
                View now
              </a>
              <button
                type="button"
                onClick={() => setStayHere(true)}
                className="underline"
              >
                Stay here
              </button>
            </p>
          ) : (
            <p className="mt-1 text-sm">
              {isAuthenticated
                ? "See it in your dashboard."
                : "Sign in anytime to manage your booking."}
            </p>
          )}
        </div>
      )}
      {finalizing && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-amber-900">
          {successPhase === "finalizing"
            ? "Payment received — finalizing your booking…"
            : "Payment received. Your booking is taking a moment to finalize — refresh shortly to see it."}
        </div>
      )}
      {bannerKind === "cancelled" && (
        <div className="rounded-lg border border-cream-3 bg-cream-2 px-4 py-3 text-ink-2">
          Checkout was cancelled. Your spot was not reserved.
        </div>
      )}

      {waiverCovered &&
        data.bookingWaiverSigned === false &&
        data.alreadyBookedStatus === "confirmed" && (
          <div
            className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-emerald-900"
            data-waiver-on-file
          >
            <p className="font-medium">Waiver on file ✓ — nothing to sign.</p>
            <p className="mt-1 text-sm">
              Your annual waiver covers this session. See you out there.
            </p>
          </div>
        )}
      {waiverPending && !waiverJustSigned && (
        <WaiverCard
          bookingId={data.bookingId!}
          paymentIntentId={paymentIntentId ?? null}
          onSigned={() => setWaiverJustSigned(true)}
        />
      )}
      {waiverPending && waiverJustSigned && (
        <div
          className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-emerald-900"
          data-waiver-signed
        >
          <p className="font-medium">Waiver signed ✓ — see you out there.</p>
        </div>
      )}

      <header>
        <a
          href={allSessionsHref}
          className="text-xs uppercase tracking-wider text-ink-faint hover:text-ink"
        >
          ← All sessions
        </a>
        <h1 className="mt-2 text-3xl font-bold text-ink">
          {session.sportOrClassLabel}
          {session.formatLabel && (
            <span className="text-ink-muted font-normal">
              {" "}
              · {session.formatLabel}
            </span>
          )}
        </h1>
        <p className="mt-1 text-ink-muted">{fmtDate(session.startsAt)}</p>
        {data.venueName && (
          <p className="mt-0.5 text-ink-faint">{data.venueName}</p>
        )}
      </header>

      <div className="flex flex-wrap gap-2">
        <Badge variant="outline">{session.kind}</Badge>
        <Badge variant="secondary">{session.skillLevel.replace("_", " ")}</Badge>
        <Badge variant="secondary">{session.audience.replace("_", " ")}</Badge>
        {session.membersOnly && (
          <Badge className="bg-amber-100 text-amber-900 border-amber-200">
            Members only
          </Badge>
        )}
      </div>

      {data.host && (
        <div className="flex items-center gap-3 rounded-lg border border-cream-3 p-3">
          {data.host.photoUrl && (
            <img
              src={data.host.photoUrl}
              alt={`${data.host.firstName}, your host`}
              className="h-12 w-12 rounded-full object-cover"
            />
          )}
          <div>
            <p className="font-medium text-ink">Hosted by {data.host.firstName} 👋</p>
            {data.host.bio && (
              <p className="text-sm text-ink-muted">{data.host.bio}</p>
            )}
          </div>
        </div>
      )}

      <div className="rounded-xl border border-cream-3 bg-paper p-5 space-y-4">
        <div>
          <div className="flex items-center justify-between text-sm text-ink-2">
            <span>
              {data.confirmedCount} / {session.capacity} taken
            </span>
            <span>
              {data.waitlistCount > 0 ? `${data.waitlistCount} on waitlist` : ""}
            </span>
          </div>
          <div className="mt-1 h-2 w-full rounded bg-cream-3 overflow-hidden">
            <div
              className={`h-full ${isFull ? "bg-amber-500" : "bg-emerald-500"}`}
              style={{ width: `${fillPct}%` }}
            />
          </div>
        </div>

        {(session.capacityMale != null || session.capacityFemale != null) && (
          <p className="text-xs text-ink-faint">
            Per-gender caps in place to keep teams balanced.
          </p>
        )}

        {finalizing ? (
          <Button disabled size="lg" className="w-full">
            Finalizing your booking…
          </Button>
        ) : (
          <BookButton
            sessionId={sessionId}
            resolvedAmountCents={data.resolvedAmountCents}
            isFull={isFull}
            alreadyBookedStatus={data.alreadyBookedStatus}
            isAuthenticated={isAuthenticated}
            stripePublishableKey={stripePublishableKey}
            sportOrClassLabel={session.sportOrClassLabel}
            formatLabel={session.formatLabel}
            venueName={data.venueName}
          />
        )}

        {data.resolvedPaymentMethod === "member_unlimited" && (
          <p className="text-xs text-emerald-700 text-center">
            Free for you (unlimited member benefit).
          </p>
        )}
        {data.resolvedPaymentMethod === "member_allotment" && (
          <p className="text-xs text-emerald-700 text-center">
            Free for you (member allotment).
          </p>
        )}
      </div>

      {data.rateCard && (
        <div className="rounded-xl border border-cream-3 bg-cream-2 p-5 text-sm text-ink-2">
          <h3 className="font-semibold text-ink mb-2">Cancellation policy</h3>
          <p>
            Cancel at least <strong>{data.rateCard.cancelWindowHours} hours</strong>{" "}
            before the session for a full refund. Inside that window, the booking
            is non-refundable.
          </p>
          {data.waitlistCount > 0 && (
            <p className="mt-2">
              When a spot opens, the next waitlister has{" "}
              <strong>{data.rateCard.promotionWindowMinutes} minutes</strong> to
              claim it before it rolls forward.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
