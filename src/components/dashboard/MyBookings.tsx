// src/components/dashboard/MyBookings.tsx
"use client";

import { useEffect, useState, type FormEvent, type ReactNode } from "react";
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

interface RentalPlayerRow {
  id: string;
  playerName: string;
  isMinor: boolean;
  signerEmail: string;
  status: "pending" | "signed";
  signedAt: string | null;
}

/**
 * Collapsible roster panel for a pending_payment/confirmed field rental.
 * Fetches lazily on first expand so the dashboard's initial load stays cheap
 * for renters with several rentals.
 */
function RentalPlayersPanel({ rentalId }: { rentalId: string }) {
  const [expanded, setExpanded] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [players, setPlayers] = useState<RentalPlayerRow[]>([]);
  const [signed, setSigned] = useState(0);
  const [total, setTotal] = useState(0);

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [isMinor, setIsMinor] = useState(false);
  const [adding, setAdding] = useState(false);
  const [resendingId, setResendingId] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/rentals/bookings/${rentalId}/players`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
      setPlayers(json.players ?? []);
      setSigned(json.signed ?? 0);
      setTotal(json.total ?? 0);
      setLoaded(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't load players");
    } finally {
      setLoading(false);
    }
  };

  const toggle = () => {
    const next = !expanded;
    setExpanded(next);
    if (next && !loaded) void load();
  };

  const addPlayer = async (e: FormEvent) => {
    e.preventDefault();
    const playerName = name.trim();
    const signerEmail = email.trim();
    if (!playerName || !signerEmail) return;
    setAdding(true);
    try {
      const res = await fetch(`/api/rentals/bookings/${rentalId}/players`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ playerName, signerEmail, isMinor }),
      });
      const json = await res.json();
      if (!res.ok) {
        toast.error(json.error ?? "Could not add player");
        return;
      }
      toast.success("Player added — waiver invite sent");
      setName("");
      setEmail("");
      setIsMinor(false);
      await load();
    } finally {
      setAdding(false);
    }
  };

  const resend = async (playerId: string) => {
    setResendingId(playerId);
    try {
      const res = await fetch(
        `/api/rentals/bookings/${rentalId}/players/${playerId}/resend`,
        { method: "POST" },
      );
      const json = await res.json();
      if (!res.ok) {
        toast.error(json.error ?? "Resend failed");
        return;
      }
      toast.success("Waiver invite resent");
    } finally {
      setResendingId(null);
    }
  };

  return (
    <div className="mt-2 pt-2 border-t border-border">
      <button
        type="button"
        onClick={toggle}
        aria-expanded={expanded}
        className="flex items-center justify-between w-full text-left text-[11px] font-semibold text-ink-2 hover:text-ink"
      >
        <span>
          Players &amp; waivers
          {loaded ? ` — ${signed} of ${total} signed` : ""}
        </span>
        <span className="text-ink-muted">{expanded ? "Hide" : "Show"}</span>
      </button>

      {expanded && (
        <div className="mt-2 space-y-2">
          {loading && <p className="text-xs text-ink-muted">Loading…</p>}
          {error && <ErrorBanner message={error} />}

          {!loading && !error && (
            <>
              {players.length === 0 ? (
                <p className="text-xs text-ink-muted">No players added yet.</p>
              ) : (
                <ul className="space-y-1.5">
                  {players.map((p) => (
                    <li
                      key={p.id}
                      className="flex items-center justify-between gap-2 text-xs bg-cream-2 rounded px-2 py-1.5 flex-wrap"
                    >
                      <span className="text-ink">{p.playerName}</span>
                      <span className="flex items-center gap-2">
                        <Badge
                          variant="outline"
                          className={
                            p.status === "signed"
                              ? "bg-emerald-500/10 text-emerald-700 border-emerald-500/20"
                              : "bg-amber-500/10 text-amber-700 border-amber-500/20"
                          }
                        >
                          {p.status === "signed" ? "Signed" : "Pending"}
                        </Badge>
                        {p.status === "pending" && (
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={resendingId === p.id}
                            onClick={() => resend(p.id)}
                          >
                            {resendingId === p.id ? "Sending…" : "Resend"}
                          </Button>
                        )}
                      </span>
                    </li>
                  ))}
                </ul>
              )}

              <form onSubmit={addPlayer} className="flex flex-col gap-2 border-t border-border pt-2">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-ink-muted">
                  Add a player
                </p>
                <div className="flex flex-wrap gap-2">
                  <div className="flex flex-col gap-1 flex-1 min-w-[140px]">
                    <label htmlFor={`player-name-${rentalId}`} className="sr-only">
                      Player name
                    </label>
                    <input
                      id={`player-name-${rentalId}`}
                      type="text"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="Player name"
                      className="rounded border border-border px-2 py-1.5 text-xs bg-cream"
                      required
                    />
                  </div>
                  <div className="flex flex-col gap-1 flex-1 min-w-[160px]">
                    <label htmlFor={`player-email-${rentalId}`} className="sr-only">
                      Signer email
                    </label>
                    <input
                      id={`player-email-${rentalId}`}
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="Signer email"
                      className="rounded border border-border px-2 py-1.5 text-xs bg-cream"
                      required
                    />
                  </div>
                </div>
                <label className="flex items-center gap-1.5 text-[11px] text-ink-2">
                  <input
                    type="checkbox"
                    checked={isMinor}
                    onChange={(e) => setIsMinor(e.target.checked)}
                  />
                  This player is a minor (parent/guardian signs)
                </label>
                <Button type="submit" size="sm" disabled={adding} className="self-start">
                  {adding ? "Adding…" : "Add player"}
                </Button>
              </form>
            </>
          )}
        </div>
      )}
    </div>
  );
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
  const [paying, setPaying] = useState<Set<string>>(new Set());
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
  const payNow = async (rentalId: string) => {
    setPaying((p) => new Set(p).add(rentalId));
    try {
      const res = await fetch(`/api/rentals/bookings/${rentalId}/pay`, { method: "POST" });
      const json = await res.json();
      if (!res.ok || !json.checkoutUrl) {
        toast.error(json.error ?? "Could not start payment");
        return;
      }
      window.location.href = json.checkoutUrl as string;
    } finally {
      setPaying((p) => { const n = new Set(p); n.delete(rentalId); return n; });
    }
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
        {item.kind === "rental" && item.rental!.status === "pending_payment" && (
          <Button size="sm" disabled={paying.has(item.id)} onClick={() => payNow(item.id)}>
            {paying.has(item.id) ? "Starting…" : "Pay now"}
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
        <div>
          <div className="flex items-center gap-2 flex-wrap mt-1">
            {r.status === "pending_payment" && r.paymentExpiresAt && (
              <HoldCountdown expiresAt={r.paymentExpiresAt} onExpire={() => void reload()} />
            )}
            <span className="text-[11px] text-ink-2">
              {r.partySize} {r.partySize === 1 ? "person" : "people"}
            </span>
          </div>
          {(r.status === "pending_payment" || r.status === "confirmed") && (
            <RentalPlayersPanel rentalId={r.id} />
          )}
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
