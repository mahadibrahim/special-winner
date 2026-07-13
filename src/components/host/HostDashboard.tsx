"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { useHydrationBeacon } from "@/lib/hooks/use-hydration-beacon";
import { ErrorBanner } from "@/components/ui/error-banner";
import { EmptyState } from "@/components/ui/empty-state";
import { LoadingSkeleton } from "@/components/ui/loading-skeleton";

interface HostGameSummary {
  id: string;
  sportOrClassLabel: string;
  formatLabel: string | null;
  startsAt: string;
  endsAt: string;
  capacity: number;
  confirmedCount: number;
  venueName: string | null;
}

function GameRow(props: {
  game: HostGameSummary;
  action: { label: string; onClick: () => void } | null;
  href?: string;
}) {
  const g = props.game;
  const when = new Date(g.startsAt).toLocaleString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
  const body = (
    <div className="flex items-center justify-between gap-3 rounded-lg border p-4">
      <div>
        <p className="font-medium capitalize">
          {g.sportOrClassLabel}
          {g.formatLabel ? ` · ${g.formatLabel}` : ""}
        </p>
        <p className="text-sm text-muted-foreground">
          {when}
          {g.venueName ? ` · ${g.venueName}` : ""}
        </p>
        <p className="text-sm">
          {g.confirmedCount}/{g.capacity} booked
        </p>
      </div>
      {props.action && (
        <button
          type="button"
          className="shrink-0 rounded-md border px-4 py-3 font-medium"
          onClick={(e) => {
            e.preventDefault();
            props.action!.onClick();
          }}
        >
          {props.action.label}
        </button>
      )}
    </div>
  );
  return props.href ? (
    <a href={props.href} className="block">
      {body}
    </a>
  ) : (
    body
  );
}

export default function HostDashboard() {
  useHydrationBeacon();
  const [data, setData] = useState<{ mine: HostGameSummary[]; claimable: HostGameSummary[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [claiming, setClaiming] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/host/games");
      if (!res.ok) throw new Error((await res.json()).error ?? "Could not load games");
      setData(await res.json());
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load games");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function claim(id: string) {
    setClaiming(id);
    try {
      const res = await fetch(`/api/host/games/${id}/claim`, { method: "POST" });
      if (res.status === 409) {
        toast.error("Someone beat you to it — that game just got a host.");
      } else if (!res.ok) {
        toast.error((await res.json()).error ?? "Could not claim the game");
      }
      await load();
    } finally {
      setClaiming(null);
    }
  }

  if (error) {
    return (
      <main id="main-content" className="mx-auto max-w-xl px-4 py-8">
        <ErrorBanner message={error} />
      </main>
    );
  }
  if (!data) {
    return (
      <main id="main-content" className="mx-auto max-w-xl px-4 py-8">
        <LoadingSkeleton />
      </main>
    );
  }

  return (
    <main id="main-content" className="mx-auto max-w-xl space-y-8 px-4 py-8">
      <section>
        <h1 className="text-2xl font-semibold">My games</h1>
        <div className="mt-4 space-y-3" data-testid="host-my-games">
          {data.mine.length === 0 ? (
            <EmptyState
              title="No games yet"
              description="Claim a game below to get started."
            />
          ) : (
            data.mine.map((g) => (
              <GameRow key={g.id} game={g} action={null} href={`/host/games/${g.id}`} />
            ))
          )}
        </div>
      </section>
      <section>
        <h2 className="text-xl font-semibold">Games needing a host</h2>
        <div className="mt-4 space-y-3" data-testid="host-claimable-games">
          {data.claimable.length === 0 ? (
            <EmptyState
              title="Nothing to claim right now"
              description="New pickup games appear here as they're scheduled."
            />
          ) : (
            data.claimable.map((g) => (
              <GameRow
                key={g.id}
                game={g}
                action={{
                  label: claiming === g.id ? "Claiming…" : "Claim",
                  onClick: () => void claim(g.id),
                }}
              />
            ))
          )}
        </div>
      </section>
    </main>
  );
}
