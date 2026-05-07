"use client";

import { useEffect, useMemo, useState } from "react";
import { Loader2, RefreshCw } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ErrorBanner } from "@/components/ui/error-banner";
import { EmptyState } from "@/components/ui/empty-state";
import { useHydrationBeacon } from "@/lib/hooks/use-hydration-beacon";

interface Row {
  id: string;
  organizationId: string;
  gameId: string;
  activityId: string;
  expectedAt: string;
  status:
    | "pending"
    | "in_progress"
    | "overdue"
    | "completed"
    | "canceled"
    | "skipped_by_handoff";
  currentResponsibleRole: string;
  completedAt: string | null;
  gameScheduledAt: string;
  venueId: string | null;
  venueName: string | null;
}

const STATUS_COLORS: Record<Row["status"], string> = {
  pending: "bg-gray-100 text-gray-800 border-gray-200",
  in_progress: "bg-blue-100 text-blue-800 border-blue-200",
  overdue: "bg-yellow-100 text-yellow-900 border-yellow-300",
  completed: "bg-green-100 text-green-800 border-green-200",
  canceled: "bg-red-100 text-red-800 border-red-200",
  skipped_by_handoff: "bg-purple-100 text-purple-800 border-purple-200",
};

function todayUtcIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function StatusBadge({ status }: { status: Row["status"] }) {
  return (
    <Badge variant="outline" className={`${STATUS_COLORS[status]} font-normal`}>
      {status}
    </Badge>
  );
}

export function ActivityTrackingDashboard() {
  useHydrationBeacon();

  const [date, setDate] = useState<string>(todayUtcIso());
  const [includeClosed, setIncludeClosed] = useState(false);
  const [rows, setRows] = useState<Row[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    void fetchRows();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date, includeClosed]);

  async function fetchRows() {
    setIsLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ date });
      if (includeClosed) params.set("includeClosed", "1");
      const res = await fetch(`/api/admin/activity-completions/today?${params}`);
      if (!res.ok) {
        throw new Error(`Failed to load (${res.status})`);
      }
      const body = await res.json();
      setRows(body.rows ?? []);
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : "Failed to load");
    } finally {
      setIsLoading(false);
    }
  }

  const displayRows = useMemo(() => rows ?? [], [rows]);

  return (
    <div className="container mx-auto p-4 md:p-6 space-y-4">
      <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-gray-900">Today's activities</h1>
          <p className="text-gray-600 mt-1 text-sm">
            All tracked work happening on {date} (UTC).
          </p>
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <div className="space-y-1">
            <Label htmlFor="date" className="text-xs">Date</Label>
            <Input
              id="date"
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="w-44"
            />
          </div>
          <div className="flex items-center gap-2">
            <input
              id="includeClosed"
              type="checkbox"
              checked={includeClosed}
              onChange={(e) => setIncludeClosed(e.target.checked)}
              className="h-4 w-4"
            />
            <Label htmlFor="includeClosed" className="text-sm font-normal">
              Include closed
            </Label>
          </div>
          <Button variant="outline" size="sm" onClick={() => void fetchRows()} disabled={isLoading}>
            {isLoading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4" />
            )}
          </Button>
        </div>
      </div>

      {error && <ErrorBanner message={error} />}

      {rows === null ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : displayRows.length === 0 ? (
        <EmptyState
          title="No activities for this date"
          description="Activities are bootstrapped when games are scheduled. Check the date filter or include closed."
        />
      ) : (
        <div className="overflow-x-auto rounded-lg border bg-white">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-left">
              <tr>
                <th className="px-3 py-2 font-medium">Status</th>
                <th className="px-3 py-2 font-medium">Activity</th>
                <th className="px-3 py-2 font-medium">Venue</th>
                <th className="px-3 py-2 font-medium">Expected</th>
                <th className="px-3 py-2 font-medium">Responsible</th>
                <th className="px-3 py-2 font-medium" />
              </tr>
            </thead>
            <tbody className="divide-y">
              {displayRows.map((r) => (
                <tr key={r.id} className="hover:bg-gray-50">
                  <td className="px-3 py-2"><StatusBadge status={r.status} /></td>
                  <td className="px-3 py-2 font-mono text-xs">{r.activityId}</td>
                  <td className="px-3 py-2">{r.venueName ?? "—"}</td>
                  <td className="px-3 py-2 whitespace-nowrap">
                    {new Date(r.expectedAt).toLocaleString()}
                  </td>
                  <td className="px-3 py-2 font-mono text-xs">{r.currentResponsibleRole}</td>
                  <td className="px-3 py-2 text-right">
                    <a
                      href={`/admin/activity-completions/${r.id}`}
                      className="text-primary hover:underline whitespace-nowrap"
                    >
                      Open →
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
