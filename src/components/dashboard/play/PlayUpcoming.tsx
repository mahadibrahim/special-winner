"use client";

import { useEffect, useState } from "react";
import { ErrorBanner } from "@/components/ui/error-banner";
import { EmptyState } from "@/components/ui/empty-state";
import { LoadingSkeleton } from "@/components/ui/loading-skeleton";
import { DashboardCard } from "@/components/dashboard/shell/DashboardCard";
import { directionsUrl } from "@/lib/dashboard/maps";
import { Button } from "@/components/ui/button";

interface Game {
  id: string;
  scheduledAt: string;
  status: string;
  homeTeamId: string | null;
  awayTeamId: string | null;
  venueId: string | null;
  fieldNumber: string | null;
  opponentName: string | null;
  isHome: boolean;
  venueName: string | null;
  venueAddress: string | null;
}

interface Booking {
  id: string;
  sessionId: string;
  status:
    | "confirmed"
    | "waitlisted"
    | "pending_payment"
    | "pending_claim"
    | "cancelled"
    | "no_show";
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

function venueLabel(
  fieldNumber: string | null,
  venueName: string | null,
): string {
  if (venueName && fieldNumber != null) return `Field ${fieldNumber} · ${venueName}`;
  if (venueName) return venueName;
  return "Venue TBD";
}

function gameStatus(
  g: Pick<Game, "status" | "isHome">,
): { label: string; tone: "confirmed" | "action" | "pending" } | undefined {
  if (g.status === "cancelled") return { label: "Cancelled", tone: "pending" };
  if (g.status === "postponed") return { label: "Postponed", tone: "pending" };
  if (g.isHome) return { label: "Home", tone: "confirmed" };
  return undefined;
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

      {/* Next game — hero card */}
      {nextGame && (
        <DashboardCard
          hero
          type="league_game"
          title={`vs ${nextGame.opponentName ?? "Opponent TBD"}`}
          meta={`${fmtDate(nextGame.scheduledAt)} · ${fmtTime(nextGame.scheduledAt)}${nextGame.fieldNumber != null ? ` · Field ${nextGame.fieldNumber}` : ""}`}
          venue={{
            label: venueLabel(nextGame.fieldNumber, nextGame.venueName),
            mapsUrl: directionsUrl({ name: nextGame.venueName, address: nextGame.venueAddress }),
          }}
          status={gameStatus(nextGame)}
        />
      )}

      {/* Remaining games — compact cards */}
      {restGames.length > 0 && (
        <section>
          <h3 className="text-[11px] font-semibold tracking-[0.15em] uppercase text-ink-muted mb-3">
            More games
          </h3>
          <div className="space-y-2">
            {restGames.map((g) => (
              <DashboardCard
                key={g.id}
                type="league_game"
                title={`vs ${g.opponentName ?? "Opponent TBD"}`}
                meta={`${fmtDateTime(g.scheduledAt)}${g.fieldNumber != null ? ` · Field ${g.fieldNumber}` : ""}`}
                venue={{
                  label: venueLabel(g.fieldNumber, g.venueName),
                  mapsUrl: directionsUrl({ name: g.venueName, address: g.venueAddress }),
                }}
                status={gameStatus(g)}
              />
            ))}
          </div>
        </section>
      )}

      {/* Upcoming drop-in / pickup sessions */}
      {hasBookings && (
        <section>
          <h3 className="text-[11px] font-semibold tracking-[0.15em] uppercase text-ink-muted mb-3">
            Pickup sessions
          </h3>
          <div className="space-y-2">
            {bookings.map((b) => (
              <DashboardCard
                key={b.id}
                type="pickup"
                title={
                  b.session.formatLabel
                    ? `${b.session.sportOrClassLabel} · ${b.session.formatLabel}`
                    : b.session.sportOrClassLabel
                }
                meta={fmtDateTime(b.session.startsAt)}
                venue={{
                  label: b.session.venueName ?? "Venue TBD",
                  mapsUrl: directionsUrl({ name: b.session.venueName }),
                }}
                action={
                  <Button asChild variant="outline" size="sm">
                    <a href={`/dropin/${b.sessionId}`}>Details</a>
                  </Button>
                }
              />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
