"use client";

import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ErrorBanner } from "@/components/ui/error-banner";
import { LoadingSkeleton } from "@/components/ui/loading-skeleton";
import { useHydrationBeacon } from "@/lib/hooks/use-hydration-beacon";
import { toast } from "sonner";

interface Rental {
  id: string;
  venueId: string;
  fieldNumber: number;
  startsAt: string;
  endsAt: string;
  status: "pending_payment" | "confirmed" | "cancelled" | "completed" | "no_show";
  source: string;
  renterName: string;
  renterEmail: string | null;
  renterPhone: string | null;
  partySize: number;
  purpose: string | null;
  notes: string | null;
  paymentMethod: string;
  paymentStatus: "unpaid" | "paid" | "refunded";
  amountDueCents: number;
  amountPaidCents: number;
  waiverSigned: boolean;
  waiverSignedAt: string | null;
  waiverSignedBy: string | null;
  checkedInAt: string | null;
  createdAt: string;
  updatedAt: string;
  cancelledAt: string | null;
  cancellationReason: string | null;
}

interface Venue {
  id: string;
  name: string;
}

interface DetailResponse {
  rental: Rental;
  venue: Venue | null;
}

interface RentalDetailProps {
  rentalId: string;
}

function statusColor(s: Rental["status"]): string {
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

function fmtDateTime(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function fmtCents(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

export function RentalDetail({ rentalId }: RentalDetailProps) {
  useHydrationBeacon();

  const [data, setData] = useState<DetailResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);

  const reload = async () => {
    try {
      const res = await fetch(`/api/admin/rentals/${rentalId}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = (await res.json()) as DetailResponse;
      setData(json);
      setNotes(json.rental.notes ?? "");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void reload();
  }, [rentalId]);

  const saveNotes = async () => {
    if (!data) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/rentals/${rentalId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notes }),
      });
      const json = await res.json();
      if (!res.ok) {
        toast.error(json.error ?? "Save failed");
        return;
      }
      toast.success("Notes saved");
      setData({ ...data, rental: json.rental });
    } finally {
      setBusy(false);
    }
  };

  const cancelRental = async () => {
    if (!data) return;
    if (!window.confirm("Cancel this rental? This cannot be undone.")) return;
    setBusy(true);
    try {
      const rental = data.rental;
      const isPaid =
        rental.paymentStatus === "paid" && rental.amountPaidCents > 0;
      const url = `/api/admin/rentals/${rentalId}`;
      const res = isPaid
        ? await fetch(`${url}/refund`, { method: "POST" })
        : await fetch(url, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ cancel: true }),
          });
      const json = await res.json();
      if (!res.ok) {
        toast.error(json.error ?? "Cancel failed");
        return;
      }
      toast.success(isPaid ? "Refund issued and rental cancelled" : "Rental cancelled");
      await reload();
    } finally {
      setBusy(false);
    }
  };

  if (loading) return <LoadingSkeleton />;
  if (error) return <ErrorBanner message={error} />;
  if (!data) return null;

  const { rental, venue } = data;
  const isCancelled = rental.status === "cancelled";

  return (
    <div className="space-y-6 max-w-3xl">
      <a
        href="/admin/rentals"
        className="text-xs uppercase tracking-wider text-ink-muted hover:text-ink"
      >
        ← All rentals
      </a>

      {/* Header */}
      <header className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-ink">
            {venue?.name ?? "—"} &mdash; Field {rental.fieldNumber}
          </h1>
          <p className="mt-1 text-sm text-ink-muted">
            {fmtDateTime(rental.startsAt)} &ndash; {fmtDateTime(rental.endsAt)}
          </p>
          <div className="mt-2">
            <Badge variant="outline" className={statusColor(rental.status)}>
              {rental.status.replace(/_/g, " ")}
            </Badge>
          </div>
        </div>
        {!isCancelled && (
          <Button
            variant="outline"
            disabled={busy}
            onClick={cancelRental}
            className="text-rose-700 border-rose-200 hover:bg-rose-50"
          >
            {rental.paymentStatus === "paid" && rental.amountPaidCents > 0
              ? "Refund and cancel"
              : "Cancel rental"}
          </Button>
        )}
      </header>

      {/* Renter */}
      <section className="rounded-xl border border-border bg-cream-2 p-5 space-y-2">
        <h2 className="font-semibold text-ink mb-3">Renter</h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-sm">
          <div>
            <div className="text-xs uppercase tracking-wider text-ink-muted">Name</div>
            <div className="text-ink">{rental.renterName}</div>
          </div>
          <div>
            <div className="text-xs uppercase tracking-wider text-ink-muted">Email</div>
            <div className="text-ink">{rental.renterEmail ?? "—"}</div>
          </div>
          <div>
            <div className="text-xs uppercase tracking-wider text-ink-muted">Phone</div>
            <div className="text-ink">{rental.renterPhone ?? "—"}</div>
          </div>
          <div>
            <div className="text-xs uppercase tracking-wider text-ink-muted">Party size</div>
            <div className="text-ink">{rental.partySize}</div>
          </div>
          <div>
            <div className="text-xs uppercase tracking-wider text-ink-muted">Purpose</div>
            <div className="text-ink">{rental.purpose ?? "—"}</div>
          </div>
          <div>
            <div className="text-xs uppercase tracking-wider text-ink-muted">Source</div>
            <div className="text-ink">{rental.source.replace(/_/g, " ")}</div>
          </div>
        </div>
      </section>

      {/* Payment */}
      <section className="rounded-xl border border-border bg-cream-2 p-5">
        <h2 className="font-semibold text-ink mb-3">Payment</h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
          <div>
            <div className="text-xs uppercase tracking-wider text-ink-muted">Method</div>
            <div className="text-ink">{rental.paymentMethod.replace(/_/g, " ")}</div>
          </div>
          <div>
            <div className="text-xs uppercase tracking-wider text-ink-muted">Status</div>
            <div className="text-ink">{rental.paymentStatus}</div>
          </div>
          <div>
            <div className="text-xs uppercase tracking-wider text-ink-muted">Amount due</div>
            <div className="text-ink">{fmtCents(rental.amountDueCents)}</div>
          </div>
          <div>
            <div className="text-xs uppercase tracking-wider text-ink-muted">Amount paid</div>
            <div className="text-ink">{fmtCents(rental.amountPaidCents)}</div>
          </div>
        </div>
      </section>

      {/* Waiver + check-in */}
      <section className="rounded-xl border border-border bg-cream-2 p-5">
        <h2 className="font-semibold text-ink mb-3">Waiver / Check-in</h2>
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div>
            <div className="text-xs uppercase tracking-wider text-ink-muted">Waiver signed</div>
            <div className="text-ink">
              {rental.waiverSigned ? (
                <>
                  Yes
                  {rental.waiverSignedAt && (
                    <span className="text-ink-muted ml-1 text-xs">
                      ({new Date(rental.waiverSignedAt).toLocaleString()})
                    </span>
                  )}
                </>
              ) : (
                "No"
              )}
            </div>
          </div>
          <div>
            <div className="text-xs uppercase tracking-wider text-ink-muted">Checked in</div>
            <div className="text-ink">
              {rental.checkedInAt
                ? new Date(rental.checkedInAt).toLocaleString()
                : "—"}
            </div>
          </div>
        </div>
      </section>

      {/* Notes */}
      <section className="space-y-2">
        <h2 className="font-semibold text-ink">Notes</h2>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={4}
          className="w-full rounded border border-border px-3 py-2 text-sm bg-cream resize-y"
          placeholder="Internal staff notes…"
        />
        <Button size="sm" onClick={saveNotes} disabled={busy}>
          {busy ? "Saving…" : "Save notes"}
        </Button>
      </section>

      {rental.cancelledAt && (
        <p className="text-xs text-ink-muted">
          Cancelled {new Date(rental.cancelledAt).toLocaleString()}
          {rental.cancellationReason && (
            <> · reason: {rental.cancellationReason.replace(/_/g, " ")}</>
          )}
        </p>
      )}
    </div>
  );
}
