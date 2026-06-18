"use client";

import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { HoldCountdown } from "@/components/dashboard/shell/HoldCountdown";
import { Button } from "@/components/ui/button";
import { ErrorBanner } from "@/components/ui/error-banner";
import { EmptyState } from "@/components/ui/empty-state";
import { LoadingSkeleton } from "@/components/ui/loading-skeleton";
import { toast } from "sonner";
import { useHydrationBeacon } from "@/lib/hooks/use-hydration-beacon";
import { DashboardCard } from "@/components/dashboard/shell/DashboardCard";
import { directionsUrl } from "@/lib/dashboard/maps";
import type { StatusTone } from "@/lib/dashboard/dashboard-ui";

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

function rentalStatusTone(status: FieldRental["status"]): StatusTone {
  switch (status) {
    case "confirmed":
    case "completed":
      return "confirmed";
    case "pending_payment":
      return "action";
    case "cancelled":
    case "no_show":
      return "pending";
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

const SUB_HEADER_CLS =
  "text-[11px] font-semibold tracking-[0.15em] uppercase text-ink-muted mb-2";

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
    <div className="space-y-4">
      <h3 className={SUB_HEADER_CLS}>Field rentals</h3>

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
          <section className="space-y-2">
            {pastOrCancelled.length > 0 && <p className={SUB_HEADER_CLS}>Upcoming</p>}
            {upcoming.length === 0 ? (
              <p className="text-sm text-ink-2">No upcoming rentals.</p>
            ) : (
              upcoming.map((r) => {
                const actionNode = (
                  <div className="flex flex-col items-end gap-1.5">
                    {r.checkedInAt ? (
                      <Badge
                        variant="outline"
                        className="bg-emerald-500/10 text-emerald-700 border-emerald-500/20"
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
                );

                return (
                  <DashboardCard
                    key={r.id}
                    type="field_rental"
                    title={`Field ${r.fieldNumber}`}
                    meta={fmtDateTimeRange(r.startsAt, r.endsAt)}
                    venue={{
                      label: r.venueName,
                      mapsUrl: directionsUrl({ name: r.venueName }),
                    }}
                    status={{
                      label: statusLabel(r.status),
                      tone: rentalStatusTone(r.status),
                    }}
                    action={actionNode}
                  >
                    <div className="flex items-center gap-2 flex-wrap mt-1">
                      {r.status === "pending_payment" && r.paymentExpiresAt && (
                        <HoldCountdown
                          expiresAt={r.paymentExpiresAt}
                          onExpire={() => void reload()}
                        />
                      )}
                      <span className="text-[11px] text-ink-2">
                        {r.partySize} {r.partySize === 1 ? "person" : "people"}
                      </span>
                      {r.paymentStatus && (
                        <span className="text-[11px] text-ink-muted">
                          · payment: {r.paymentStatus.replace(/_/g, " ")}
                        </span>
                      )}
                    </div>
                  </DashboardCard>
                );
              })
            )}
          </section>

          {pastOrCancelled.length > 0 && (
            <section className="space-y-2">
              <p className={SUB_HEADER_CLS}>Past / Cancelled</p>
              {pastOrCancelled.map((r) => (
                <DashboardCard
                  key={r.id}
                  type="field_rental"
                  title={`${r.venueName} · Field ${r.fieldNumber}`}
                  meta={fmtDateTimeRange(r.startsAt, r.endsAt)}
                  status={{
                    label: statusLabel(r.status),
                    tone: rentalStatusTone(r.status),
                  }}
                />
              ))}
            </section>
          )}
        </>
      )}
    </div>
  );
}
