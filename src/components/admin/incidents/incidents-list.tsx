"use client";

import { useEffect, useState } from "react";
import { AlertTriangle } from "lucide-react";
import { useHydrationBeacon } from "@/lib/hooks/use-hydration-beacon";
import { ErrorBanner } from "@/components/ui/error-banner";
import { EmptyState } from "@/components/ui/empty-state";
import { LoadingSkeleton } from "@/components/ui/loading-skeleton";

interface IncidentRow {
  id: string;
  incidentType: string;
  status: "open" | "closed";
  occurredAt: string;
  subjectType: "participant" | "bystander" | "staff" | "other";
  subjectFreeTextName: string | null;
  subjectFirstName: string | null;
  subjectLastName: string | null;
  venueId: string;
  venueName: string;
  suspectedConcussion: boolean;
  createdAt: string;
}

const STATUS_FILTERS = [
  { value: "", label: "All" },
  { value: "open", label: "Open" },
  { value: "closed", label: "Closed" },
] as const;

function subjectLabel(row: IncidentRow): string {
  if (row.subjectType === "participant") {
    return [row.subjectFirstName, row.subjectLastName].filter(Boolean).join(" ") || "Participant";
  }
  return row.subjectFreeTextName ?? "Unknown";
}

function incidentTypeLabel(type: string): string {
  return type
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

export function IncidentsList() {
  useHydrationBeacon();

  const [status, setStatus] = useState<(typeof STATUS_FILTERS)[number]["value"]>("");
  const [rows, setRows] = useState<IncidentRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setRows(null);
    setError(null);
    (async () => {
      try {
        const qs = status ? `?status=${status}` : "";
        const res = await fetch(`/api/admin/incidents${qs}`);
        if (!res.ok) throw new Error(`Failed to load incidents (${res.status})`);
        const json = await res.json();
        if (!cancelled) setRows(json.incidents ?? []);
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
      <div className="flex gap-2" role="tablist" aria-label="Filter by status">
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
          title="No incidents"
          description="Nothing matches this filter yet — reports filed from the staff app show up here."
        />
      )}

      {!error && rows !== null && rows.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="text-left text-ink-muted uppercase text-[11px] tracking-wider border-b border-ink/10">
                <th className="py-2 pr-4">Occurred</th>
                <th className="py-2 pr-4">Type</th>
                <th className="py-2 pr-4">Subject</th>
                <th className="py-2 pr-4">Venue</th>
                <th className="py-2 pr-4">Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} className="border-b border-ink/5 hover:bg-cream-2">
                  <td className="py-2 pr-4">
                    <a href={`/admin/incidents/${row.id}`} className="hover:underline">
                      {new Date(row.occurredAt).toLocaleString()}
                    </a>
                  </td>
                  <td className="py-2 pr-4">{incidentTypeLabel(row.incidentType)}</td>
                  <td className="py-2 pr-4">
                    <span className="inline-flex items-center gap-1.5">
                      {subjectLabel(row)}
                      {row.suspectedConcussion && (
                        <span
                          title="Suspected concussion"
                          className="inline-flex items-center gap-1 text-xs text-primary-orange"
                        >
                          <AlertTriangle className="size-3.5" aria-hidden="true" />
                        </span>
                      )}
                    </span>
                  </td>
                  <td className="py-2 pr-4">{row.venueName}</td>
                  <td className="py-2 pr-4 capitalize">{row.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
