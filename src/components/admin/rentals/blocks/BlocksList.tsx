"use client";

import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { ErrorBanner } from "@/components/ui/error-banner";
import { EmptyState } from "@/components/ui/empty-state";
import { LoadingSkeleton } from "@/components/ui/loading-skeleton";
import { useHydrationBeacon } from "@/lib/hooks/use-hydration-beacon";
import { formatDollars } from "./format";

interface BlockRow {
  id: string;
  label: string;
  renterName: string;
  locationName: string;
  brand: string;
  status: "draft" | "awaiting_deposit" | "active" | "completed" | "cancelled";
  sessionCount: number;
  firstSessionAt: string | null;
  lastSessionAt: string | null;
  totalCents: number;
  paidCents: number;
  balanceDueCents: number;
  balanceDueAt: string | null;
  overdue: boolean;
}

const STATUS_OPTIONS = [
  { value: "", label: "All" },
  { value: "draft", label: "Draft" },
  { value: "awaiting_deposit", label: "Awaiting deposit" },
  { value: "active", label: "Active" },
  { value: "completed", label: "Completed" },
  { value: "cancelled", label: "Cancelled" },
];

function statusColor(s: BlockRow["status"]): string {
  switch (s) {
    case "draft":
      return "bg-stone-100 text-stone-700 border-stone-200";
    case "awaiting_deposit":
      return "bg-amber-100 text-amber-900 border-amber-200";
    case "active":
      return "bg-emerald-100 text-emerald-900 border-emerald-200";
    case "completed":
      return "bg-sky-100 text-sky-900 border-sky-200";
    case "cancelled":
      return "bg-rose-100 text-rose-900 border-rose-200";
  }
}

/** "Tue 8:00 PM · 12 sessions · Jan 6 – Mar 24" */
function patternSummary(row: BlockRow, timeZone: string): string {
  if (!row.firstSessionAt) {
    return row.status === "draft" ? "Draft — no sessions committed" : "No sessions";
  }
  const first = new Date(row.firstSessionAt);
  const weekday = first.toLocaleDateString("en-US", { timeZone, weekday: "short" });
  const time = first.toLocaleTimeString("en-US", {
    timeZone,
    hour: "numeric",
    minute: "2-digit",
  });
  const range = `${first.toLocaleDateString("en-US", { timeZone, month: "short", day: "numeric" })}${
    row.lastSessionAt
      ? ` – ${new Date(row.lastSessionAt).toLocaleDateString("en-US", {
          timeZone,
          month: "short",
          day: "numeric",
        })}`
      : ""
  }`;
  return `${weekday} ${time} · ${row.sessionCount} session${row.sessionCount === 1 ? "" : "s"} · ${range}`;
}

interface BlocksListProps {
  /** Org IANA timezone — block times are displayed in it. */
  timeZone: string;
}

export function BlocksList({ timeZone }: BlocksListProps) {
  useHydrationBeacon();

  const [rows, setRows] = useState<BlockRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState("");

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const params = new URLSearchParams();
        if (statusFilter) params.set("status", statusFilter);
        const res = await fetch(`/api/admin/rentals/blocks?${params.toString()}`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = await res.json();
        setRows(json.blocks ?? []);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load");
      } finally {
        setLoading(false);
      }
    };
    void load();
  }, [statusFilter]);

  const awaitingDeposit = rows.filter((r) => r.status === "awaiting_deposit").length;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap gap-3 items-end">
        <div>
          <label className="block text-xs text-ink-muted mb-1" htmlFor="blocks-status-filter">
            Status
          </label>
          <select
            id="blocks-status-filter"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="rounded border border-border px-3 py-1.5 text-sm bg-cream"
          >
            {STATUS_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {error && <ErrorBanner message={error} />}
      {loading && <LoadingSkeleton />}
      {!loading && rows.length === 0 && (
        <EmptyState
          title="No blocks yet"
          description="Build a recurring rental block to hold a season of prime slots in one pass."
        />
      )}
      {!loading && awaitingDeposit > 0 && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-900">
          {awaitingDeposit} block{awaitingDeposit === 1 ? "" : "s"} awaiting deposit
        </div>
      )}
      {!loading && rows.length > 0 && (
        <div className="rounded-lg border border-border bg-cream-2 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-cream border-b border-border">
              <tr className="text-left">
                <th className="px-4 py-2 font-medium text-ink-muted">Block</th>
                <th className="px-4 py-2 font-medium text-ink-muted">Location</th>
                <th className="px-4 py-2 font-medium text-ink-muted">Pattern</th>
                <th className="px-4 py-2 font-medium text-ink-muted">Status</th>
                <th className="px-4 py-2 font-medium text-ink-muted">Paid / Total</th>
                <th className="px-4 py-2 font-medium text-ink-muted">Balance due</th>
                <th className="px-4 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-t border-border hover:bg-cream/60">
                  <td className="px-4 py-3 align-top">
                    <div className="font-medium text-ink">{r.label}</div>
                    <div className="text-xs text-ink-muted">{r.renterName}</div>
                  </td>
                  <td className="px-4 py-3 align-top text-ink-muted">{r.locationName}</td>
                  <td className="px-4 py-3 align-top text-ink-muted">
                    {patternSummary(r, timeZone)}
                  </td>
                  <td className="px-4 py-3 align-top">
                    <Badge variant="outline" className={statusColor(r.status)}>
                      {r.status.replace(/_/g, " ")}
                    </Badge>
                    {r.overdue && (
                      <div className="mt-1">
                        <Badge
                          variant="outline"
                          className="bg-rose-100 text-rose-900 border-rose-200"
                        >
                          &#9888; overdue
                        </Badge>
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3 align-top text-ink">
                    {formatDollars(r.paidCents)} / {formatDollars(r.totalCents)}
                  </td>
                  <td className="px-4 py-3 align-top text-ink-muted">
                    {r.balanceDueCents > 0 ? formatDollars(r.balanceDueCents) : "—"}
                    {r.balanceDueAt && (
                      <div className="text-xs">
                        {new Date(r.balanceDueAt).toLocaleDateString("en-US", {
                          timeZone,
                          month: "short",
                          day: "numeric",
                        })}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3 align-top text-right">
                    <a href={`/admin/rentals/blocks/${r.id}`} className="text-xs text-ink underline">
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
