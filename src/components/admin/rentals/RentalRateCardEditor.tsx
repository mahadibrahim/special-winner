"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ErrorBanner } from "@/components/ui/error-banner";
import { LoadingSkeleton } from "@/components/ui/loading-skeleton";
import { useHydrationBeacon } from "@/lib/hooks/use-hydration-beacon";
import { toast } from "sonner";
import { RENTAL_RATE_SCHEDULE } from "@/lib/rentals/soccerone-pricing";

interface RateCard {
  defaultHourlyRateCents: number;
  cancelWindowHours: number;
  bookingIncrementMinutes: number;
  minDurationMinutes: number;
  maxDurationMinutes: number;
  depositPct: number;
  balanceDueLeadDays: number;
  blockHoldHours: number;
  quoteMarkerTtlDays: number;
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
          depositPct: card.depositPct,
          balanceDueLeadDays: card.balanceDueLeadDays,
          blockHoldHours: card.blockHoldHours,
          quoteMarkerTtlDays: card.quoteMarkerTtlDays,
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

      {/* SoccerOne tiered-rate schedule — read-only, informational */}
      <div className="rounded-lg border border-border bg-cream-50 p-4 space-y-3">
        <div>
          <h2 className="text-sm font-semibold text-ink">
            SoccerOne (gosoccerone.com) — tiered rental schedule
          </h2>
          <p className="mt-1 text-xs text-ink-muted">
            SoccerOne field rentals use this fixed seasonal / time-of-day schedule, defined in
            code. To change these rates, update{" "}
            <code className="font-mono bg-cream-100 px-1 rounded">
              src/lib/rentals/soccerone-pricing.ts
            </code>{" "}
            (changes are infrequent). The default hourly rate below applies to non-SoccerOne
            (Aspire) rentals; the cancel window applies to all.
          </p>
        </div>

        <table className="w-full text-xs border-collapse">
          <thead>
            <tr className="text-left text-ink-muted">
              <th className="py-1 pr-4 font-medium">Season</th>
              <th className="py-1 pr-4 font-medium">Weekday before 3 pm</th>
              <th className="py-1 pr-4 font-medium">Weekday 3–6 pm</th>
              <th className="py-1 font-medium">After 6 pm &amp; weekends</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            <tr>
              <td className="py-1.5 pr-4 font-medium text-ink">Apr – Sep</td>
              <td className="py-1.5 pr-4 text-ink">
                ${RENTAL_RATE_SCHEDULE.summer.before3 / 100}/hr
              </td>
              <td className="py-1.5 pr-4 text-ink">
                ${RENTAL_RATE_SCHEDULE.summer.midday / 100}/hr
              </td>
              <td className="py-1.5 text-ink">
                ${RENTAL_RATE_SCHEDULE.summer.evening / 100}/hr
              </td>
            </tr>
            <tr>
              <td className="py-1.5 pr-4 font-medium text-ink">Oct – Mar</td>
              <td className="py-1.5 pr-4 text-ink">
                ${RENTAL_RATE_SCHEDULE.winter.before3 / 100}/hr
              </td>
              <td className="py-1.5 pr-4 text-ink">
                ${RENTAL_RATE_SCHEDULE.winter.midday / 100}/hr
              </td>
              <td className="py-1.5 text-ink">
                ${RENTAL_RATE_SCHEDULE.winter.evening / 100}/hr
              </td>
            </tr>
          </tbody>
        </table>
      </div>

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

          <fieldset className="rounded-lg border border-border p-4 space-y-4">
            <legend className="px-1 text-sm font-semibold text-ink">Recurring blocks</legend>
            <p className="text-xs text-ink-muted">
              Defaults for multi-month rental blocks. They apply when a block is built;
              changing them never re-prices a block that already exists.
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="deposit-pct">Deposit percent</Label>
                <Input
                  id="deposit-pct"
                  type="number"
                  step="1"
                  min={0}
                  max={100}
                  value={card.depositPct}
                  onChange={(e) => setCard({ ...card, depositPct: Number(e.target.value) })}
                />
                <p className="mt-1 text-xs text-ink-muted">
                  What a renter pays to hold a whole block. The builder can override this
                  per deal.
                </p>
              </div>

              <div>
                <Label htmlFor="balance-lead">Balance due lead (days)</Label>
                <Input
                  id="balance-lead"
                  type="number"
                  step="1"
                  min={0}
                  max={180}
                  value={card.balanceDueLeadDays}
                  onChange={(e) =>
                    setCard({ ...card, balanceDueLeadDays: Number(e.target.value) })
                  }
                />
                <p className="mt-1 text-xs text-ink-muted">
                  How far before the first session the balance is due. Reminders go out at
                  T-14, T-3, and once when overdue.
                </p>
              </div>

              <div>
                <Label htmlFor="block-hold">Deposit hold (hours)</Label>
                <Input
                  id="block-hold"
                  type="number"
                  step="1"
                  min={1}
                  max={336}
                  value={card.blockHoldHours}
                  onChange={(e) =>
                    setCard({ ...card, blockHoldHours: Number(e.target.value) })
                  }
                />
                <p className="mt-1 text-xs text-ink-muted">
                  How long every session in a block stays held while the deposit is unpaid.
                  The block expires as a unit when it lapses.
                </p>
              </div>

              <div>
                <Label htmlFor="quote-ttl">Quote marker TTL (days)</Label>
                <Input
                  id="quote-ttl"
                  type="number"
                  step="1"
                  min={1}
                  max={90}
                  value={card.quoteMarkerTtlDays}
                  onChange={(e) =>
                    setCard({ ...card, quoteMarkerTtlDays: Number(e.target.value) })
                  }
                />
                <p className="mt-1 text-xs text-ink-muted">
                  How long a draft quote shows as &ldquo;also quoted&rdquo; on the calendar.
                  Markers never block a booking, they only make contention visible.
                </p>
              </div>
            </div>
          </fieldset>

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
