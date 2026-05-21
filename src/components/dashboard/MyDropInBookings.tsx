"use client";

import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ErrorBanner } from "@/components/ui/error-banner";
import { EmptyState } from "@/components/ui/empty-state";
import { LoadingSkeleton } from "@/components/ui/loading-skeleton";
import { toast } from "sonner";
import { useHydrationBeacon } from "@/lib/hooks/use-hydration-beacon";
import { DashboardCard } from "@/components/dashboard/shell/DashboardCard";
import { directionsUrl } from "@/lib/dashboard/maps";
import type { StatusTone } from "@/lib/dashboard/dashboard-ui";
import type { CardType } from "@/lib/dashboard/card-types";

interface Booking {
  id: string;
  sessionId: string;
  status:
    | "confirmed"
    | "waitlisted"
    | "pending_claim"
    | "cancelled"
    | "no_show";
  paymentMethod: string;
  amountPaidCents: number;
  teamAssignment: string | null;
  checkedInAt: string | null;
  createdAt: string;
  session: {
    sportOrClassLabel: string;
    formatLabel: string | null;
    startsAt: string;
    endsAt: string;
    venueName: string | null;
  };
}

function fmtDateTime(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function statusTone(status: Booking["status"]): StatusTone {
  switch (status) {
    case "confirmed":
      return "confirmed";
    case "pending_claim":
      return "action";
    case "waitlisted":
    case "cancelled":
    case "no_show":
      return "pending";
  }
}

function statusLabel(status: Booking["status"]): string {
  switch (status) {
    case "confirmed":
      return "Confirmed";
    case "waitlisted":
      return "Waitlisted";
    case "pending_claim":
      return "Pending claim";
    case "cancelled":
      return "Cancelled";
    case "no_show":
      return "No show";
  }
}

/** Returns true when startsAt is within ±2 hours of now (loose UI hint). */
function isNearStart(startsAt: string): boolean {
  const diff = Math.abs(new Date(startsAt).getTime() - Date.now());
  return diff <= 2 * 60 * 60 * 1000;
}

const SUB_HEADER_CLS =
  "text-[11px] font-semibold tracking-[0.15em] uppercase text-ink-muted mb-2";

export default function MyDropInBookings() {
  useHydrationBeacon();

  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [checkingIn, setCheckingIn] = useState<Set<string>>(new Set());

  const reload = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/dropin/bookings");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      setBookings(json.bookings ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void reload();
  }, []);

  const cancel = async (bookingId: string) => {
    if (!confirm("Cancel this booking?")) return;
    const res = await fetch(`/api/dropin/bookings/${bookingId}/cancel`, {
      method: "POST",
    });
    const json = await res.json();
    if (!res.ok) {
      toast.error(json.error ?? "Cancel failed");
      return;
    }
    if (json.refunded) {
      toast.success("Cancelled — refund issued");
    } else {
      toast.success("Cancelled (inside cancellation window — no refund)");
    }
    await reload();
  };

  const handleCheckIn = async (bookingId: string) => {
    setCheckingIn((prev) => new Set(prev).add(bookingId));
    try {
      const res = await fetch("/api/dashboard/check-in", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind: "drop_in_booking", targetId: bookingId }),
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
        next.delete(bookingId);
        return next;
      });
    }
  };

  const upcoming = bookings.filter(
    (b) =>
      b.status !== "cancelled" &&
      b.status !== "no_show" &&
      new Date(b.session.startsAt).getTime() > Date.now(),
  );
  const past = bookings.filter(
    (b) =>
      b.status === "cancelled" ||
      b.status === "no_show" ||
      new Date(b.session.startsAt).getTime() <= Date.now(),
  );

  if (loading) return <LoadingSkeleton />;
  if (error) return <ErrorBanner message={error} />;

  if (bookings.length === 0) {
    return (
      <EmptyState
        title="No drop-in bookings yet"
        description="Browse upcoming sessions and book your spot."
      >
        <Button asChild>
          <a href="/dropin">Browse drop-in sessions</a>
        </Button>
      </EmptyState>
    );
  }

  return (
    <div className="space-y-4">
      <h3 className={SUB_HEADER_CLS}>Drop-in bookings</h3>

      {upcoming.length > 0 && (
        <section className="space-y-2">
          <p className={SUB_HEADER_CLS}>Upcoming</p>
          {upcoming.map((b) => {
            const cardType: CardType =
              b.session.formatLabel?.toLowerCase().includes("class") ||
              b.session.sportOrClassLabel.toLowerCase().includes("class") ||
              b.session.sportOrClassLabel.toLowerCase().includes("clinic")
                ? "class"
                : "pickup";

            const titleNode = (
              <>
                {b.session.sportOrClassLabel}
                {b.session.formatLabel && (
                  <span className="font-normal text-ink-2">
                    {" "}
                    · {b.session.formatLabel}
                  </span>
                )}
              </>
            );

            const actionNode = (
              <div className="flex flex-col items-end gap-1.5">
                <a
                  href={`/dropin/${b.sessionId}`}
                  className="text-[11px] text-ink-2 underline"
                >
                  Details
                </a>
                {b.checkedInAt ? (
                  <Badge
                    variant="outline"
                    className="bg-emerald-500/10 text-emerald-700 border-emerald-500/20"
                  >
                    Here
                  </Badge>
                ) : isNearStart(b.session.startsAt) ? (
                  <Button
                    size="sm"
                    disabled={checkingIn.has(b.id)}
                    onClick={() => handleCheckIn(b.id)}
                  >
                    {checkingIn.has(b.id) ? "Checking in..." : "Check me in"}
                  </Button>
                ) : null}
                {b.status === "confirmed" && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => cancel(b.id)}
                  >
                    Cancel
                  </Button>
                )}
                {b.status === "waitlisted" && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => cancel(b.id)}
                  >
                    Leave waitlist
                  </Button>
                )}
              </div>
            );

            return (
              <DashboardCard
                key={b.id}
                type={cardType}
                title={titleNode}
                meta={fmtDateTime(b.session.startsAt)}
                venue={{
                  label: b.session.venueName ?? "Venue TBD",
                  mapsUrl: directionsUrl({ name: b.session.venueName ?? undefined }),
                }}
                status={{ label: statusLabel(b.status), tone: statusTone(b.status) }}
                action={actionNode}
              >
                {b.teamAssignment && (
                  <div className="mt-1">
                    <Badge variant="secondary">Team {b.teamAssignment}</Badge>
                  </div>
                )}
              </DashboardCard>
            );
          })}
        </section>
      )}

      {upcoming.length === 0 && (
        <p className="text-sm text-ink-2">No upcoming bookings.</p>
      )}

      {past.length > 0 && (
        <section className="space-y-2">
          <p className={SUB_HEADER_CLS}>Past</p>
          {past.map((b) => (
            <DashboardCard
              key={b.id}
              type="pickup"
              title={b.session.sportOrClassLabel}
              meta={fmtDateTime(b.session.startsAt)}
              status={{ label: statusLabel(b.status), tone: statusTone(b.status) }}
            />
          ))}
        </section>
      )}
    </div>
  );
}
