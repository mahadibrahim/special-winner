"use client";

import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ErrorBanner } from "@/components/ui/error-banner";
import { LoadingSkeleton } from "@/components/ui/loading-skeleton";
import { useHydrationBeacon } from "@/lib/hooks/use-hydration-beacon";
import { deriveDropInSuccessPhase } from "@/lib/dropin/success-phase";
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
}

interface SessionDetailProps {
  sessionId: string;
  isAuthenticated: boolean;
  bannerKind: "success" | "cancelled" | null;
  /** Stripe checkout session id from the success redirect; lets the detail
   *  API resolve the booking for guests who returned anonymous. */
  checkoutSessionId?: string | null;
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
}: SessionDetailProps) {
  useHydrationBeacon();

  const [data, setData] = useState<DetailResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pollExhausted, setPollExhausted] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let pollTimer: ReturnType<typeof setTimeout> | undefined;
    const POLL_INTERVAL_MS = 1500;
    const pollDeadline = Date.now() + 20_000;

    const detailUrl = checkoutSessionId
      ? `/api/dropin/sessions/${sessionId}?checkout_session_id=${encodeURIComponent(checkoutSessionId)}`
      : `/api/dropin/sessions/${sessionId}`;

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
  }, [sessionId, bannerKind, checkoutSessionId]);

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

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      {successPhase === "confirmed" && (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-emerald-900">
          Booking confirmed. See it in your dashboard.
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

      <header>
        <a
          href="/dropin"
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

      <div className="rounded-xl border border-cream-3 bg-paper p-5 space-y-4">
        <div>
          <div className="flex items-center justify-between text-sm text-ink-2">
            <span>
              {data.confirmedCount} / {session.capacity} confirmed
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
