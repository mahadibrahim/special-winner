"use client";

import { useEffect, useState } from "react";
import { ErrorBanner } from "@/components/ui/error-banner";
import { EmptyState } from "@/components/ui/empty-state";
import { LoadingSkeleton } from "@/components/ui/loading-skeleton";
import { Badge } from "@/components/ui/badge";

interface Game {
  id: string;
  scheduledAt: string;
  status: string;
  homeTeamId: string | null;
  awayTeamId: string | null;
  venueId: string | null;
  fieldNumber: number | null;
  opponentName: string | null;
  isHome: boolean;
}

interface Booking {
  id: string;
  sessionId: string;
  status: "confirmed" | "waitlisted" | "pending_claim" | "cancelled" | "no_show";
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

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

function fmtTime(iso: string): string {
  return new Date(iso).toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });
}

function gameStatusBadge(status: string) {
  if (status === "cancelled") {
    return (
      <Badge variant="outline" className="bg-stone-50 text-stone-500 border-stone-200 text-xs">
        Cancelled
      </Badge>
    );
  }
  if (status === "postponed") {
    return (
      <Badge variant="outline" className="bg-amber-50 text-amber-800 border-amber-200 text-xs">
        Postponed
      </Badge>
    );
  }
  return null;
}

export default function PlayUpcoming() {
  const [games, setGames] = useState<Game[]>([]);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loadingGames, setLoadingGames] = useState(true);
  const [loadingBookings, setLoadingBookings] = useState(true);
  const [errorGames, setErrorGames] = useState<string | null>(null);
  const [errorBookings, setErrorBookings] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch("/api/dashboard/play/games");
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = await res.json();
        setGames(json.games ?? []);
      } catch (err) {
        setErrorGames(err instanceof Error ? err.message : "Failed to load games");
      } finally {
        setLoadingGames(false);
      }
    })();
  }, []);

  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch("/api/dropin/bookings");
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = await res.json();
        const all: Booking[] = json.bookings ?? [];
        const upcoming = all.filter(
          (b) =>
            b.status !== "cancelled" &&
            b.status !== "no_show" &&
            new Date(b.session.startsAt).getTime() > Date.now(),
        );
        setBookings(upcoming);
      } catch (err) {
        setErrorBookings(err instanceof Error ? err.message : "Failed to load drop-in sessions");
      } finally {
        setLoadingBookings(false);
      }
    })();
  }, []);

  if (loadingGames || loadingBookings) return <LoadingSkeleton />;

  const hasGames = games.length > 0;
  const hasBookings = bookings.length > 0;

  // If all fetches failed AND there is nothing to display, surface the error instead
  // of the misleading empty state. If any data came through, keep rendering it.
  if (!hasGames && !hasBookings && (errorGames || errorBookings)) {
    return (
      <ErrorBanner
        message={[errorGames, errorBookings].filter(Boolean).join(" · ")}
      />
    );
  }

  if (!hasGames && !hasBookings) {
    return (
      <EmptyState
        title="No games scheduled yet"
        description="Your upcoming league games and pickup sessions will appear here."
      />
    );
  }

  const [nextGame, ...restGames] = games;

  return (
    <div className="space-y-6">
      {errorGames && <ErrorBanner message={errorGames} />}
      {errorBookings && <ErrorBanner message={errorBookings} />}

      {/* Next game — prominent card */}
      {nextGame && (
        <div className="rounded-xl border border-stone-200 bg-paper p-5 space-y-2">
          <p className="text-[11px] font-semibold tracking-[0.15em] uppercase text-ink-muted">
            Next game
          </p>
          <div className="flex items-start justify-between gap-3">
            <div>
              <h3 className="text-lg font-semibold text-ink">
                {nextGame.opponentName ? (
                  <>
                    vs{" "}
                    <span className="text-primary">{nextGame.opponentName}</span>
                  </>
                ) : (
                  "Opponent TBD"
                )}
              </h3>
              <p className="text-sm text-ink-2 mt-0.5">
                {fmtDate(nextGame.scheduledAt)} · {fmtTime(nextGame.scheduledAt)}
              </p>
              {nextGame.fieldNumber != null && (
                <p className="text-xs text-ink-muted mt-0.5">
                  Field {nextGame.fieldNumber}
                </p>
              )}
              <p className="text-xs text-ink-muted">
                {nextGame.isHome ? "Home" : "Away"}
              </p>
            </div>
            <div className="shrink-0">
              {gameStatusBadge(nextGame.status)}
            </div>
          </div>
        </div>
      )}

      {/* Remaining games — compact list */}
      {restGames.length > 0 && (
        <section>
          <h3 className="text-[11px] font-semibold tracking-[0.15em] uppercase text-ink-muted mb-3">
            More games
          </h3>
          <ul className="space-y-2">
            {restGames.map((g) => (
              <li
                key={g.id}
                className="flex items-center justify-between gap-2 rounded-lg border border-stone-100 bg-cream-2 px-3 py-2 text-sm"
              >
                <div className="min-w-0">
                  <span className="font-medium text-ink">
                    {g.opponentName ? `vs ${g.opponentName}` : "Opponent TBD"}
                  </span>
                  <span className="text-ink-muted ml-2">{fmtDateTime(g.scheduledAt)}</span>
                  {g.fieldNumber != null && (
                    <span className="text-ink-muted ml-1">· Field {g.fieldNumber}</span>
                  )}
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <span className="text-xs text-ink-muted">{g.isHome ? "Home" : "Away"}</span>
                  {gameStatusBadge(g.status)}
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Upcoming drop-in / pickup sessions */}
      {hasBookings && (
        <section>
          <h3 className="text-[11px] font-semibold tracking-[0.15em] uppercase text-ink-muted mb-3">
            Pickup sessions
          </h3>
          <ul className="space-y-2">
            {bookings.map((b) => (
              <li
                key={b.id}
                className="flex items-center justify-between gap-2 rounded-lg border border-stone-100 bg-cream-2 px-3 py-2 text-sm"
              >
                <div className="min-w-0">
                  <span className="font-medium text-ink">
                    {b.session.sportOrClassLabel}
                    {b.session.formatLabel && (
                      <span className="text-ink-muted font-normal"> · {b.session.formatLabel}</span>
                    )}
                  </span>
                  <span className="text-ink-muted ml-2">
                    {fmtDateTime(b.session.startsAt)}
                  </span>
                  {b.session.venueName && (
                    <span className="text-ink-muted ml-1">· {b.session.venueName}</span>
                  )}
                </div>
                <a
                  href={`/dropin/${b.sessionId}`}
                  className="text-xs text-primary underline shrink-0"
                >
                  Details
                </a>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
