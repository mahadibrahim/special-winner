"use client";

import { useEffect, useMemo, useState } from "react";
import { ErrorBanner } from "@/components/ui/error-banner";
import { EmptyState } from "@/components/ui/empty-state";
import { LoadingSkeleton } from "@/components/ui/loading-skeleton";
import { useHydrationBeacon } from "@/lib/hooks/use-hydration-beacon";
import { zonedMinuteToUtc } from "@/lib/activity-tracking/tz-day";
import {
  classifySlot,
  dayHourWindow,
  dayPrimeFill,
  hourLabel,
  indexByField,
  monthDates,
  monthLeadingBlanks,
  monthRange,
  monthTitle,
  shiftMonth,
  SLOT_GLYPH,
  SLOT_WORD,
  type CalendarMonth,
  type CalendarPayload,
  type SlotState,
} from "@/lib/rentals/calendar-view";
import type { LocationOption } from "./blocks/types";

/**
 * Month-at-a-glance for one location: each day cell carries a prime-time fill
 * bar and the count of open hours, and clicking a day opens an hour x field
 * table for it.
 *
 * One fetch per visible month; the day drill-in re-uses the same payload rather
 * than asking again. Read-only in v1 - there is no drag-to-create here.
 */

const WEEKDAY_HEADS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const CELL_CLASS: Record<SlotState, string> = {
  // Pinned palette values: SoccerOne's BrandTheme inverts the accent tokens, so
  // an accent used as a background or a foreground washes out on one brand.
  open: "bg-emerald-50 text-emerald-800 border-emerald-200",
  rental: "bg-stone-100 text-stone-700 border-stone-300",
  quoted: "bg-amber-50 text-amber-900 border-amber-200",
  reserved: "bg-rose-50 text-rose-900 border-rose-200",
};

interface RentalCalendarProps {
  locations: LocationOption[];
  /** Org IANA timezone - the endpoint re-anchors to the location's own zone. */
  timeZone: string;
}

function todayMonth(timeZone: string): CalendarMonth {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
  }).formatToParts(new Date());
  const year = Number(parts.find((p) => p.type === "year")?.value ?? "2000");
  const month = Number(parts.find((p) => p.type === "month")?.value ?? "1") - 1;
  return { year, month };
}

export function RentalCalendar({ locations, timeZone }: RentalCalendarProps) {
  useHydrationBeacon();

  const [locationId, setLocationId] = useState(locations[0]?.id ?? "");
  const [month, setMonth] = useState<CalendarMonth>(() => todayMonth(timeZone));
  const [openDate, setOpenDate] = useState<string | null>(null);

  const [payload, setPayload] = useState<CalendarPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!locationId) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      setError(null);
      setOpenDate(null);
      try {
        const { from, to } = monthRange(month);
        const params = new URLSearchParams({ locationId, from, to });
        const res = await fetch(`/api/admin/rentals/calendar?${params.toString()}`);
        const json = await res.json();
        if (cancelled) return;
        if (!res.ok) {
          setError(json.error ?? `HTTP ${res.status}`);
          setPayload(null);
          return;
        }
        setPayload(json as CalendarPayload);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load");
          setPayload(null);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [locationId, month]);

  const index = useMemo(
    () => indexByField(payload ?? { busy: [], quotes: [] }),
    [payload],
  );

  const fills = useMemo(() => {
    if (!payload) return [];
    return monthDates(month).map((date) =>
      dayPrimeFill(index, payload.venues, date, payload.timeZone),
    );
  }, [payload, index, month]);

  // Hour x field table for the expanded day. Rows are the location's rental
  // window; columns are every field of every rental venue.
  const drillIn = useMemo(() => {
    if (!payload || !openDate) return null;
    const { openMinute, closeMinute } = dayHourWindow(payload.venues);
    const columns = payload.venues.flatMap((v) =>
      v.fieldNumbers.map((fieldNumber) => ({
        key: `${v.id}|${fieldNumber}`,
        venueId: v.id,
        venueName: v.name,
        fieldNumber,
      })),
    );
    const rows: Array<{
      minute: number;
      cells: Array<{ key: string; state: SlotState; label: string | null }>;
    }> = [];
    for (let minute = openMinute; minute < closeMinute; minute += 60) {
      const startMs = zonedMinuteToUtc(openDate, minute, payload.timeZone).getTime();
      const endMs = zonedMinuteToUtc(openDate, minute + 60, payload.timeZone).getTime();
      rows.push({
        minute,
        cells: columns.map((c) => {
          const status = classifySlot(index, c.venueId, c.fieldNumber, startMs, endMs);
          return { key: c.key, state: status.state, label: status.label };
        }),
      });
    }
    return { columns, rows };
  }, [payload, openDate, index]);

  const leading = monthLeadingBlanks(month);

  return (
    <section className="space-y-4">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-ink">Month grid</h2>
          <p className="text-sm text-ink-muted mt-1">
            Prime-time fill (6 PM to midnight) per day. Click a day for the hour-by-field
            detail.
          </p>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <div>
            <label
              htmlFor="calendar-location"
              className="block text-xs text-ink-muted mb-1"
            >
              Location
            </label>
            <select
              id="calendar-location"
              value={locationId}
              onChange={(e) => setLocationId(e.target.value)}
              className="rounded border border-border bg-cream px-3 py-2 text-sm min-h-[40px]"
            >
              {locations.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
            </select>
          </div>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setMonth((m) => shiftMonth(m, -1))}
              aria-label="Previous month"
              className="rounded border border-border bg-cream px-3 py-2 text-sm font-semibold text-ink-muted hover:bg-cream-2 min-h-[40px] min-w-[40px]"
            >
              &lsaquo;
            </button>
            <span className="px-2 text-sm font-semibold text-ink whitespace-nowrap">
              {monthTitle(month)}
            </span>
            <button
              type="button"
              onClick={() => setMonth((m) => shiftMonth(m, 1))}
              aria-label="Next month"
              className="rounded border border-border bg-cream px-3 py-2 text-sm font-semibold text-ink-muted hover:bg-cream-2 min-h-[40px] min-w-[40px]"
            >
              &rsaquo;
            </button>
          </div>
        </div>
      </header>

      {error && <ErrorBanner message={error} />}
      {loading && <LoadingSkeleton />}

      {!loading && !error && payload && payload.venues.length === 0 && (
        <EmptyState
          title="No rental venues here"
          description="Enable rentals on a venue at this location to see its inventory."
        />
      )}

      {!loading && !error && payload && payload.venues.length > 0 && (
        <div className="rounded-lg border border-border bg-cream-2 p-3 overflow-x-auto">
          <div className="min-w-[640px]">
            <div className="grid grid-cols-7 gap-1 mb-1">
              {WEEKDAY_HEADS.map((d) => (
                <div
                  key={d}
                  className="text-[11px] font-semibold uppercase tracking-wider text-ink-muted text-center py-1"
                >
                  {d}
                </div>
              ))}
            </div>
            <div className="grid grid-cols-7 gap-1">
              {Array.from({ length: leading }, (_, i) => (
                <div key={`blank-${i}`} aria-hidden />
              ))}
              {fills.map((fill) => {
                const dayNumber = Number(fill.date.slice(8));
                const selected = openDate === fill.date;
                return (
                  <button
                    type="button"
                    key={fill.date}
                    onClick={() => setOpenDate(selected ? null : fill.date)}
                    aria-pressed={selected}
                    aria-label={`${fill.date}, ${fill.openHours} open prime-time hours`}
                    className={`rounded border p-1.5 text-left transition-colors min-h-[64px] ${
                      selected
                        ? "border-ink bg-cream"
                        : "border-border bg-cream hover:bg-cream-2"
                    }`}
                  >
                    <div className="text-xs font-semibold text-ink">{dayNumber}</div>
                    <div
                      className="mt-1 h-1.5 w-full rounded-full bg-emerald-100 overflow-hidden"
                      aria-hidden
                    >
                      <div
                        className="h-full bg-stone-500"
                        style={{ width: `${Math.round(fill.fillRatio * 100)}%` }}
                      />
                    </div>
                    <div className="mt-1 text-[11px] text-ink-muted">
                      {fill.openHours} open
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {drillIn && openDate && (
        <div className="rounded-lg border border-border bg-cream-2 p-4 space-y-3">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <h3 className="text-sm font-semibold text-ink">{openDate}</h3>
            <button
              type="button"
              onClick={() => setOpenDate(null)}
              className="text-xs text-ink-muted underline hover:text-ink"
            >
              Close
            </button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="text-left text-ink-muted">
                  <th className="py-1 pr-3 font-medium whitespace-nowrap">Hour</th>
                  {drillIn.columns.map((c) => (
                    <th key={c.key} className="py-1 px-1 font-medium whitespace-nowrap">
                      {c.venueName} · {c.fieldNumber}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {drillIn.rows.map((row) => (
                  <tr key={row.minute}>
                    <th
                      scope="row"
                      className="py-1 pr-3 text-left font-normal text-ink-muted whitespace-nowrap"
                    >
                      {hourLabel(row.minute)}
                    </th>
                    {row.cells.map((cell, i) => (
                      <td key={`${row.minute}-${drillIn.columns[i].key}`} className="p-0.5">
                        <div
                          className={`rounded border px-1.5 py-1 truncate ${CELL_CLASS[cell.state]}`}
                          title={`${SLOT_WORD[cell.state]}${cell.label ? `: ${cell.label}` : ""}`}
                        >
                          <span className="font-mono mr-1" aria-hidden>
                            {SLOT_GLYPH[cell.state]}
                          </span>
                          {cell.label ?? SLOT_WORD[cell.state]}
                        </div>
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </section>
  );
}
