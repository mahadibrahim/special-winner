"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { useHydrationBeacon } from "@/lib/hooks/use-hydration-beacon";
import { ErrorBanner } from "@/components/ui/error-banner";
import { LoadingSkeleton } from "@/components/ui/loading-skeleton";
import { buildShareBlurb } from "@/lib/dropin/share-blurb";

interface RosterRow {
  bookingId: string;
  firstName: string;
  lastName: string;
  status: string;
  paymentMethod: string;
  checkedInAt: string | null;
  teamAssignment: string | null;
}
interface GameDetail {
  session: {
    id: string;
    sportOrClassLabel: string;
    formatLabel: string | null;
    startsAt: string;
    endsAt: string;
    capacity: number;
    confirmedCount: number;
    teamCount: number;
    teamColors: string[];
    venueName: string | null;
    status: string;
  };
  roster: RosterRow[];
  waitlistCount: number;
}

export default function HostGameDay({ sessionId }: { sessionId: string }) {
  useHydrationBeacon();
  const [data, setData] = useState<GameDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState("");
  const [incident, setIncident] = useState(false);
  const [incidentDetails, setIncidentDetails] = useState("");
  const [reported, setReported] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/host/games/${sessionId}`);
      if (res.status === 404) throw new Error("This isn't one of your games.");
      if (!res.ok) throw new Error("Could not load the game");
      setData(await res.json());
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load the game");
    }
  }, [sessionId]);

  useEffect(() => {
    void load();
  }, [load]);

  const shareText = useMemo(() => {
    if (!data) return "";
    const spotsLeft = Math.max(0, data.session.capacity - data.session.confirmedCount);
    return buildShareBlurb({
      sport: data.session.sportOrClassLabel,
      venueName: data.session.venueName,
      startsAt: new Date(data.session.startsAt),
      spotsLeft,
      url: `${window.location.origin}/dropin/${sessionId}?src=host-share`,
      timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    });
  }, [data, sessionId]);

  async function share() {
    if (navigator.share) {
      try {
        await navigator.share({ text: shareText });
        return;
      } catch {
        /* user dismissed — fall through to copy */
      }
    }
    await navigator.clipboard.writeText(shareText);
    toast.success("Copied — paste it into your group chat");
  }

  async function mark(bookingId: string, action: "check_in" | "undo_check_in" | "no_show") {
    const res = await fetch(`/api/host/games/${sessionId}/attendance`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ entries: [{ bookingId, action }] }),
    });
    if (!res.ok) toast.error("Could not update — try again");
    await load();
  }

  async function assignTeam(bookingId: string, team: string | null) {
    const res = await fetch(`/api/host/games/${sessionId}/teams`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ assignments: [{ bookingId, team }] }),
    });
    if (!res.ok) toast.error("Could not set the team");
    await load();
  }

  async function submitReport() {
    const res = await fetch(`/api/host/games/${sessionId}/report`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        summary,
        incidentFlagged: incident,
        incidentDetails: incident ? incidentDetails : undefined,
      }),
    });
    if (res.status === 409) {
      setReported(true);
      toast.error("Wrap-up was already submitted for this game.");
    } else if (!res.ok) {
      toast.error((await res.json()).error ?? "Could not submit");
    } else {
      setReported(true);
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

  const s = data.session;
  const gameStarted = new Date() >= new Date(s.startsAt);
  const spotsLeft = Math.max(0, s.capacity - s.confirmedCount);
  const active = data.roster.filter((r) => r.status !== "no_show" && r.status !== "waitlisted");

  return (
    <main id="main-content" className="mx-auto max-w-xl space-y-8 px-4 py-8">
      {/* Zone 1 — fill status */}
      <section>
        <h1 className="text-2xl font-semibold capitalize">
          {s.sportOrClassLabel}
          {s.venueName ? ` @ ${s.venueName}` : ""}
        </h1>
        <p className="text-sm text-muted-foreground">
          {new Date(s.startsAt).toLocaleString("en-US", { weekday: "long", hour: "numeric", minute: "2-digit" })}
        </p>
        <div className="mt-3 h-3 w-full overflow-hidden rounded-full bg-muted">
          <div
            className="h-full rounded-full bg-primary"
            style={{ width: `${Math.min(100, Math.round((s.confirmedCount / Math.max(1, s.capacity)) * 100))}%` }}
          />
        </div>
        <p className="mt-1 text-sm" data-testid="fill-meter">
          {s.confirmedCount}/{s.capacity} booked
          {data.waitlistCount > 0 ? ` · ${data.waitlistCount} waitlisted` : ""}
          {spotsLeft > 0 ? ` · ${spotsLeft} open` : " · Full"}
        </p>
      </section>

      {/* Zone 2 — share */}
      {spotsLeft > 0 && (
        <section className="rounded-lg border p-4">
          <h2 className="font-semibold">Fill this game</h2>
          <p className="mt-1 text-sm text-muted-foreground">{shareText}</p>
          <button
            type="button"
            className="mt-3 w-full rounded-md border px-4 py-3 font-medium"
            onClick={() => void share()}
            data-testid="share-game"
          >
            Share with friends
          </button>
        </section>
      )}

      {/* Zone 3 — roster / check-in / teams */}
      <section>
        <h2 className="text-xl font-semibold">Roster</h2>
        <ul className="mt-3 space-y-2" data-testid="host-roster">
          {active.map((r) => (
            <li key={r.bookingId} className="flex items-center justify-between gap-2 rounded-lg border p-3">
              <div>
                <p className="font-medium">
                  {r.firstName} {r.lastName}
                  {r.paymentMethod === "host_comp" ? " (you)" : ""}
                </p>
                {s.teamCount > 0 && (
                  <select
                    className="mt-1 rounded border px-2 py-1 text-sm"
                    value={r.teamAssignment ?? ""}
                    onChange={(e) => void assignTeam(r.bookingId, e.target.value || null)}
                  >
                    <option value="">No team</option>
                    {s.teamColors.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                )}
              </div>
              <button
                type="button"
                className={`shrink-0 rounded-md px-4 py-3 font-medium ${r.checkedInAt ? "bg-primary text-primary-foreground" : "border"}`}
                onClick={() => void mark(r.bookingId, r.checkedInAt ? "undo_check_in" : "check_in")}
              >
                {r.checkedInAt ? "✓ Here" : "Check in"}
              </button>
            </li>
          ))}
        </ul>
      </section>

      {/* Zone 4 — wrap-up */}
      {gameStarted && !reported && (
        <section className="rounded-lg border p-4">
          <h2 className="font-semibold">Wrap-up</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Mark anyone who didn't show via their roster row, then close out the game.
          </p>
          <textarea
            className="mt-3 w-full rounded border p-2"
            rows={3}
            placeholder="How did it go? Great energy? Lopsided teams?"
            value={summary}
            onChange={(e) => setSummary(e.target.value)}
            data-testid="wrapup-summary"
          />
          <label className="mt-2 flex items-center gap-2 text-sm">
            <input type="checkbox" checked={incident} onChange={(e) => setIncident(e.target.checked)} />
            Something happened that the org should know about
          </label>
          {incident && (
            <textarea
              className="mt-2 w-full rounded border p-2"
              rows={2}
              placeholder="What happened?"
              value={incidentDetails}
              onChange={(e) => setIncidentDetails(e.target.value)}
            />
          )}
          <button
            type="button"
            className="mt-3 w-full rounded-md border px-4 py-3 font-medium disabled:opacity-50"
            disabled={!summary.trim()}
            onClick={() => void submitReport()}
            data-testid="wrapup-submit"
          >
            Submit wrap-up
          </button>
        </section>
      )}
      {reported && <p className="text-sm">✓ Wrap-up submitted — thanks for hosting.</p>}

      {/* No-show marking lives here so the wrap-up section stays simple */}
      {gameStarted && (
        <section>
          <h2 className="text-sm font-medium text-muted-foreground">Didn't show?</h2>
          <ul className="mt-2 space-y-1">
            {active
              .filter((r) => !r.checkedInAt && r.paymentMethod !== "host_comp")
              .map((r) => (
                <li key={r.bookingId} className="flex items-center justify-between text-sm">
                  <span>
                    {r.firstName} {r.lastName}
                  </span>
                  <button type="button" className="underline" onClick={() => void mark(r.bookingId, "no_show")}>
                    Mark no-show
                  </button>
                </li>
              ))}
          </ul>
        </section>
      )}
    </main>
  );
}
