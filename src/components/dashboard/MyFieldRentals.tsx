"use client";

import { useEffect, useRef, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ErrorBanner } from "@/components/ui/error-banner";
import { EmptyState } from "@/components/ui/empty-state";
import { LoadingSkeleton } from "@/components/ui/loading-skeleton";
import { toast } from "sonner";
import { useHydrationBeacon } from "@/lib/hooks/use-hydration-beacon";

interface FieldRental {
  id: string;
  venueId: string;
  fieldNumber: number;
  startsAt: string;
  endsAt: string;
  status: "confirmed" | "pending_payment" | "cancelled" | "no_show" | "completed";
  paymentStatus: string;
  amountDueCents: number;
  amountPaidCents: number;
  partySize: number;
  purpose: string | null;
  checkedInAt: string | null;
  paymentExpiresAt: string | null;
  venueName: string;
}

/**
 * Live countdown badge for a pending-payment hold. Re-renders every second
 * via a tick state. When the deadline passes it shows "Expired" and fires
 * onExpire once so the parent can reload (the server-side cron flips the
 * row to `cancelled` independently).
 */
function HoldCountdown({
  expiresAt,
  onExpire,
}: {
  expiresAt: string;
  onExpire: () => void;
}) {
  const [now, setNow] = useState(() => Date.now());
  const firedExpireRef = useRef(false);
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);
  const deadline = new Date(expiresAt).getTime();
  const remainingMs = deadline - now;
  if (remainingMs <= 0) {
    if (!firedExpireRef.current) {
      firedExpireRef.current = true;
      window.setTimeout(onExpire, 0);
    }
    return (
      <Badge variant="outline" className="bg-stone-100 text-stone-500 border-stone-200">
        Hold expired
      </Badge>
    );
  }
  const totalSeconds = Math.floor(remainingMs / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  const display = `${minutes}:${seconds.toString().padStart(2, "0")}`;
  const urgent = remainingMs < 2 * 60 * 1000;
  return (
    <Badge
      variant="outline"
      className={
        urgent
          ? "bg-rose-100 text-rose-900 border-rose-300"
          : "bg-amber-50 text-amber-900 border-amber-200"
      }
    >
      Pay within {display}
    </Badge>
  );
}

function fmtDateTimeRange(startsAt: string, endsAt: string): string {
  const start = new Date(startsAt);
  const end = new Date(endsAt);
  const datePart = start.toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
  const startTime = start.toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });
  const endTime = end.toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });
  return `${datePart} · ${startTime} – ${endTime}`;
}

function statusColor(status: FieldRental["status"]): string {
  switch (status) {
    case "confirmed":
      return "bg-emerald-100 text-emerald-900 border-emerald-200";
    case "pending_payment":
      return "bg-amber-100 text-amber-900 border-amber-200";
    case "cancelled":
      return "bg-stone-50 text-stone-500 border-stone-200";
    case "no_show":
      return "bg-rose-100 text-rose-900 border-rose-200";
    case "completed":
      return "bg-slate-100 text-slate-700 border-slate-200";
  }
}

function statusLabel(status: FieldRental["status"]): string {
  switch (status) {
    case "confirmed":
      return "Confirmed";
    case "pending_payment":
      return "Pending payment";
    case "cancelled":
      return "Cancelled";
    case "no_show":
      return "No show";
    case "completed":
      return "Completed";
  }
}

/** Returns true when startsAt is within ±2 hours of now (loose UI hint). */
function isNearStart(startsAt: string): boolean {
  const diff = Math.abs(new Date(startsAt).getTime() - Date.now());
  return diff <= 2 * 60 * 60 * 1000;
}

export default function MyFieldRentals() {
  useHydrationBeacon();

  const [rentals, setRentals] = useState<FieldRental[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [successBanner, setSuccessBanner] = useState(false);
  const [checkingIn, setCheckingIn] = useState<Set<string>>(new Set());

  const reload = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/rentals/bookings");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      setRentals(json.rentals ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("rental") === "success") {
      setSuccessBanner(true);
      params.delete("rental");
      const newSearch = params.toString();
      window.history.replaceState(
        null,
        "",
        newSearch ? `?${newSearch}` : window.location.pathname,
      );
    }
    void reload();
  }, []);

  const cancel = async (rentalId: string) => {
    if (!window.confirm("Cancel this rental?")) return;
    const res = await fetch(`/api/rentals/bookings/${rentalId}/cancel`, {
      method: "POST",
    });
    const json = await res.json();
    if (!res.ok) {
      toast.error(json.error ?? "Cancel failed");
      return;
    }
    toast.success("Rental cancelled");
    await reload();
  };

  const handleCheckIn = async (rentalId: string) => {
    setCheckingIn((prev) => new Set(prev).add(rentalId));
    try {
      const res = await fetch("/api/dashboard/check-in", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind: "field_rental", targetId: rentalId }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error ?? "Check-in failed");
        return;
      }
      toast.success("Checked in");
      await reload();
    } finally {
      setCheckingIn((prev) => {
        const next = new Set(prev);
        next.delete(rentalId);
        return next;
      });
    }
  };

  const now = Date.now();
  const upcoming = rentals.filter(
    (r) => r.status !== "cancelled" && new Date(r.startsAt).getTime() > now,
  );
  const pastOrCancelled = rentals.filter(
    (r) => r.status === "cancelled" || new Date(r.startsAt).getTime() <= now,
  );

  const canCancel = (r: FieldRental) =>
    r.status !== "cancelled" && new Date(r.startsAt).getTime() > now;

  if (loading) return <LoadingSkeleton />;
  if (error) return <ErrorBanner message={error} />;

  return (
    <div className="space-y-6">
      <header>
        <h2 className="text-xl font-semibold text-stone-900">Field rentals</h2>
        <p className="text-sm text-stone-600 mt-1">
          Fields you have reserved for private use.
        </p>
      </header>

      {successBanner && (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 flex items-center justify-between text-sm text-emerald-900">
          <span>Rental booked successfully</span>
          <button
            type="button"
            onClick={() => setSuccessBanner(false)}
            className="ml-4 text-emerald-700 hover:text-emerald-900 font-medium"
          >
            Dismiss
          </button>
        </div>
      )}

      {rentals.length === 0 ? (
        <EmptyState
          title="No field rentals yet"
          description="Book a field from the Rentals page."
        />
      ) : (
        <>
          <section>
            <h3 className="text-sm font-semibold uppercase tracking-wider text-stone-500 mb-3">
              Upcoming
            </h3>
            {upcoming.length === 0 ? (
              <p className="text-sm text-stone-500">No upcoming rentals.</p>
            ) : (
              <ul className="space-y-3">
                {upcoming.map((r) => (
                  <li
                    key={r.id}
                    className="rounded-lg border border-stone-200 bg-white p-4 flex items-start justify-between gap-3"
                  >
                    <div className="min-w-0">
                      <div className="font-medium text-stone-900">
                        {r.venueName}
                        <span className="text-stone-500 font-normal">
                          {" "}
                          · Field {r.fieldNumber}
                        </span>
                      </div>
                      <div className="text-sm text-stone-600">
                        {fmtDateTimeRange(r.startsAt, r.endsAt)}
                      </div>
                      <div className="mt-2 flex items-center gap-2 flex-wrap">
                        <Badge variant="outline" className={statusColor(r.status)}>
                          {statusLabel(r.status)}
                        </Badge>
                        {r.status === "pending_payment" && r.paymentExpiresAt && (
                          <HoldCountdown
                            expiresAt={r.paymentExpiresAt}
                            onExpire={() => void reload()}
                          />
                        )}
                        <span className="text-xs text-stone-500">
                          {r.partySize} {r.partySize === 1 ? "person" : "people"}
                        </span>
                        {r.paymentStatus && (
                          <span className="text-xs text-stone-400">
                            · payment: {r.paymentStatus.replace(/_/g, " ")}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-2 shrink-0">
                      {r.checkedInAt ? (
                        <Badge
                          variant="outline"
                          className="bg-emerald-50 text-emerald-800 border-emerald-200"
                        >
                          Here
                        </Badge>
                      ) : isNearStart(r.startsAt) ? (
                        <Button
                          size="sm"
                          disabled={checkingIn.has(r.id)}
                          onClick={() => handleCheckIn(r.id)}
                        >
                          {checkingIn.has(r.id) ? "Checking in..." : "Check me in"}
                        </Button>
                      ) : null}
                      {canCancel(r) && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => cancel(r.id)}
                        >
                          Cancel
                        </Button>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {pastOrCancelled.length > 0 && (
            <section>
              <h3 className="text-sm font-semibold uppercase tracking-wider text-stone-500 mb-3">
                Past / Cancelled
              </h3>
              <ul className="space-y-2">
                {pastOrCancelled.map((r) => (
                  <li
                    key={r.id}
                    className="rounded-lg border border-stone-100 bg-stone-50 p-3 text-sm flex items-center justify-between"
                  >
                    <div>
                      <span className="font-medium text-stone-700">
                        {r.venueName} · Field {r.fieldNumber}
                      </span>
                      <span className="text-stone-500 ml-2">
                        {fmtDateTimeRange(r.startsAt, r.endsAt)}
                      </span>
                    </div>
                    <Badge variant="outline" className={statusColor(r.status)}>
                      {statusLabel(r.status)}
                    </Badge>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}
    </div>
  );
}
