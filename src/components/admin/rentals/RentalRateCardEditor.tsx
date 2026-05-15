"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ErrorBanner } from "@/components/ui/error-banner";
import { LoadingSkeleton } from "@/components/ui/loading-skeleton";
import { useHydrationBeacon } from "@/lib/hooks/use-hydration-beacon";
import { toast } from "sonner";

interface RateCard {
  defaultHourlyRateCents: number;
  cancelWindowHours: number;
  bookingIncrementMinutes: number;
  minDurationMinutes: number;
  maxDurationMinutes: number;
  updatedAt: string;
  updatedByUserId: string | null;
}

export function RentalRateCardEditor() {
  useHydrationBeacon();

  const [card, setCard] = useState<RateCard | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reload = async () => {
    try {
      const res = await fetch("/api/admin/rentals/rate-card");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      setCard(json.rateCard);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void reload();
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!card) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/rentals/rate-card", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          defaultHourlyRateCents: card.defaultHourlyRateCents,
          cancelWindowHours: card.cancelWindowHours,
          bookingIncrementMinutes: card.bookingIncrementMinutes,
          minDurationMinutes: card.minDurationMinutes,
          maxDurationMinutes: card.maxDurationMinutes,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? "Save failed");
        return;
      }
      toast.success("Saved");
      setCard(json.rateCard);
    } finally {
      setBusy(false);
    }
  };

  if (loading) return <LoadingSkeleton />;

  return (
    <div className="max-w-2xl space-y-6">
      <header>
        <h1 className="text-2xl font-bold text-ink">Field rental rate card</h1>
        <p className="text-sm text-ink-muted mt-1">
          Org defaults applied when a venue does not override a rate.
        </p>
      </header>

      {error && <ErrorBanner message={error} />}

      {card && (
        <form onSubmit={submit} className="space-y-5">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <Label htmlFor="hourly-rate">Default hourly rate (cents)</Label>
              <Input
                id="hourly-rate"
                type="number"
                min={0}
                value={card.defaultHourlyRateCents}
                onChange={(e) =>
                  setCard({ ...card, defaultHourlyRateCents: Number(e.target.value) })
                }
              />
              <p className="mt-1 text-xs text-ink-muted">
                Public price: ${(card.defaultHourlyRateCents / 100).toFixed(2)}/hr
              </p>
            </div>

            <div>
              <Label htmlFor="cancel-window">Cancel window (hours before start)</Label>
              <Input
                id="cancel-window"
                type="number"
                min={0}
                value={card.cancelWindowHours}
                onChange={(e) =>
                  setCard({ ...card, cancelWindowHours: Number(e.target.value) })
                }
              />
              <p className="mt-1 text-xs text-ink-muted">
                Cancels outside this window get a refund; inside is forfeit.
              </p>
            </div>

            <div>
              <Label htmlFor="increment">Booking increment (minutes)</Label>
              <Input
                id="increment"
                type="number"
                min={15}
                max={120}
                value={card.bookingIncrementMinutes}
                onChange={(e) =>
                  setCard({ ...card, bookingIncrementMinutes: Number(e.target.value) })
                }
              />
              <p className="mt-1 text-xs text-ink-muted">
                Bookings snap to multiples of this value.
              </p>
            </div>

            <div>
              <Label htmlFor="min-dur">Minimum duration (minutes)</Label>
              <Input
                id="min-dur"
                type="number"
                min={15}
                value={card.minDurationMinutes}
                onChange={(e) =>
                  setCard({ ...card, minDurationMinutes: Number(e.target.value) })
                }
              />
            </div>

            <div>
              <Label htmlFor="max-dur">Maximum duration (minutes)</Label>
              <Input
                id="max-dur"
                type="number"
                min={15}
                value={card.maxDurationMinutes}
                onChange={(e) =>
                  setCard({ ...card, maxDurationMinutes: Number(e.target.value) })
                }
              />
            </div>
          </div>

          <div className="text-xs text-ink-muted">
            Last updated {new Date(card.updatedAt).toLocaleString()}
          </div>

          <Button type="submit" disabled={busy}>
            {busy ? "Saving…" : "Save"}
          </Button>
        </form>
      )}
    </div>
  );
}
