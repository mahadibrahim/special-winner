// src/components/dashboard/MyBookings.tsx
"use client";

import { useEffect, useState, type ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ErrorBanner } from "@/components/ui/error-banner";
import { EmptyState } from "@/components/ui/empty-state";
import { LoadingSkeleton } from "@/components/ui/loading-skeleton";
import { toast } from "sonner";
import { useHydrationBeacon } from "@/lib/hooks/use-hydration-beacon";
import { DashboardCard } from "@/components/dashboard/shell/DashboardCard";
import { HoldCountdown } from "@/components/dashboard/shell/HoldCountdown";
import { directionsUrl } from "@/lib/dashboard/maps";
import { useBrandId } from "@/lib/hooks/use-brand-id";
import {
  normalizeBookings,
  type BookingItem,
  type DropInBookingRow,
  type FieldRentalRow,
} from "@/lib/dashboard/normalize-bookings";

const SUB_HEADER_CLS =
  "text-[11px] font-semibold tracking-[0.15em] uppercase text-ink-muted mb-2";

function fmtDateTime(iso: string, timeZone: string): string {
  return new Date(iso).toLocaleString("en-US", {
    timeZone,
    weekday: "short", month: "short", day: "numeric",
    hour: "numeric", minute: "2-digit",
  });
}
function isNearStart(iso: string): boolean {
  return Math.abs(new Date(iso).getTime() - Date.now()) <= 2 * 60 * 60 * 1000;
}

export default function MyBookings({ timeZone = "America/New_York" }: { timeZone?: string }) {
  useHydrationBeacon();
  const brand = useBrandId();

  const [dropins, setDropins] = useState<DropInBookingRow[]>([]);
  const [rentals, setRentals] = useState<FieldRentalRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [bothFailed, setBothFailed] = useState(false);
  const [dropinFailed, setDropinFailed] = useState(false);
  const [rentalFailed, setRentalFailed] = useState(false);
  const [checkingIn, setCheckingIn] = useState<Set<string>>(new Set());
  const [successBanner, setSuccessBanner] = useState(false);

  const reload = async () => {
    setLoading(true);
    const [d, r] = await Promise.allSettled([
      fetch("/api/dropin/bookings").then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      }),
      fetch("/api/rentals/bookings").then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      }),
    ]);
    const dOk = d.status === "fulfilled";
    const rOk = r.status === "fulfilled";
    setDropins(dOk ? (d.value.bookings ?? []) : []);
    setRentals(rOk ? (r.value.rentals ?? []) : []);
    setDropinFailed(!dOk);
    setRentalFailed(!rOk);
    setBothFailed(!dOk && !rOk);
    setLoading(false);
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

  const cancelDropin = async (id: string) => {
    if (!window.confirm("Cancel this booking?")) return;
    const res = await fetch(`/api/dropin/bookings/${id}/cancel`, { method: "POST" });
    const json = await res.json();
    if (!res.ok) return void toast.error(json.error ?? "Cancel failed");
    toast.success(json.refunded ? "Cancelled — refund issued" : "Cancelled (inside window — no refund)");
    await reload();
  };
  const cancelRental = async (id: string) => {
    if (!window.confirm("Cancel this rental?")) return;
    const res = await fetch(`/api/rentals/bookings/${id}/cancel`, { method: "POST" });
    const json = await res.json();
    if (!res.ok) return void toast.error(json.error ?? "Cancel failed");
    toast.success("Rental cancelled");
    await reload();
  };
  const checkIn = async (kind: "drop_in_booking" | "field_rental", id: string) => {
    setCheckingIn((p) => new Set(p).add(id));
    try {
      const res = await fetch("/api/dashboard/check-in", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind, targetId: id }),
      });
      const data = await res.json();
      if (!res.ok) return void toast.error(data.error ?? "Check-in failed");
      toast.success("Checked in");
      await reload();
    } finally {
      setCheckingIn((p) => { const n = new Set(p); n.delete(id); return n; });
    }
  };

  const { upcoming, past } = normalizeBookings(dropins, rentals, Date.now());

  function actionFor(item: BookingItem): ReactNode {
    const checkedIn =
      item.dropin?.checkedInAt != null || item.rental?.checkedInAt != null;
    const near = isNearStart(item.startsAt);
    const checkInKind = item.kind === "dropin" ? "drop_in_booking" : "field_rental";
    return (
      <div className="flex flex-col items-end gap-1.5">
        {item.kind === "dropin" && (
          <Button asChild variant="outline" size="sm">
            <a href={`/dropin/${item.dropin!.sessionId}`}>Details</a>
          </Button>
        )}
        {checkedIn ? (
          <Badge variant="outline" className="bg-emerald-500/10 text-emerald-700 border-emerald-500/20">
            Here
          </Badge>
        ) : near ? (
          <Button size="sm" disabled={checkingIn.has(item.id)} onClick={() => checkIn(checkInKind, item.id)}>
            {checkingIn.has(item.id) ? "Checking in..." : "Check me in"}
          </Button>
        ) : null}
        {item.kind === "dropin" && item.dropin!.status === "confirmed" && (
          <Button variant="outline" size="sm" onClick={() => cancelDropin(item.id)}>Cancel</Button>
        )}
        {item.kind === "dropin" && item.dropin!.status === "waitlisted" && (
          <Button variant="outline" size="sm" onClick={() => cancelDropin(item.id)}>Leave waitlist</Button>
        )}
        {item.kind === "rental" && item.rental!.status !== "cancelled" && (
          <Button variant="outline" size="sm" onClick={() => cancelRental(item.id)}>Cancel</Button>
        )}
      </div>
    );
  }

  function bodyFor(item: BookingItem): ReactNode {
    if (item.kind === "dropin" && item.dropin!.teamAssignment) {
      return <div className="mt-1"><Badge variant="secondary">Team {item.dropin!.teamAssignment}</Badge></div>;
    }
    if (item.kind === "rental") {
      const r = item.rental!;
      return (
        <div className="flex items-center gap-2 flex-wrap mt-1">
          {r.status === "pending_payment" && r.paymentExpiresAt && (
            <HoldCountdown expiresAt={r.paymentExpiresAt} onExpire={() => void reload()} />
          )}
          <span className="text-[11px] text-ink-2">
            {r.partySize} {r.partySize === 1 ? "person" : "people"}
          </span>
        </div>
      );
    }
    return null;
  }

  if (loading) return <LoadingSkeleton />;
  if (bothFailed) return <ErrorBanner message="Couldn't load your bookings. Refresh to retry." />;

  const browseHref = brand === "soccerone" ? "/pickup" : "/dropin";
  const rentHref = brand === "soccerone" ? "/rent" : "/rentals";

  if (upcoming.length === 0 && past.length === 0) {
    return (
      <div className="space-y-4">
        <h2 className="font-display text-2xl text-ink">My Bookings</h2>
        <EmptyState title="No bookings yet" description="Book a pickup session or a field to get started.">
          <div className="flex flex-wrap gap-2">
            <Button asChild><a href={browseHref}>Browse pickup</a></Button>
            <Button asChild variant="outline"><a href={rentHref}>Book a field</a></Button>
          </div>
        </EmptyState>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="font-display text-2xl text-ink leading-tight">My Bookings</h2>
        {upcoming.length > 0 && (
          <p className="text-sm text-ink-2 mt-0.5">{upcoming.length} upcoming</p>
        )}
      </div>

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

      {(dropinFailed || rentalFailed) && (
        <p className="text-[11px] text-ink-muted">
          Couldn&apos;t load {dropinFailed ? "drop-in bookings" : "field rentals"} — refresh to retry.
        </p>
      )}

      {upcoming.length > 0 && (
        <section className="space-y-2">
          {past.length > 0 && <p className={SUB_HEADER_CLS}>Upcoming</p>}
          {upcoming.map((item, i) => (
            <DashboardCard
              key={`${item.kind}-${item.id}`}
              type={item.cardType}
              hero={i === 0}
              title={item.title}
              meta={fmtDateTime(item.startsAt, timeZone)}
              venue={item.venueName ? { label: item.venueName, mapsUrl: directionsUrl({ name: item.venueName }) } : undefined}
              status={item.status}
              action={actionFor(item)}
            >
              {bodyFor(item)}
            </DashboardCard>
          ))}
        </section>
      )}

      {past.length > 0 && (
        <section className="space-y-2">
          <p className={SUB_HEADER_CLS}>Past</p>
          {past.map((item) => (
            <DashboardCard
              key={`${item.kind}-${item.id}`}
              type={item.cardType}
              title={item.title}
              meta={fmtDateTime(item.startsAt, timeZone)}
              status={item.status}
            />
          ))}
        </section>
      )}
    </div>
  );
}
