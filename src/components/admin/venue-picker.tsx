"use client";

import { useEffect, useState, useTransition } from "react";
import { ChevronDown, MapPin, Check } from "lucide-react";
import { cn } from "@/lib/utils";

interface Venue {
  id: string;
  name: string;
}

interface PickerState {
  venues: Venue[];
  activeLocationId: string | null;
}

/**
 * Top-bar venue picker mounted by `AdminLayout`. Self-fetches its own
 * state from `GET /api/admin/active-venue` so the .astro pages don't
 * have to thread props through every admin route.
 *
 * State lives in a cookie, written by `POST /api/admin/active-venue`.
 * After a set/clear we `location.reload()` so every server-rendered
 * surface picks up the new scope on the next request — simpler than
 * threading the active venue through every client island, and matches
 * the existing pattern where layout state comes from the server
 * (auth, org, brand all do the same thing).
 *
 * Hides itself entirely when the caller has fewer than two pickable
 * venues — there's nothing to pick.
 */
export function VenuePicker() {
  const [state, setState] = useState<PickerState | null>(null);
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    let cancelled = false;
    fetch("/api/admin/active-venue")
      .then((r) => (r.ok ? r.json() : null))
      .then((data: PickerState | null) => {
        if (!cancelled && data) setState(data);
      })
      .catch(() => {
        // Picker is non-essential UI; a fetch failure means we just
        // don't render. Don't log noise — the network tab is enough
        // for anyone debugging.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!state || state.venues.length === 0) return null;

  const { venues, activeLocationId } = state;
  const active = venues.find((v) => v.id === activeLocationId);
  const label = active?.name ?? "All venues";

  function pick(locationId: string | null) {
    setOpen(false);
    startTransition(async () => {
      const res = await fetch("/api/admin/active-venue", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ locationId }),
      });
      if (res.ok) {
        // Full reload so server-side queries re-run with the new
        // cookie. A SPA-style refresh would miss .astro pages that
        // read activeLocationId in their frontmatter.
        window.location.reload();
      }
    });
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        disabled={isPending}
        className={cn(
          "flex items-center gap-2 rounded-md border border-border bg-white px-3 py-1.5 text-sm font-medium text-ink hover:bg-cream transition-colors min-h-[36px]",
          isPending && "opacity-60 cursor-wait",
        )}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <MapPin className="h-4 w-4 text-ink-muted" />
        <span className="max-w-[180px] truncate">{label}</span>
        <ChevronDown className="h-4 w-4 text-ink-muted" />
      </button>

      {open && (
        <>
          {/* Click-outside backdrop. Sits below the menu in z so it
              receives the dismiss click but doesn't visually intrude. */}
          <div
            className="fixed inset-0 z-40"
            onClick={() => setOpen(false)}
            aria-hidden="true"
          />
          <ul
            role="listbox"
            className="absolute right-0 top-full mt-1 z-50 min-w-[220px] rounded-md border border-border bg-white shadow-lg py-1 max-h-80 overflow-y-auto"
          >
            <li>
              <button
                type="button"
                role="option"
                aria-selected={activeLocationId === null}
                onClick={() => pick(null)}
                className={cn(
                  "w-full text-left px-3 py-2 text-sm flex items-center justify-between hover:bg-cream",
                  activeLocationId === null && "bg-cream/60",
                )}
              >
                <span>All venues</span>
                {activeLocationId === null && (
                  <Check className="h-4 w-4 text-primary" />
                )}
              </button>
            </li>
            <li className="border-t border-border my-1" aria-hidden="true" />
            {venues.map((v) => (
              <li key={v.id}>
                <button
                  type="button"
                  role="option"
                  aria-selected={activeLocationId === v.id}
                  onClick={() => pick(v.id)}
                  className={cn(
                    "w-full text-left px-3 py-2 text-sm flex items-center justify-between hover:bg-cream",
                    activeLocationId === v.id && "bg-cream/60",
                  )}
                >
                  <span className="truncate">{v.name}</span>
                  {activeLocationId === v.id && (
                    <Check className="h-4 w-4 text-primary flex-shrink-0" />
                  )}
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
