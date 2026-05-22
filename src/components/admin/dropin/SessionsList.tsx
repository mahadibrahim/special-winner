"use client";

import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ErrorBanner } from "@/components/ui/error-banner";
import { EmptyState } from "@/components/ui/empty-state";
import { LoadingSkeleton } from "@/components/ui/loading-skeleton";
import { useHydrationBeacon } from "@/lib/hooks/use-hydration-beacon";

interface SessionRow {
  id: string;
  kind: "pickup" | "class";
  sportOrClassLabel: string;
  formatLabel: string | null;
  startsAt: string;
  endsAt: string;
  capacity: number;
  status: "scheduled" | "cancelled" | "completed";
  venueName: string | null;
  confirmedCount: number;
  waitlistCount: number;
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
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

export function SessionsList() {
  useHydrationBeacon();
  const [rows, setRows] = useState<SessionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      try {
        const res = await fetch("/api/admin/dropin/sessions");
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = await res.json();
        setRows(json.sessions ?? []);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load");
      } finally {
        setLoading(false);
      }
    };
    void load();
  }, []);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-ink">Drop-in sessions</h1>
          <p className="text-sm text-ink-muted mt-1">
            Schedule, monitor, and run pick-up and class sessions.
          </p>
        </div>
        <Button asChild>
          <a href="/admin/dropin/sessions/new">+ New session</a>
        </Button>
      </div>

      {error && <ErrorBanner message={error} />}
      {loading && <LoadingSkeleton />}
      {!loading && rows.length === 0 && (
        // The header CTA stays visible in the empty state, so no
        // duplicate action inside the empty-state card.
        <EmptyState
          title="No sessions yet"
          description="Create your first drop-in session to get on the schedule."
        />
      )}
      {!loading && rows.length > 0 && (
        <div className="rounded-lg border border-border bg-cream-2 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-cream border-b border-border">
              <tr className="text-left">
                <th className="px-4 py-2 font-medium text-ink-muted">When</th>
                <th className="px-4 py-2 font-medium text-ink-muted">Session</th>
                <th className="px-4 py-2 font-medium text-ink-muted">Space</th>
                <th className="px-4 py-2 font-medium text-ink-muted">Roster</th>
                <th className="px-4 py-2 font-medium text-ink-muted">Status</th>
                <th className="px-4 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr
                  key={r.id}
                  className="border-t border-border hover:bg-cream/60"
                >
                  <td className="px-4 py-3 align-top">
                    <div className="text-ink">{fmtDate(r.startsAt)}</div>
                  </td>
                  <td className="px-4 py-3 align-top">
                    <div className="font-medium text-ink">
                      {r.sportOrClassLabel}
                    </div>
                    <div className="text-xs text-ink-muted flex items-center gap-1">
                      <Badge variant="outline" className="text-[10px]">
                        {r.kind}
                      </Badge>
                      {r.formatLabel && <span>{r.formatLabel}</span>}
                    </div>
                  </td>
                  <td className="px-4 py-3 align-top text-ink-muted">
                    {r.venueName ?? "—"}
                  </td>
                  <td className="px-4 py-3 align-top text-ink-muted">
                    {r.confirmedCount} / {r.capacity}
                    {r.waitlistCount > 0 && (
                      <span className="ml-2 text-xs">
                        +{r.waitlistCount} wl
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 align-top">
                    <Badge variant="outline" className={statusColor(r.status)}>
                      {r.status}
                    </Badge>
                  </td>
                  <td className="px-4 py-3 align-top text-right">
                    <a
                      href={`/admin/dropin/sessions/${r.id}`}
                      className="text-xs text-ink underline"
                    >
                      Open
                    </a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
