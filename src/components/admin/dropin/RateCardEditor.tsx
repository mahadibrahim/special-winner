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
  defaultSessionRateCents: number;
  defaultMemberRateCents: number;
  defaultWalkUpRateCents: number;
  cancelWindowHours: number;
  promotionWindowMinutes: number;
  updatedAt: string;
  updatedByUserId: string | null;
}

export function RateCardEditor() {
  useHydrationBeacon();

  const [card, setCard] = useState<RateCard | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reload = async () => {
    try {
      const res = await fetch("/api/admin/dropin/rate-card");
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
      const res = await fetch("/api/admin/dropin/rate-card", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          defaultSessionRateCents: card.defaultSessionRateCents,
          defaultMemberRateCents: card.defaultMemberRateCents,
          defaultWalkUpRateCents: card.defaultWalkUpRateCents,
          cancelWindowHours: card.cancelWindowHours,
          promotionWindowMinutes: card.promotionWindowMinutes,
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
        <h1 className="text-2xl font-bold text-ink">Drop-in rate card</h1>
        <p className="text-sm text-ink-muted mt-1">
          Org defaults applied when a session row doesn't override a rate.
        </p>
      </header>

      {error && <ErrorBanner message={error} />}

      {card && (
        <form onSubmit={submit} className="space-y-5">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <Label htmlFor="session-rate">Default session rate (cents)</Label>
              <Input
                id="session-rate"
                type="number"
                min={0}
                value={card.defaultSessionRateCents}
                onChange={(e) =>
                  setCard({
                    ...card,
                    defaultSessionRateCents: Number(e.target.value),
                  })
                }
              />
              <p className="mt-1 text-xs text-ink-muted">
                Public price: ${(card.defaultSessionRateCents / 100).toFixed(2)}
              </p>
            </div>
            <div>
              <Label htmlFor="member-rate">Default member rate (cents)</Label>
              <Input
                id="member-rate"
                type="number"
                min={0}
                value={card.defaultMemberRateCents}
                onChange={(e) =>
                  setCard({
                    ...card,
                    defaultMemberRateCents: Number(e.target.value),
                  })
                }
              />
              <p className="mt-1 text-xs text-ink-muted">
                Member price (after allotment exhausted): $
                {(card.defaultMemberRateCents / 100).toFixed(2)}
              </p>
            </div>
            <div>
              <Label htmlFor="walkup-rate">Default walk-up rate (cents)</Label>
              <Input
                id="walkup-rate"
                type="number"
                min={0}
                value={card.defaultWalkUpRateCents}
                onChange={(e) =>
                  setCard({
                    ...card,
                    defaultWalkUpRateCents: Number(e.target.value),
                  })
                }
              />
              <p className="mt-1 text-xs text-ink-muted">
                In-person walk-in price: ${(card.defaultWalkUpRateCents / 100).toFixed(2)}
              </p>
            </div>
            <div>
              <Label htmlFor="cancel-window">
                Cancel window (hours before start)
              </Label>
              <Input
                id="cancel-window"
                type="number"
                min={0}
                value={card.cancelWindowHours}
                onChange={(e) =>
                  setCard({
                    ...card,
                    cancelWindowHours: Number(e.target.value),
                  })
                }
              />
              <p className="mt-1 text-xs text-ink-muted">
                Cancels outside this window get a refund; inside is forfeit.
              </p>
            </div>
            <div>
              <Label htmlFor="promo-window">Promotion window (minutes)</Label>
              <Input
                id="promo-window"
                type="number"
                min={1}
                max={1440}
                value={card.promotionWindowMinutes}
                onChange={(e) =>
                  setCard({
                    ...card,
                    promotionWindowMinutes: Number(e.target.value),
                  })
                }
              />
              <p className="mt-1 text-xs text-ink-muted">
                When a spot opens, the next waitlister has this long to claim.
              </p>
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
