"use client";

import { Label } from "@/components/ui/label";
import { formatDollars } from "./format";
import type { BlockDiscount, PreviewQuote } from "./types";

interface PricePanelProps {
  quote: PreviewQuote;
  discount: BlockDiscount;
  depositPct: number;
  blockHoldHours: number;
  balanceDueLeadDays: number;
  /**
   * Derived server-side as first session − balance lead days, so it is shown
   * rather than edited: the create endpoint recomputes it either way.
   */
  balanceDueLabel: string;
  onChange: (patch: { discount?: BlockDiscount; depositPct?: number }) => void;
}

export function PricePanel({
  quote,
  discount,
  depositPct,
  blockHoldHours,
  balanceDueLeadDays,
  balanceDueLabel,
  onChange,
}: PricePanelProps) {
  const discountKind = discount?.kind ?? "percent";
  // Discount is entered in whole dollars; a flat discount stores cents, so the
  // input divides by 100 on the way out and multiplies on the way in.
  const discountInput =
    discount === null ? "" : String(discountKind === "percent" ? discount.value : discount.value / 100);

  const setDiscountValue = (raw: string) => {
    if (raw === "") {
      onChange({ discount: null });
      return;
    }
    const n = Math.max(0, Math.floor(Number(raw) || 0));
    onChange({
      discount: { kind: discountKind, value: discountKind === "percent" ? n : n * 100 },
    });
  };

  const setDiscountKind = (kind: "percent" | "amount") => {
    if (discount === null) {
      onChange({ discount: { kind, value: 0 } });
      return;
    }
    // Values do not carry across kinds: 10 percent is not $10.
    onChange({ discount: { kind, value: 0 } });
  };

  return (
    <section className="rounded-xl border border-border bg-cream-2 p-5 space-y-4">
      <h2 className="font-semibold text-ink">Price</h2>

      <dl className="space-y-2 text-sm">
        <div className="flex items-center justify-between gap-4">
          <dt className="text-ink-muted">Subtotal (rate card)</dt>
          <dd className="text-ink font-medium">{formatDollars(quote.subtotalCents)}</dd>
        </div>

        <div className="flex items-center justify-between gap-4">
          <dt className="text-ink-muted flex items-center gap-2">
            <Label htmlFor="block-discount">Discount</Label>
            <input
              id="block-discount"
              type="number"
              min="0"
              step="1"
              value={discountInput}
              onChange={(e) => setDiscountValue(e.target.value)}
              className="w-20 rounded border border-border px-2 py-1 text-sm bg-cream"
            />
            <select
              value={discountKind}
              aria-label="Discount kind"
              onChange={(e) => setDiscountKind(e.target.value as "percent" | "amount")}
              className="rounded border border-border px-2 py-1 text-sm bg-cream"
            >
              <option value="percent">%</option>
              <option value="amount">$</option>
            </select>
          </dt>
          <dd className="text-ink">
            {quote.discountCents > 0 ? `−${formatDollars(quote.discountCents)}` : "–"}
          </dd>
        </div>

        <div className="flex items-center justify-between gap-4 border-t border-border pt-2">
          <dt className="font-medium text-ink">Block total</dt>
          <dd className="font-semibold text-ink">{formatDollars(quote.totalCents)}</dd>
        </div>

        <div className="flex items-center justify-between gap-4">
          <dt className="text-ink-muted flex items-center gap-2">
            <Label htmlFor="block-deposit-pct">Deposit</Label>
            <input
              id="block-deposit-pct"
              type="number"
              min="0"
              max="100"
              step="1"
              value={depositPct}
              onChange={(e) =>
                onChange({
                  depositPct: Math.min(100, Math.max(0, Math.floor(Number(e.target.value) || 0))),
                })
              }
              className="w-20 rounded border border-border px-2 py-1 text-sm bg-cream"
            />
            <span>%</span>
          </dt>
          <dd className="text-ink">{formatDollars(quote.depositDueCents)}</dd>
        </div>

        <div className="flex items-center justify-between gap-4">
          <dt className="text-ink-muted">
            Balance
            {balanceDueLabel && (
              <span className="text-xs"> · due {balanceDueLabel}</span>
            )}
          </dt>
          <dd className="text-ink">{formatDollars(quote.balanceDueCents)}</dd>
        </div>
      </dl>

      <p className="text-xs text-ink-muted">
        An unpaid deposit link holds every session for {blockHoldHours} hours. The balance falls
        due {balanceDueLeadDays} days before the first session.
      </p>
    </section>
  );
}
