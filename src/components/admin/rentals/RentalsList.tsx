"use client";

import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { ErrorBanner } from "@/components/ui/error-banner";
import { EmptyState } from "@/components/ui/empty-state";
import { LoadingSkeleton } from "@/components/ui/loading-skeleton";
import { useHydrationBeacon } from "@/lib/hooks/use-hydration-beacon";

interface RentalRow {
  id: string;
  venueId: string;
  venueName: string | null;
  fieldNumber: number;
  startsAt: string;
  endsAt: string;
  status: "pending_payment" | "confirmed" | "cancelled" | "completed" | "no_show";
  renterName: string;
  renterPhone: string | null;
  partySize: number;
  paymentMethod: string;
  paymentStatus: "unpaid" | "paid" | "refunded";
  amountDueCents: number;
  amountPaidCents: number;
  waiverSigned: boolean;
  checkedInAt: string | null;
}

const STATUS_OPTIONS = [
  { value: "", label: "All" },
  { value: "pending_payment", label: "Pending payment" },
  { value: "confirmed", label: "Confirmed" },
  { value: "cancelled", label: "Cancelled" },
  { value: "completed", label: "Completed" },
  { value: "no_show", label: "No show" },
];

function statusColor(s: RentalRow["status"]): string {
  switch (s) {
    case "confirmed":
      return "bg-emerald-100 text-emerald-900 border-emerald-200";
    case "pending_payment":
      return "bg-amber-100 text-amber-900 border-amber-200";
    case "cancelled":
      return "bg-rose-100 text-rose-900 border-rose-200";
    case "completed":
      return "bg-stone-100 text-stone-700 border-stone-200";
    case "no_show":
      return "bg-zinc-100 text-zinc-700 border-zinc-200";
  }
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

function fmtTime(iso: string): string {
  return new Date(iso).toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });
}

function fmtCents(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

export function RentalsList() {
  useHydrationBeacon();

  const [rows, setRows] = useState<RentalRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [venueFilter, setVenueFilter] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [statusFilter, setStatusFilter] = useState("");

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const params = new URLSearchParams();
        if (venueFilter) params.set("venueId", venueFilter);
        if (fromDate) params.set("from", fromDate);
        if (toDate) params.set("to", toDate);
        if (statusFilter) params.set("status", statusFilter);
        const res = await fetch(`/api/admin/rentals?${params.toString()}`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = await res.json();
        setRows(json.rentals ?? []);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load");
      } finally {
        setLoading(false);
      }
    };
    void load();
  }, [venueFilter, fromDate, toDate, statusFilter]);

  return (
    <div className="space-y-5">
      {/* Filter bar */}
      <div className="flex flex-wrap gap-3 items-end">
        <div>
          <label className="block text-xs text-ink-muted mb-1">Venue ID</label>
          <input
            type="text"
            value={venueFilter}
            onChange={(e) => setVenueFilter(e.target.value)}
            placeholder="Paste venue UUID…"
            className="rounded border border-border px-3 py-1.5 text-sm bg-cream w-56"
          />
        </div>
        <div>
          <label className="block text-xs text-ink-muted mb-1">From</label>
          <input
            type="date"
            value={fromDate}
            onChange={(e) => setFromDate(e.target.value)}
            className="rounded border border-border px-3 py-1.5 text-sm bg-cream"
          />
        </div>
        <div>
          <label className="block text-xs text-ink-muted mb-1">To</label>
          <input
            type="date"
            value={toDate}
            onChange={(e) => setToDate(e.target.value)}
            className="rounded border border-border px-3 py-1.5 text-sm bg-cream"
          />
        </div>
        <div>
          <label className="block text-xs text-ink-muted mb-1">Status</label>
          <select
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
          title="No rentals found"
          description="No field rentals match the current filters."
        />
      )}
      {!loading && rows.length > 0 && (
        <div className="rounded-lg border border-border bg-cream-2 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-cream border-b border-border">
              <tr className="text-left">
                <th className="px-4 py-2 font-medium text-ink-muted">Venue / Field</th>
                <th className="px-4 py-2 font-medium text-ink-muted">When</th>
                <th className="px-4 py-2 font-medium text-ink-muted">Renter</th>
                <th className="px-4 py-2 font-medium text-ink-muted">Party</th>
                <th className="px-4 py-2 font-medium text-ink-muted">Status</th>
                <th className="px-4 py-2 font-medium text-ink-muted">Payment</th>
                <th className="px-4 py-2 font-medium text-ink-muted">Waiver</th>
                <th className="px-4 py-2 font-medium text-ink-muted">In</th>
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
                    <div className="font-medium text-ink">
                      {r.venueName ?? "—"}
                    </div>
                    <div className="text-xs text-ink-muted">Field {r.fieldNumber}</div>
                  </td>
                  <td className="px-4 py-3 align-top">
                    <div className="text-ink">{fmtDate(r.startsAt)}</div>
                    <div className="text-xs text-ink-muted">
                      until {fmtTime(r.endsAt)}
                    </div>
                  </td>
                  <td className="px-4 py-3 align-top text-ink">
                    {r.renterName}
                    {r.renterPhone && (
                      <div className="text-xs text-ink-muted">{r.renterPhone}</div>
                    )}
                  </td>
                  <td className="px-4 py-3 align-top text-ink-muted">
                    {r.partySize}
                  </td>
                  <td className="px-4 py-3 align-top">
                    <Badge variant="outline" className={statusColor(r.status)}>
                      {r.status.replace(/_/g, " ")}
                    </Badge>
                  </td>
                  <td className="px-4 py-3 align-top">
                    <div className="text-ink-muted text-xs">
                      {r.paymentStatus} · {fmtCents(r.amountPaidCents)}/{fmtCents(r.amountDueCents)}
                    </div>
                  </td>
                  <td className="px-4 py-3 align-top text-center">
                    {r.waiverSigned ? (
                      <span className="text-emerald-700 font-medium">&#10003;</span>
                    ) : (
                      <span className="text-ink-muted">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 align-top text-center">
                    {r.checkedInAt ? (
                      <span className="text-emerald-700 font-medium">&#10003;</span>
                    ) : (
                      <span className="text-ink-muted">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 align-top text-right">
                    <a
                      href={`/admin/rentals/${r.id}`}
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
