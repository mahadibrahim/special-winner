"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { ErrorBanner } from "@/components/ui/error-banner";
import { EmptyState } from "@/components/ui/empty-state";
import { LoadingSkeleton } from "@/components/ui/loading-skeleton";
import { useHydrationBeacon } from "@/lib/hooks/use-hydration-beacon";
import type { ShiftVenueOption } from "@/lib/time-tracking/shift-form-data";

interface OpenShift {
  id: string;
  venueId: string;
  venueName: string;
  clockInAt: string;
  flaggedOutOfRange: boolean;
  flagReason: string | null;
}

interface ConsentStatus {
  acknowledged: boolean;
  noticeTitle: string;
  noticeBody: string;
}

const selectClass =
  "w-full px-3 py-2.5 bg-paper border border-ink/15 rounded-lg text-ink focus:outline-none focus:border-primary-orange transition-colors";

const buttonClass =
  "w-full py-3 rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed";

/**
 * Best-effort Geolocation read. Never throws — resolves to null coords on
 * permission denial / timeout / unavailability, so the caller can still
 * POST (with no lat/lng) and let the server's 422 {error, reason} carry
 * the authoritative, user-facing block message. enableHighAccuracy/timeout
 * match the existing precedent in src/components/media/job-detail.tsx.
 */
function getCurrentPositionSafe(): Promise<GeolocationPosition | null> {
  return new Promise((resolve) => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      resolve(null);
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve(pos),
      () => resolve(null),
      { enableHighAccuracy: true, timeout: 10000 },
    );
  });
}

export function ShiftClock({ venues }: { venues: ShiftVenueOption[] }) {
  useHydrationBeacon();

  const [loading, setLoading] = useState(true);
  const [consent, setConsent] = useState<ConsentStatus | null>(null);
  const [ackSubmitting, setAckSubmitting] = useState(false);
  const [openShift, setOpenShift] = useState<OpenShift | null>(null);
  const [venueId, setVenueId] = useState<string>(venues[0]?.id ?? "");
  const [submitting, setSubmitting] = useState(false);
  const [blockError, setBlockError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [consentRes, currentRes] = await Promise.all([
      fetch("/api/staff/location-consent"),
      fetch("/api/staff/shifts/current"),
    ]);
    if (consentRes.ok) {
      const body = await consentRes.json();
      setConsent({
        acknowledged: body.acknowledged,
        noticeTitle: body.noticeTitle,
        noticeBody: body.noticeBody,
      });
    }
    if (currentRes.ok) {
      const body = await currentRes.json();
      setOpenShift(body.timeEntry);
      if (body.timeEntry?.venueId) setVenueId(body.timeEntry.venueId);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const acknowledgeConsent = async () => {
    setAckSubmitting(true);
    try {
      const res = await fetch("/api/staff/location-consent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ acknowledged: true }),
      });
      if (!res.ok) {
        toast.error("Couldn't record your acknowledgement — try again.");
        return;
      }
      setConsent((prev) => (prev ? { ...prev, acknowledged: true } : prev));
    } finally {
      setAckSubmitting(false);
    }
  };

  const clockIn = async () => {
    if (!venueId) return;
    setBlockError(null);
    setSubmitting(true);
    try {
      const pos = await getCurrentPositionSafe();
      const res = await fetch("/api/staff/shifts/clock-in", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          venueId,
          ...(pos
            ? {
                lat: pos.coords.latitude,
                lng: pos.coords.longitude,
                accuracy: pos.coords.accuracy,
              }
            : {}),
        }),
      });
      const body = await res.json();
      if (res.status === 422 || res.status === 409) {
        // Location blocked (missing/imprecise/out-of-range) or a stale
        // consent gate — a clear, blocking message, never a silent
        // flagged success.
        setBlockError(body.error ?? "Unable to clock in.");
        if (body.reason === "consent_required") {
          setConsent((prev) => (prev ? { ...prev, acknowledged: false } : prev));
        }
        return;
      }
      if (!res.ok) {
        toast.error(body.error ?? "Couldn't clock in — try again.");
        return;
      }
      setOpenShift({
        id: body.timeEntry.id,
        venueId: body.timeEntry.venueId,
        venueName: venues.find((v) => v.id === body.timeEntry.venueId)?.name ?? "",
        clockInAt: body.timeEntry.clockInAt,
        flaggedOutOfRange: body.timeEntry.flaggedOutOfRange,
        flagReason: body.timeEntry.flagReason,
      });
      if (body.timeEntry.flaggedOutOfRange) {
        toast(
          "Clocked in, but your location was flagged for review (outside the venue's expected radius).",
        );
      } else {
        toast.success("Clocked in.");
      }
    } finally {
      setSubmitting(false);
    }
  };

  const clockOut = async () => {
    setBlockError(null);
    setSubmitting(true);
    try {
      const pos = await getCurrentPositionSafe();
      const res = await fetch("/api/staff/shifts/clock-out", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          pos
            ? { lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: pos.coords.accuracy }
            : {},
        ),
      });
      const body = await res.json();
      if (!res.ok) {
        toast.error(body.error ?? "Couldn't clock out — try again.");
        return;
      }
      setOpenShift(null);
      toast.success("Clocked out.");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return <LoadingSkeleton variant="card" />;
  }

  if (venues.length === 0) {
    return (
      <EmptyState
        title="No venues available"
        description="There are no venues assigned to you yet — contact your venue manager."
      />
    );
  }

  const consentBlocking = consent != null && !consent.acknowledged;

  return (
    <div className="space-y-4">
      {consentBlocking && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center bg-ink/60 p-4"
        >
          <div className="max-w-md w-full bg-paper rounded-xl p-6 space-y-4 shadow-xl">
            <h2 className="font-display text-xl text-ink">{consent.noticeTitle}</h2>
            <p className="text-sm text-ink-2 leading-relaxed">{consent.noticeBody}</p>
            <button
              type="button"
              onClick={acknowledgeConsent}
              disabled={ackSubmitting}
              className={`${buttonClass} bg-primary-bright text-primary-foreground`}
            >
              {ackSubmitting ? (
                <span className="inline-flex items-center gap-2 justify-center">
                  <Loader2 className="size-4 animate-spin" /> Saving…
                </span>
              ) : (
                "I acknowledge and accept"
              )}
            </button>
          </div>
        </div>
      )}

      <ErrorBanner message={blockError} onDismiss={() => setBlockError(null)} />

      {openShift ? (
        <div className="space-y-4 rounded-lg border border-ink/10 p-4">
          <div>
            <p className="text-sm text-ink-2">Clocked in at</p>
            <p className="font-medium text-ink">{openShift.venueName}</p>
            <p className="text-sm text-ink-faint">
              since {new Date(openShift.clockInAt).toLocaleTimeString()}
            </p>
            {openShift.flaggedOutOfRange && (
              <p className="mt-2 text-xs text-amber-700 bg-amber-50 rounded px-2 py-1">
                Flagged for review — your clock-in location was outside the venue's expected
                radius.
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={clockOut}
            disabled={submitting}
            className={`${buttonClass} bg-ink text-paper`}
          >
            {submitting ? (
              <span className="inline-flex items-center gap-2 justify-center">
                <Loader2 className="size-4 animate-spin" /> Clocking out…
              </span>
            ) : (
              "Clock Out"
            )}
          </button>
        </div>
      ) : (
        <div className="space-y-4 rounded-lg border border-ink/10 p-4">
          <div>
            <label htmlFor="venueId" className="block text-sm font-medium text-ink mb-1.5">
              Venue
            </label>
            <select
              id="venueId"
              value={venueId}
              onChange={(e) => setVenueId(e.target.value)}
              className={selectClass}
              disabled={consentBlocking}
            >
              {venues.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.name}
                </option>
              ))}
            </select>
          </div>
          <button
            type="button"
            onClick={clockIn}
            disabled={submitting || consentBlocking || !venueId}
            className={`${buttonClass} bg-primary-bright text-primary-foreground`}
          >
            {submitting ? (
              <span className="inline-flex items-center gap-2 justify-center">
                <Loader2 className="size-4 animate-spin" /> Clocking in…
              </span>
            ) : (
              "Clock In"
            )}
          </button>
        </div>
      )}
    </div>
  );
}
