"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ErrorBanner } from "@/components/ui/error-banner";
import type { RefereeCheckInStatus } from "@/lib/referee/referee-queries";

/**
 * Per-match referee check-in/out controls (Task 13,
 * docs/superpowers/plans/2026-07-07-time-tracking.md). Gated to THIS
 * match's assignment via requireAssignedOfficial server-side — the
 * component itself only ever posts to gameId, so there's no client-side
 * gating to get wrong.
 *
 * Same consent + geolocation pattern as
 * src/components/staff/shift-clock.tsx: on permission-deny/timeout the
 * POST still fires with no coords, and a 422 blocked response surfaces the
 * server's authoritative message via ErrorBanner — never a silent
 * flagged success.
 */
export function RefereeCheckIn({
  gameId,
  initialCheckIn,
}: {
  gameId: string;
  initialCheckIn: RefereeCheckInStatus | null;
}) {
  const [checkIn, setCheckIn] = useState<RefereeCheckInStatus | null>(initialCheckIn);
  const [submitting, setSubmitting] = useState(false);
  const [blockError, setBlockError] = useState<string | null>(null);
  const [consentModalOpen, setConsentModalOpen] = useState(false);
  const [ackSubmitting, setAckSubmitting] = useState(false);
  const [notice, setNotice] = useState<{ title: string; body: string } | null>(null);

  const getPosition = (): Promise<GeolocationPosition | null> =>
    new Promise((resolve) => {
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

  const ensureConsentThenAck = async () => {
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
      setConsentModalOpen(false);
      await checkInAction();
    } finally {
      setAckSubmitting(false);
    }
  };

  const checkInAction = async () => {
    setBlockError(null);
    setSubmitting(true);
    try {
      const pos = await getPosition();
      const res = await fetch(`/api/referee/matches/${gameId}/check-in`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          pos
            ? { lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: pos.coords.accuracy }
            : {},
        ),
      });
      const body = await res.json();
      if (res.status === 409 && body.reason === "consent_required") {
        const noticeRes = await fetch("/api/staff/location-consent");
        const noticeBody = noticeRes.ok ? await noticeRes.json() : null;
        setNotice({
          title: noticeBody?.noticeTitle ?? "Location capture is a condition of your assignment",
          body:
            noticeBody?.noticeBody ??
            "Location capture at check-in/out is required to officiate.",
        });
        setConsentModalOpen(true);
        return;
      }
      if (res.status === 422 || !res.ok) {
        setBlockError(body.error ?? "Unable to check in.");
        return;
      }
      setCheckIn({
        id: body.timeEntry.id,
        clockInAt: body.timeEntry.clockInAt,
        clockOutAt: null,
        flaggedOutOfRange: body.timeEntry.flaggedOutOfRange,
      });
      if (body.timeEntry.flaggedOutOfRange) {
        toast("Checked in, but your location was flagged for review.");
      } else {
        toast.success("Checked in.");
      }
    } finally {
      setSubmitting(false);
    }
  };

  const checkOutAction = async () => {
    setBlockError(null);
    setSubmitting(true);
    try {
      const pos = await getPosition();
      const res = await fetch(`/api/referee/matches/${gameId}/check-out`, {
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
        toast.error(body.error ?? "Couldn't check out — try again.");
        return;
      }
      setCheckIn((prev) => (prev ? { ...prev, clockOutAt: body.timeEntry.clockOutAt } : prev));
      toast.success("Checked out.");
    } finally {
      setSubmitting(false);
    }
  };

  const isCheckedIn = checkIn != null && checkIn.clockOutAt == null;
  const isCheckedOut = checkIn != null && checkIn.clockOutAt != null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Match check-in</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {consentModalOpen && notice && (
          <div
            role="dialog"
            aria-modal="true"
            className="fixed inset-0 z-50 flex items-center justify-center bg-ink/60 p-4"
          >
            <div className="max-w-md w-full bg-paper rounded-xl p-6 space-y-4 shadow-xl">
              <h2 className="font-display text-xl text-ink">{notice.title}</h2>
              <p className="text-sm text-ink-2 leading-relaxed">{notice.body}</p>
              <Button onClick={ensureConsentThenAck} disabled={ackSubmitting} className="w-full">
                {ackSubmitting ? (
                  <span className="inline-flex items-center gap-2">
                    <Loader2 className="size-4 animate-spin" /> Saving…
                  </span>
                ) : (
                  "I acknowledge and accept"
                )}
              </Button>
            </div>
          </div>
        )}

        {blockError && <ErrorBanner message={blockError} onDismiss={() => setBlockError(null)} />}

        {isCheckedOut ? (
          <p className="text-sm text-ink-2">
            Checked in at {new Date(checkIn!.clockInAt).toLocaleTimeString()}, checked out at{" "}
            {new Date(checkIn!.clockOutAt!).toLocaleTimeString()}.
          </p>
        ) : isCheckedIn ? (
          <>
            <p className="text-sm text-ink-2">
              Checked in at {new Date(checkIn!.clockInAt).toLocaleTimeString()}
            </p>
            {checkIn!.flaggedOutOfRange && (
              <p className="text-xs text-amber-700 bg-amber-50 rounded px-2 py-1">
                Flagged for review — your check-in location was outside the venue's expected
                radius.
              </p>
            )}
            <Button onClick={checkOutAction} disabled={submitting} className="w-full">
              {submitting ? (
                <span className="inline-flex items-center gap-2">
                  <Loader2 className="size-4 animate-spin" /> Checking out…
                </span>
              ) : (
                "Check Out"
              )}
            </Button>
          </>
        ) : (
          <Button onClick={checkInAction} disabled={submitting} className="w-full">
            {submitting ? (
              <span className="inline-flex items-center gap-2">
                <Loader2 className="size-4 animate-spin" /> Checking in…
              </span>
            ) : (
              "Check In"
            )}
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
