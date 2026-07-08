"use client";

import { useEffect, useState } from "react";
import { AlertTriangle } from "lucide-react";
import { useHydrationBeacon } from "@/lib/hooks/use-hydration-beacon";
import { ErrorBanner } from "@/components/ui/error-banner";
import { EmptyState } from "@/components/ui/empty-state";
import { LoadingSkeleton } from "@/components/ui/loading-skeleton";

interface TimeEntryRow {
  id: string;
  userId: string;
  userFirstName: string;
  userLastName: string;
  venueId: string;
  venueName: string;
  role: "coach" | "venue_manager" | "referee";
  gameId: string | null;
  clockInAt: string;
  clockOutAt: string | null;
  clockInDistanceM: number | null;
  clockInAccuracyM: number | null;
  clockOutAccuracyM: number | null;
  flaggedOutOfRange: boolean;
  flagReason: "missing_location" | "out_of_range" | "imprecise_location" | null;
  notes: string | null;
}

interface VenueOption {
  id: string;
  name: string;
}

const ROLE_LABELS: Record<TimeEntryRow["role"], string> = {
  coach: "Coach",
  venue_manager: "Venue manager",
  referee: "Referee",
};

const FLAG_LABELS: Record<NonNullable<TimeEntryRow["flagReason"]>, string> = {
  missing_location: "Missing location",
  out_of_range: "Out of range",
  imprecise_location: "Imprecise location",
};

function fmtTime(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString();
}

export function TimeEntriesList({ venues }: { venues: VenueOption[] }) {
  useHydrationBeacon();

  const [venueId, setVenueId] = useState<string>("");
  const [flaggedOnly, setFlaggedOnly] = useState(false);
  const [from, setFrom] = useState<string>("");
  const [to, setTo] = useState<string>("");
  const [rows, setRows] = useState<TimeEntryRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setRows(null);
    setError(null);
    (async () => {
      try {
        const params = new URLSearchParams();
        if (venueId) params.set("venueId", venueId);
        if (flaggedOnly) params.set("flaggedOnly", "1");
        if (from && to) {
          params.set("from", from);
          params.set("to", to);
        }
        const qs = params.toString();
        const res = await fetch(`/api/admin/labor/time-entries${qs ? `?${qs}` : ""}`);
        if (!res.ok) throw new Error(`Failed to load time entries (${res.status})`);
        const json = await res.json();
        if (!cancelled) setRows(json.timeEntries ?? []);
      } catch (e: any) {
        if (!cancelled) setError(e.message ?? "Unexpected error");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [venueId, flaggedOnly, from, to]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <label htmlFor="venueFilter" className="block text-xs text-ink-muted uppercase tracking-wider mb-1">
            Venue
          </label>
          <select
            id="venueFilter"
            value={venueId}
            onChange={(e) => setVenueId(e.target.value)}
            className="px-3 py-1.5 bg-paper border border-ink/15 rounded-md text-sm"
          >
            <option value="">All venues</option>
            {venues.map((v) => (
              <option key={v.id} value={v.id}>
                {v.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="fromFilter" className="block text-xs text-ink-muted uppercase tracking-wider mb-1">
            From
          </label>
          <input
            id="fromFilter"
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            className="px-3 py-1.5 bg-paper border border-ink/15 rounded-md text-sm"
          />
        </div>
        <div>
          <label htmlFor="toFilter" className="block text-xs text-ink-muted uppercase tracking-wider mb-1">
            To
          </label>
          <input
            id="toFilter"
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            className="px-3 py-1.5 bg-paper border border-ink/15 rounded-md text-sm"
          />
        </div>
        <button
          type="button"
          onClick={() => setFlaggedOnly((v) => !v)}
          aria-pressed={flaggedOnly}
          className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors inline-flex items-center gap-1.5 ${
            flaggedOnly ? "bg-amber-100 text-amber-900" : "bg-cream-2 text-ink-2 hover:bg-cream-3"
          }`}
        >
          <AlertTriangle className="size-3.5" aria-hidden="true" />
          Flagged only
        </button>
      </div>

      {error && <ErrorBanner message={error} />}

      {!error && rows === null && <LoadingSkeleton rows={5} />}

      {!error && rows !== null && rows.length === 0 && (
        <EmptyState
          title="No time entries"
          description="Nothing matches this filter yet — clock-ins from the staff app and referee check-ins show up here."
        />
      )}

      {!error && rows !== null && rows.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="text-left text-ink-muted uppercase text-[11px] tracking-wider border-b border-ink/10">
                <th className="py-2 pr-4">Clock in</th>
                <th className="py-2 pr-4">Clock out</th>
                <th className="py-2 pr-4">Person</th>
                <th className="py-2 pr-4">Role</th>
                <th className="py-2 pr-4">Venue</th>
                <th className="py-2 pr-4">Distance</th>
                <th className="py-2 pr-4">Review</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr
                  key={row.id}
                  className={`border-b border-ink/5 hover:bg-cream-2 ${
                    row.flaggedOutOfRange ? "bg-amber-50/60" : ""
                  }`}
                >
                  <td className="py-2 pr-4">{fmtTime(row.clockInAt)}</td>
                  <td className="py-2 pr-4">{fmtTime(row.clockOutAt)}</td>
                  <td className="py-2 pr-4">
                    {row.userFirstName} {row.userLastName}
                  </td>
                  <td className="py-2 pr-4">{ROLE_LABELS[row.role]}</td>
                  <td className="py-2 pr-4">{row.venueName}</td>
                  <td className="py-2 pr-4">
                    {row.clockInDistanceM != null ? `${row.clockInDistanceM}m` : "—"}
                    {row.clockInAccuracyM != null && (
                      <span className="text-ink-faint"> (±{row.clockInAccuracyM}m)</span>
                    )}
                  </td>
                  <td className="py-2 pr-4">
                    {row.flaggedOutOfRange ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 text-amber-900 px-2 py-0.5 text-xs font-medium">
                        <AlertTriangle className="size-3" aria-hidden="true" />
                        Flagged
                        {row.flagReason && ` · ${FLAG_LABELS[row.flagReason]}`}
                      </span>
                    ) : (
                      <span className="text-ink-faint text-xs">Clean</span>
                    )}
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
