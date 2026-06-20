"use client";
import { OFFERING_TYPES, type OfferingType } from "@/lib/admin/offering-types";

const ORDER: OfferingType[] = ["camp", "tournament", "league"];

export function TypeStep({
  value,
  onSelect,
}: {
  value: OfferingType | null;
  onSelect: (t: OfferingType) => void;
}) {
  return (
    <div className="space-y-3">
      {ORDER.map((t) => {
        const cfg = OFFERING_TYPES[t];
        const active = value === t;
        return (
          <button
            key={t}
            type="button"
            onClick={() => onSelect(t)}
            aria-pressed={active}
            className={`w-full text-left p-4 rounded-xl border transition-colors ${
              active ? "border-ink bg-cream-2" : "border-border bg-paper hover:bg-cream-2"
            }`}
          >
            <div className="text-lg font-medium text-ink">{cfg.label}</div>
            <div className="text-sm text-ink-muted">{cfg.description}</div>
          </button>
        );
      })}
    </div>
  );
}
