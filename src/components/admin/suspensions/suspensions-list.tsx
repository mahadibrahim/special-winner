"use client";

import { useEffect, useState } from "react";
import { AlertTriangle } from "lucide-react";
import { useHydrationBeacon } from "@/lib/hooks/use-hydration-beacon";
import { ErrorBanner } from "@/components/ui/error-banner";
import { EmptyState } from "@/components/ui/empty-state";
import { LoadingSkeleton } from "@/components/ui/loading-skeleton";

interface SuspensionRow {
  id: string;
  personName: string;
  teamId: string;
  teamName: string;
  reason: string;
  gamesMissed: number;
  gamesServed: number;
  status: "active" | "served" | "appealed" | "season" | "permanent";
  escalatedToDirector: boolean;
  notes: string | null;
  createdAt: string;
  incidentGameId: string;
  incidentMinute: number | null;
  incidentSide: string;
  ejectionCount: number;
}

const STATUS_FILTERS = [
  { value: "", label: "All" },
  { value: "active", label: "Active" },
  { value: "served", label: "Served" },
  { value: "appealed", label: "Appealed" },
  { value: "season", label: "Season" },
  { value: "permanent", label: "Permanent" },
] as const;

function statusLabel(status: string): string {
  return status.charAt(0).toUpperCase() + status.slice(1);
}

/**
 * Admin list for the ejection/suspension tracker (product-backlog build
 * #4). Deliberately not super-admin-only (see index.astro) — location_admin
 * sees suspensions for their own teams, scoped server-side by
 * GET /api/admin/suspensions.
 */
export function SuspensionsList() {
  useHydrationBeacon();

  const [status, setStatus] = useState<(typeof STATUS_FILTERS)[number]["value"]>("");
  const [rows, setRows] = useState<SuspensionRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setRows(null);
    setError(null);
    (async () => {
      try {
        const qs = status ? `?status=${status}` : "";
        const res = await fetch(`/api/admin/suspensions${qs}`);
        if (!res.ok) throw new Error(`Failed to load suspensions (${res.status})`);
        const json = await res.json();
        if (!cancelled) setRows(json.suspensions ?? []);
      } catch (e: any) {
        if (!cancelled) setError(e.message ?? "Unexpected error");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [status]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2" role="tablist" aria-label="Filter by status">
        {STATUS_FILTERS.map((f) => (
          <button
            key={f.value}
            type="button"
            role="tab"
            aria-selected={status === f.value}
            onClick={() => setStatus(f.value)}
            className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
              status === f.value
                ? "bg-ink text-cream"
                : "bg-cream-2 text-ink-2 hover:bg-cream-3"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {error && <ErrorBanner message={error} />}

      {!error && rows === null && <LoadingSkeleton rows={5} />}

      {!error && rows !== null && rows.length === 0 && (
        <EmptyState
          title="No suspensions"
          description="Nothing matches this filter yet — ejections logged by referees with a carried suspension show up here."
        />
      )}

      {!error && rows !== null && rows.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="text-left text-ink-muted uppercase text-[11px] tracking-wider border-b border-ink/10">
                <th className="py-2 pr-4">Person</th>
                <th className="py-2 pr-4">Team</th>
                <th className="py-2 pr-4">Reason</th>
                <th className="py-2 pr-4">Games</th>
                <th className="py-2 pr-4">Status</th>
                <th className="py-2 pr-4">Prior ejections</th>
                <th className="py-2 pr-4">Game</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} className="border-b border-ink/5 hover:bg-cream-2">
                  <td className="py-2 pr-4">
                    <span className="inline-flex items-center gap-1.5 font-medium">
                      {row.personName}
                      {row.escalatedToDirector && (
                        <span
                          title="Flagged for director review"
                          className="inline-flex items-center gap-1 text-xs text-primary-orange"
                        >
                          <AlertTriangle className="size-3.5" aria-hidden="true" />
                        </span>
                      )}
                    </span>
                  </td>
                  <td className="py-2 pr-4">{row.teamName}</td>
                  <td className="py-2 pr-4">{row.reason}</td>
                  <td className="py-2 pr-4">
                    {row.gamesServed}/{row.gamesMissed}
                  </td>
                  <td className="py-2 pr-4 capitalize">{statusLabel(row.status)}</td>
                  <td className="py-2 pr-4">
                    <span
                      className={row.ejectionCount > 1 ? "font-semibold text-primary-orange" : undefined}
                      title="Total ejections by this person in this org (case-insensitive name match; no roster FK in v1)"
                    >
                      {row.ejectionCount}
                    </span>
                  </td>
                  <td className="py-2 pr-4">
                    {row.incidentSide} · {row.incidentMinute != null ? `${row.incidentMinute}'` : "—"}
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
