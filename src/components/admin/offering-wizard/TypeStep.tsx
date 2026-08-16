"use client";
import { OFFERING_TYPES, type OfferingType } from "@/lib/admin/offering-types";
import type { Audience } from "@/lib/programs/derive";

const ORDER: OfferingType[] = ["camp", "tournament", "league"];

const AUDIENCES: { key: Audience; label: string; hint: string }[] = [
  { key: "youth", label: "Youth", hint: "Parents register their kids" },
  { key: "adult", label: "Adult", hint: "Players register themselves" },
];

export function TypeStep({
  value,
  audience,
  onSelect,
  onAudience,
}: {
  value: OfferingType | null;
  // Null until the admin actively picks one — see OfferingDraft.audience.
  audience: Audience | null;
  onSelect: (t: OfferingType) => void;
  onAudience: (a: Audience) => void;
}) {
  return (
    <div className="space-y-6">
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

      <div className="space-y-2">
        <div className="text-[11px] font-semibold tracking-[0.15em] uppercase text-ink-muted">
          Who is it for?
        </div>
        <div className="grid grid-cols-2 gap-3">
          {AUDIENCES.map((a) => (
            <button
              key={a.key}
              type="button"
              onClick={() => onAudience(a.key)}
              aria-pressed={audience === a.key}
              className={`text-left p-3 rounded-xl border transition-colors ${
                audience === a.key ? "border-ink bg-cream-2" : "border-border bg-paper hover:bg-cream-2"
              }`}
            >
              <div className="font-medium text-ink">{a.label}</div>
              <div className="text-xs text-ink-muted">{a.hint}</div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
