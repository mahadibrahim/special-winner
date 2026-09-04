"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";
import { useHydrationBeacon } from "@/lib/hooks/use-hydration-beacon";
import { ErrorBanner } from "@/components/ui/error-banner";
import { EmptyState } from "@/components/ui/empty-state";
import { WEEK_ORDER, type DayKey } from "@/lib/leagues/division-filters";
import { balanceDays, type BalanceMode } from "@/lib/scheduling/balance-days";

const DAY_LABEL: Record<DayKey, string> = {
  mon: "Mon", tue: "Tue", wed: "Wed", thu: "Thu", fri: "Fri", sat: "Sat", sun: "Sun",
};

const NO_VENUE = "__none__";

interface Division {
  id: string;
  name: string;
  dayOfWeek: string | null;
  venueId: string | null;
}
interface Venue {
  id: string;
  name: string;
  fieldCount: number | null;
}

export function DayPlanner({
  programId,
  programName,
  divisions,
  venues,
}: {
  programId: string;
  programName: string;
  divisions: Division[];
  venues: Venue[];
}) {
  useHydrationBeacon();

  // Local day assignment per division; nothing persists until Save.
  const [assignments, setAssignments] = useState<Record<string, DayKey | null>>(() =>
    Object.fromEntries(divisions.map((d) => [d.id, (d.dayOfWeek as DayKey | null) ?? null])),
  );
  const [openDays, setOpenDays] = useState<Set<DayKey>>(() => new Set(WEEK_ORDER));
  const [mode, setMode] = useState<BalanceMode>("fill-empty");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Venue options: real venues, plus a "No venue set" bucket when any division
  // has no venue (so those divisions are still plannable — one venue per session).
  const hasNoVenue = divisions.some((d) => d.venueId == null);
  const venueOptions: Venue[] = [
    ...venues,
    ...(hasNoVenue ? [{ id: NO_VENUE, name: "No venue set", fieldCount: null }] : []),
  ];
  const [selectedVenue, setSelectedVenue] = useState<string>(venueOptions[0]?.id ?? NO_VENUE);
  const selected = venueOptions.find((v) => v.id === selectedVenue);
  const fieldCount = selected?.fieldCount ?? null;

  const divisionsForVenue = useMemo(
    () =>
      divisions.filter((d) =>
        selectedVenue === NO_VENUE ? d.venueId == null : d.venueId === selectedVenue,
      ),
    [divisions, selectedVenue],
  );

  // Per-day counts for the capacity strip.
  const perDay = useMemo(() => {
    const counts = new Map<DayKey, number>(WEEK_ORDER.map((d) => [d, 0]));
    for (const d of divisionsForVenue) {
      const day = assignments[d.id];
      if (day) counts.set(day, (counts.get(day) ?? 0) + 1);
    }
    return counts;
  }, [divisionsForVenue, assignments]);

  const unassignedCount = divisionsForVenue.filter((d) => !assignments[d.id]).length;

  function toggleDay(day: DayKey) {
    setOpenDays((prev) => {
      const next = new Set(prev);
      next.has(day) ? next.delete(day) : next.add(day);
      return next;
    });
  }

  function autoBalance() {
    const open = WEEK_ORDER.filter((d) => openDays.has(d));
    if (open.length === 0) {
      toast.error("Enable at least one day before auto-balancing.");
      return;
    }
    const result = balanceDays(
      divisionsForVenue.map((d) => ({ id: d.id, dayOfWeek: assignments[d.id] ?? null })),
      open,
      { mode },
    );
    setAssignments((prev) => {
      const next = { ...prev };
      for (const [id, day] of result) next[id] = day;
      return next;
    });
  }

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/programs/${programId}/division-days`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          assignments: divisionsForVenue.map((d) => ({
            seasonId: d.id,
            dayOfWeek: assignments[d.id] ?? null,
          })),
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `Save failed (${res.status})`);
      }
      toast.success("Division days saved.");
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Save failed.";
      setError(msg);
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="max-w-4xl mx-auto p-4 sm:p-6">
      <header className="mb-6">
        <a href="/admin/programs" className="text-xs text-ink-muted hover:text-ink">← Programs</a>
        <h1 className="font-display text-2xl text-ink mt-1">Day Planner</h1>
        <p className="text-sm text-ink-muted">{programName} · assign each division a day, balanced per venue.</p>
      </header>

      {error && <ErrorBanner message={error} className="mb-4" />}

      {divisions.length === 0 ? (
        <EmptyState
          title="No divisions yet"
          description="Create divisions for this program first, then plan their days here."
        />
      ) : (
        <>
          {/* Controls */}
          <div className="flex flex-wrap items-end gap-4 mb-5">
            <label className="text-sm">
              <span className="block text-[11px] uppercase tracking-wide text-ink-muted font-semibold mb-1">Venue</span>
              <select
                value={selectedVenue}
                onChange={(e) => setSelectedVenue(e.target.value)}
                className="border border-border rounded-md px-2 py-1.5 bg-paper text-ink"
              >
                {venueOptions.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.name}
                    {v.fieldCount != null ? ` (${v.fieldCount} field${v.fieldCount === 1 ? "" : "s"})` : ""}
                  </option>
                ))}
              </select>
            </label>

            <label className="text-sm">
              <span className="block text-[11px] uppercase tracking-wide text-ink-muted font-semibold mb-1">Auto-balance mode</span>
              <select
                value={mode}
                onChange={(e) => setMode(e.target.value as BalanceMode)}
                className="border border-border rounded-md px-2 py-1.5 bg-paper text-ink"
              >
                <option value="fill-empty">Fill empty only</option>
                <option value="rebalance">Rebalance all</option>
              </select>
            </label>

            <button
              type="button"
              onClick={autoBalance}
              className="text-xs font-semibold tracking-wide uppercase border border-ink text-ink hover:bg-ink hover:text-cream px-3 py-2 rounded-md transition-colors"
            >
              Auto-balance
            </button>

            <button
              type="button"
              onClick={save}
              disabled={saving}
              className="text-xs font-semibold tracking-wide uppercase bg-ink text-cream hover:bg-primary-bright hover:text-primary-foreground px-3 py-2 rounded-md transition-colors disabled:opacity-50"
            >
              {saving ? "Saving…" : "Save"}
            </button>
          </div>

          {/* Open-days toggles */}
          <div className="mb-4">
            <span className="block text-[11px] uppercase tracking-wide text-ink-muted font-semibold mb-1">Open days (auto-balance targets these)</span>
            <div className="flex flex-wrap gap-1.5">
              {WEEK_ORDER.map((day) => (
                <button
                  key={day}
                  type="button"
                  onClick={() => toggleDay(day)}
                  aria-pressed={openDays.has(day)}
                  className={
                    "text-xs font-semibold px-2.5 py-1 rounded-full border transition-colors " +
                    (openDays.has(day)
                      ? "bg-ink text-cream border-ink"
                      : "bg-paper text-ink-muted border-border")
                  }
                >
                  {DAY_LABEL[day]}
                </button>
              ))}
            </div>
          </div>

          {/* Capacity strip */}
          <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-7 gap-2 mb-5">
            {WEEK_ORDER.filter((d) => openDays.has(d)).map((day) => {
              const n = perDay.get(day) ?? 0;
              const over = fieldCount != null && n > fieldCount;
              return (
                <div
                  key={day}
                  className={
                    "rounded-md border px-2 py-1.5 text-center " +
                    (over ? "border-amber-400 bg-amber-50" : "border-border bg-paper")
                  }
                >
                  <div className="text-[11px] uppercase tracking-wide text-ink-muted font-semibold">{DAY_LABEL[day]}</div>
                  <div className={"text-sm font-display " + (over ? "text-amber-700" : "text-ink")}>
                    {n}
                    {fieldCount != null ? ` / ${fieldCount}` : ""}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Division rows */}
          {divisionsForVenue.length === 0 ? (
            <EmptyState
              title="No divisions on this venue"
              description="Switch venue above to plan divisions assigned elsewhere."
            />
          ) : (
            <div className="border border-border rounded-lg divide-y divide-border">
              {unassignedCount > 0 && (
                <div className="px-3 py-2 text-[11px] uppercase tracking-wide text-ink-muted bg-cream-2">
                  {unassignedCount} unassigned
                </div>
              )}
              {divisionsForVenue.map((d) => (
                <div key={d.id} className="flex items-center justify-between gap-3 px-3 py-2.5">
                  <span className="text-sm text-ink truncate">{d.name}</span>
                  <select
                    value={assignments[d.id] ?? ""}
                    onChange={(e) =>
                      setAssignments((prev) => ({
                        ...prev,
                        [d.id]: e.target.value ? (e.target.value as DayKey) : null,
                      }))
                    }
                    className="border border-border rounded-md px-2 py-1 bg-paper text-ink text-sm shrink-0"
                  >
                    <option value="">Unassigned</option>
                    {WEEK_ORDER.map((day) => (
                      <option key={day} value={day}>{DAY_LABEL[day]}</option>
                    ))}
                  </select>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
