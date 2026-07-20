"use client";

import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ErrorBanner } from "@/components/ui/error-banner";
import { EmptyState } from "@/components/ui/empty-state";
import { LoadingSkeleton } from "@/components/ui/loading-skeleton";
import { useHydrationBeacon } from "@/lib/hooks/use-hydration-beacon";
import { addWeeks, groupByDay, weekBoundsFor } from "@/lib/dropin/week-schedule";

interface SessionRow {
  id: string;
  kind: "pickup" | "class";
  sportOrClassLabel: string;
  formatLabel: string | null;
  startsAt: string;
  endsAt: string;
  capacity: number;
  status: "scheduled" | "cancelled" | "completed";
  venueId: string;
  venueName: string | null;
  confirmedCount: number;
  waitlistCount: number;
  hostUserId: string | null;
  hostName: string | null;
}

interface SessionsListProps {
  timezone: string;
}

function fmtTimeRange(startsAt: string, endsAt: string, timezone: string): string {
  const opts: Intl.DateTimeFormatOptions = {
    timeZone: timezone,
    hour: "numeric",
    minute: "2-digit",
  };
  const start = new Date(startsAt).toLocaleTimeString(undefined, opts);
  const end = new Date(endsAt).toLocaleTimeString(undefined, opts);
  return `${start} – ${end}`;
}

function weekRangeLabel(from: Date, to: Date, timezone: string): string {
  const lastDay = new Date(to.getTime() - 24 * 60 * 60 * 1000);
  const startFmt = new Intl.DateTimeFormat(undefined, {
    timeZone: timezone,
    month: "short",
    day: "numeric",
  });
  const endFmt = new Intl.DateTimeFormat(undefined, {
    timeZone: timezone,
    day: "numeric",
  });
  return `${startFmt.format(from)} – ${endFmt.format(lastDay)}`;
}

function statusColor(s: SessionRow["status"]): string {
  switch (s) {
    case "scheduled":
      return "bg-emerald-100 text-emerald-900 border-emerald-200";
    case "cancelled":
      return "bg-rose-100 text-rose-900 border-rose-200";
    case "completed":
      return "bg-stone-100 text-stone-700 border-stone-200";
  }
}

interface SessionCardProps {
  s: SessionRow;
  timezone: string;
  /** Re-fetches the week's sessions. Unused today; Tasks 4-5 wire it to the
   *  Cancel/Delete/Assign actions added to the overflow menu below. */
  onChanged: () => void;
}

function SessionCard({ s, timezone }: SessionCardProps) {
  const pct =
    s.capacity > 0 ? Math.min(100, Math.round((s.confirmedCount / s.capacity) * 100)) : 0;

  return (
    <div
      data-testid="session-card"
      className={`bg-cream-2 border border-border rounded-xl p-4 ${
        s.status === "cancelled" ? "opacity-60" : ""
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <a
            href={`/admin/dropin/sessions/${s.id}`}
            className="font-medium text-ink hover:underline"
          >
            {s.sportOrClassLabel}
            {s.formatLabel && ` · ${s.formatLabel}`}
          </a>
          <div className="text-sm text-ink-muted mt-0.5">
            {fmtTimeRange(s.startsAt, s.endsAt, timezone)}
            {s.venueName && ` · ${s.venueName}`}
          </div>
          <div className="mt-1 flex items-center gap-1">
            <Badge variant="outline" className="text-[10px]">
              {s.kind}
            </Badge>
            {s.status !== "scheduled" && (
              <Badge variant="outline" className={`text-[10px] ${statusColor(s.status)}`}>
                {s.status}
              </Badge>
            )}
          </div>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="text-ink-muted hover:text-ink">
              ⋯
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="bg-paper border-border">
            <DropdownMenuItem asChild>
              <a href={`/admin/dropin/sessions/${s.id}`} className="cursor-pointer">
                View
              </a>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <a href={`/admin/dropin/sessions/${s.id}/edit`} className="cursor-pointer">
                Edit
              </a>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <div className="mt-2 flex items-center gap-2 text-sm">
        <div className="h-2 w-28 rounded-full bg-cream overflow-hidden border border-border">
          <div className="h-full bg-ink" style={{ width: `${pct}%` }} />
        </div>
        <span className="text-ink">
          {s.confirmedCount}/{s.capacity}
        </span>
        {s.waitlistCount > 0 && (
          <span className="text-ink-muted">· {s.waitlistCount} waitlist</span>
        )}
      </div>

      <div className="mt-1 text-sm">
        {s.hostName ? (
          <span className="text-ink">Host: {s.hostName}</span>
        ) : (
          <span className="text-ink-muted">No host</span>
        )}
        {/* Task 5 adds the Assign control here */}
      </div>
    </div>
  );
}

export function SessionsList({ timezone }: SessionsListProps) {
  useHydrationBeacon();
  const [weekAnchor, setWeekAnchor] = useState<Date>(() => new Date());
  const [rows, setRows] = useState<SessionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const { from, to } = weekBoundsFor(weekAnchor, timezone);

  const reload = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/admin/dropin/sessions?from=${from.toISOString()}&to=${to.toISOString()}`,
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      setRows(json.sessions ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [weekAnchor.getTime(), timezone]);

  const days = groupByDay(rows, timezone, weekAnchor);
  const weekIsEmpty = !loading && days.every((d) => d.sessions.length === 0);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-ink">Drop-in sessions</h1>
        <p className="text-sm text-ink-muted mt-1">
          Schedule, monitor, and run pick-up and class sessions.
        </p>
      </div>

      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setWeekAnchor((d) => addWeeks(d, -1))}
          >
            ◀
          </Button>
          <div className="text-sm font-medium text-ink min-w-40 text-center">
            {weekRangeLabel(from, to, timezone)}
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setWeekAnchor((d) => addWeeks(d, 1))}
          >
            ▶
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setWeekAnchor(new Date())}>
            Today
          </Button>
        </div>
        <Button asChild>
          <a href="/admin/dropin/sessions/new">+ New session</a>
        </Button>
      </div>

      {error && <ErrorBanner message={error} />}
      {loading && <LoadingSkeleton />}
      {weekIsEmpty && (
        // The header CTA stays visible in the empty state, so no
        // duplicate action inside the empty-state card.
        <EmptyState
          title="No sessions in this view"
          description="This list only shows sessions at the venue location selected in the top-right picker, from the last 7 days through the next 60. If you expected sessions here, switch or clear the venue picker — otherwise create a session to get on the schedule."
        />
      )}
      {!loading && !weekIsEmpty && (
        <div>
          {days.map((day) => (
            <section data-testid="day-group" key={day.dayKey}>
              <h3 className="text-xs uppercase tracking-wider text-ink-muted mt-6 mb-2">
                {day.label}
              </h3>
              {day.sessions.length === 0 ? (
                <a
                  href={`/admin/dropin/sessions/new?date=${day.dayKey}`}
                  className="block rounded-lg border border-dashed border-border px-4 py-3 text-sm text-ink-muted hover:text-ink"
                >
                  No sessions · + add
                </a>
              ) : (
                <div className="space-y-2">
                  {day.sessions.map((s) => (
                    <SessionCard key={s.id} s={s} timezone={timezone} onChanged={reload} />
                  ))}
                </div>
              )}
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
