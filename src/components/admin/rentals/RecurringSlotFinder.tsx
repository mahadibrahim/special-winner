"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ErrorBanner } from "@/components/ui/error-banner";
import { EmptyState } from "@/components/ui/empty-state";
import { LoadingSkeleton } from "@/components/ui/loading-skeleton";
import { useHydrationBeacon } from "@/lib/hooks/use-hydration-beacon";
import { generateBlockSessions } from "@/lib/rentals/blocks/generate";
import {
  classifySlot,
  indexByField,
  summarizeCounts,
  tallyStates,
  SLOT_GLYPH,
  SLOT_WORD,
  type CalendarPayload,
  type SlotState,
} from "@/lib/rentals/calendar-view";
import { minuteToTimeInput, timeInputToMinute, weekdayLabel } from "./blocks/format";
import type { LocationOption } from "./blocks/types";

/**
 * The screen that answers a winter inquiry: "is Tuesday 8pm free all winter,
 * and who else has asked for it?"
 *
 * Candidate instants come from `generateBlockSessions` - the same generator the
 * block builder uses - so the finder and the builder can never disagree about
 * which moments a pattern means, DST Sundays included. Occupancy is derived
 * client-side from one range fetch.
 *
 * Read-only in v1: the only action is a link that carries the pattern into the
 * builder.
 */

const WEEKDAYS = [0, 1, 2, 3, 4, 5, 6];

const GLYPH_CLASS: Record<SlotState, string> = {
  // Text colours only - accent tokens invert under SoccerOne's BrandTheme and
  // wash out as foreground. These are pinned palette values for that reason.
  open: "text-emerald-700",
  rental: "text-ink-muted",
  quoted: "text-amber-700",
  reserved: "text-rose-700",
};

interface Cell {
  date: string;
  startsAt: Date;
  endsAt: Date;
  state: SlotState;
  label: string | null;
}

interface Strip {
  key: string;
  venueId: string;
  venueName: string;
  fieldNumber: number;
  cells: Cell[];
}

interface RecurringSlotFinderProps {
  locations: LocationOption[];
  /** Org IANA timezone - the endpoint re-anchors to the location's own zone. */
  timeZone: string;
}

export function RecurringSlotFinder({ locations, timeZone }: RecurringSlotFinderProps) {
  useHydrationBeacon();

  const [locationId, setLocationId] = useState(locations[0]?.id ?? "");
  const [weekday, setWeekday] = useState(2); // Tuesday - the winter question
  const [startTime, setStartTime] = useState(minuteToTimeInput(1200)); // 8:00 PM
  const [durationMinutes, setDurationMinutes] = useState(60);
  const [firstDate, setFirstDate] = useState("");
  const [lastDate, setLastDate] = useState("");

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [payload, setPayload] = useState<CalendarPayload | null>(null);
  const [searched, setSearched] = useState<{
    weekday: number;
    startMinute: number;
    durationMinutes: number;
    firstDate: string;
    lastDate: string;
    locationId: string;
  } | null>(null);

  const run = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!locationId) return setError("Pick a location");
    if (!firstDate || !lastDate) return setError("Pick a first and last date");
    if (lastDate < firstDate) return setError("The last date must not precede the first");

    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ locationId, from: firstDate, to: lastDate });
      const res = await fetch(`/api/admin/rentals/calendar?${params.toString()}`);
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? `HTTP ${res.status}`);
        setPayload(null);
        return;
      }
      setPayload(json as CalendarPayload);
      setSearched({
        weekday,
        startMinute: timeInputToMinute(startTime),
        durationMinutes,
        firstDate,
        lastDate,
        locationId,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
      setPayload(null);
    } finally {
      setLoading(false);
    }
  };

  const strips: Strip[] = useMemo(() => {
    if (!payload || !searched) return [];
    if (payload.venues.length === 0) return [];

    const index = indexByField(payload);
    const sessions = generateBlockSessions({
      timeZone: payload.timeZone,
      firstDate: searched.firstDate,
      lastDate: searched.lastDate,
      days: [
        {
          weekday: searched.weekday,
          startMinute: searched.startMinute,
          durationMinutes: searched.durationMinutes,
          venueIds: payload.venues.map((v) => v.id),
        },
      ],
    });

    const out: Strip[] = [];
    for (const venue of payload.venues) {
      const venueSessions = sessions.filter((s) => s.venueId === venue.id);
      for (const fieldNumber of venue.fieldNumbers) {
        out.push({
          key: `${venue.id}|${fieldNumber}`,
          venueId: venue.id,
          venueName: venue.name,
          fieldNumber,
          cells: venueSessions.map((s) => {
            const status = classifySlot(
              index,
              venue.id,
              fieldNumber,
              s.startsAt.getTime(),
              s.endsAt.getTime(),
            );
            return {
              date: s.date,
              startsAt: s.startsAt,
              endsAt: s.endsAt,
              state: status.state,
              label: status.label,
            };
          }),
        });
      }
    }
    return out;
  }, [payload, searched]);

  const headline = useMemo(() => {
    if (!payload || !searched) return null;
    const location = locations.find((l) => l.id === searched.locationId);
    const start = new Date(
      Date.UTC(2000, 0, 2, Math.floor(searched.startMinute / 60), searched.startMinute % 60),
    );
    const time = start.toLocaleTimeString("en-US", {
      timeZone: "UTC",
      hour: "numeric",
      minute: "2-digit",
    });
    return `${location?.name ?? "Location"} · ${weekdayLabel(searched.weekday)} · ${time} · ${searched.durationMinutes} min · ${searched.firstDate} to ${searched.lastDate}`;
  }, [payload, searched, locations]);

  const builderHref = useMemo(() => {
    if (!searched || !payload) return null;
    const params = new URLSearchParams({
      locationId: searched.locationId,
      weekday: String(searched.weekday),
      startMinute: String(searched.startMinute),
      durationMinutes: String(searched.durationMinutes),
      firstDate: searched.firstDate,
      lastDate: searched.lastDate,
    });
    return `/admin/rentals/blocks/new?${params.toString()}`;
  }, [searched, payload]);

  return (
    <section className="space-y-4">
      <header>
        <h2 className="text-lg font-semibold text-ink">Recurring slot finder</h2>
        <p className="text-sm text-ink-muted mt-1">
          One row per field, one mark per week. Hover a mark to see what is holding it. Times
          are local to {timeZone.replace(/_/g, " ")}.
        </p>
      </header>

      <form onSubmit={run} className="flex flex-wrap items-end gap-3">
        <div>
          <Label htmlFor="finder-location">Location</Label>
          <select
            id="finder-location"
            value={locationId}
            onChange={(e) => setLocationId(e.target.value)}
            className="block rounded border border-border bg-cream px-3 py-2 text-sm min-h-[40px]"
          >
            {locations.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <Label htmlFor="finder-weekday">Day</Label>
          <select
            id="finder-weekday"
            value={weekday}
            onChange={(e) => setWeekday(Number(e.target.value))}
            className="block rounded border border-border bg-cream px-3 py-2 text-sm min-h-[40px]"
          >
            {WEEKDAYS.map((d) => (
              <option key={d} value={d}>
                {weekdayLabel(d)}
              </option>
            ))}
          </select>
        </div>

        <div>
          <Label htmlFor="finder-start">Start</Label>
          <Input
            id="finder-start"
            type="time"
            value={startTime}
            onChange={(e) => setStartTime(e.target.value)}
          />
        </div>

        <div>
          <Label htmlFor="finder-duration">Minutes</Label>
          <Input
            id="finder-duration"
            type="number"
            step="15"
            min={15}
            max={480}
            value={durationMinutes}
            onChange={(e) => setDurationMinutes(Number(e.target.value))}
            className="w-24"
          />
        </div>

        <div>
          <Label htmlFor="finder-first">First date</Label>
          <Input
            id="finder-first"
            type="date"
            value={firstDate}
            onChange={(e) => setFirstDate(e.target.value)}
          />
        </div>

        <div>
          <Label htmlFor="finder-last">Last date</Label>
          <Input
            id="finder-last"
            type="date"
            value={lastDate}
            onChange={(e) => setLastDate(e.target.value)}
          />
        </div>

        <Button type="submit" disabled={loading}>
          {loading ? "Checking…" : "Check availability"}
        </Button>
      </form>

      {error && <ErrorBanner message={error} />}
      {loading && <LoadingSkeleton />}

      {!loading && payload && strips.length === 0 && (
        <EmptyState
          title="Nothing to show"
          description="This location has no rental-enabled venues, or the pattern matched no dates in the range."
        />
      )}

      {!loading && strips.length > 0 && (
        <div className="rounded-lg border border-border bg-cream-2 p-4 space-y-3">
          {headline && <p className="text-sm font-medium text-ink">{headline}</p>}

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <tbody>
                {strips.map((strip) => {
                  const counts = tallyStates(strip.cells.map((c) => c.state));
                  return (
                    <tr key={strip.key} className="align-top">
                      <th
                        scope="row"
                        className="py-1.5 pr-4 text-left font-medium text-ink whitespace-nowrap"
                      >
                        {strip.venueName}
                        <span className="text-ink-muted font-normal">
                          {" "}
                          · Field {strip.fieldNumber}
                        </span>
                      </th>
                      <td className="py-1.5 pr-4">
                        <span className="inline-flex flex-wrap gap-0.5 font-mono text-base leading-none">
                          {strip.cells.map((cell) => (
                            <span
                              key={cell.date}
                              className={GLYPH_CLASS[cell.state]}
                              title={`${cell.date} — ${SLOT_WORD[cell.state]}${
                                cell.label ? `: ${cell.label}` : ""
                              }`}
                              aria-label={`${cell.date} ${SLOT_WORD[cell.state]}${
                                cell.label ? `, ${cell.label}` : ""
                              }`}
                            >
                              {SLOT_GLYPH[cell.state]}
                            </span>
                          ))}
                        </span>
                      </td>
                      <td className="py-1.5 text-ink-muted whitespace-nowrap">
                        {summarizeCounts(counts)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-border pt-3 text-xs text-ink-muted">
            {(["open", "rental", "quoted", "reserved"] as SlotState[]).map((s) => (
              <span key={s} className="inline-flex items-center gap-1.5">
                <span className={`font-mono ${GLYPH_CLASS[s]}`}>{SLOT_GLYPH[s]}</span>
                {SLOT_WORD[s]}
              </span>
            ))}
          </div>

          {builderHref && (
            <a
              href={builderHref}
              className="inline-flex items-center rounded-lg border border-border px-4 py-2 text-sm font-medium text-ink hover:bg-cream transition-colors min-h-[44px]"
            >
              Build a block from this slot
            </a>
          )}
        </div>
      )}
    </section>
  );
}
