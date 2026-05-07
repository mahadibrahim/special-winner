"use client";

import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ErrorBanner } from "@/components/ui/error-banner";
import { EmptyState } from "@/components/ui/empty-state";
import { LoadingSkeleton } from "@/components/ui/loading-skeleton";
import { toast } from "sonner";
import { useHydrationBeacon } from "@/lib/hooks/use-hydration-beacon";

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

function statusColor(status: Booking["status"]): string {
  switch (status) {
    case "confirmed":
      return "bg-emerald-100 text-emerald-900 border-emerald-200";
    case "waitlisted":
      return "bg-stone-100 text-stone-700 border-stone-200";
    case "pending_claim":
      return "bg-amber-100 text-amber-900 border-amber-200";
    case "cancelled":
      return "bg-stone-50 text-stone-500 border-stone-200";
    case "no_show":
      return "bg-rose-100 text-rose-900 border-rose-200";
  }
}

export default function MyDropInBookings() {
  useHydrationBeacon();

  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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

  return (
    <div className="space-y-6">
      <header>
        <h2 className="text-xl font-semibold text-stone-900">Drop-in bookings</h2>
        <p className="text-sm text-stone-600 mt-1">
          Pickup games and classes you've reserved.
        </p>
      </header>

      {bookings.length === 0 ? (
        <EmptyState
          title="No drop-in bookings yet"
          description="Browse upcoming sessions and book your spot."
        >
          <Button asChild>
            <a href="/dropin">Browse drop-in sessions</a>
          </Button>
        </EmptyState>
      ) : (
        <>
          <section>
            <h3 className="text-sm font-semibold uppercase tracking-wider text-stone-500 mb-3">
              Upcoming
            </h3>
            {upcoming.length === 0 ? (
              <p className="text-sm text-stone-500">No upcoming bookings.</p>
            ) : (
              <ul className="space-y-3">
                {upcoming.map((b) => (
                  <li
                    key={b.id}
                    className="rounded-lg border border-stone-200 bg-white p-4 flex items-start justify-between gap-3"
                  >
                    <div className="min-w-0">
                      <div className="font-medium text-stone-900">
                        {b.session.sportOrClassLabel}
                        {b.session.formatLabel && (
                          <span className="text-stone-500 font-normal">
                            {" "}
                            · {b.session.formatLabel}
                          </span>
                        )}
                      </div>
                      <div className="text-sm text-stone-600">
                        {fmtDateTime(b.session.startsAt)}
                      </div>
                      {b.session.venueName && (
                        <div className="text-xs text-stone-500">
                          {b.session.venueName}
                        </div>
                      )}
                      <div className="mt-2 flex items-center gap-2 flex-wrap">
                        <Badge variant="outline" className={statusColor(b.status)}>
                          {b.status.replace("_", " ")}
                        </Badge>
                        {b.teamAssignment && (
                          <Badge variant="secondary">Team {b.teamAssignment}</Badge>
                        )}
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-2 shrink-0">
                      <a
                        href={`/dropin/${b.sessionId}`}
                        className="text-xs text-stone-700 underline"
                      >
                        Details
                      </a>
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
                  </li>
                ))}
              </ul>
            )}
          </section>

          {past.length > 0 && (
            <section>
              <h3 className="text-sm font-semibold uppercase tracking-wider text-stone-500 mb-3">
                Past
              </h3>
              <ul className="space-y-2">
                {past.map((b) => (
                  <li
                    key={b.id}
                    className="rounded-lg border border-stone-100 bg-stone-50 p-3 text-sm flex items-center justify-between"
                  >
                    <div>
                      <span className="font-medium text-stone-700">
                        {b.session.sportOrClassLabel}
                      </span>
                      <span className="text-stone-500 ml-2">
                        {fmtDateTime(b.session.startsAt)}
                      </span>
                    </div>
                    <Badge variant="outline" className={statusColor(b.status)}>
                      {b.status.replace("_", " ")}
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
