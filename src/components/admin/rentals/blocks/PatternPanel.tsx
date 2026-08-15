"use client";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { timeInputToMinute, weekdayLabel } from "./format";
import type {
  LocationOption,
  PatternDayRow,
  PatternFormState,
  Storefront,
  VenueOption,
} from "./types";

const DURATION_OPTIONS = [
  { value: 60, label: "1 hour" },
  { value: 90, label: "1.5 hours" },
  { value: 120, label: "2 hours" },
  { value: 180, label: "3 hours" },
  { value: 240, label: "4 hours" },
];

interface PatternPanelProps {
  value: PatternFormState;
  locations: LocationOption[];
  venuesByLocation: Record<string, VenueOption[]>;
  onChange: (next: PatternFormState) => void;
  onGenerate: () => void;
  generating: boolean;
}

const emptyDay = (): PatternDayRow => ({
  weekday: 2,
  startTime: "20:00",
  durationMinutes: 60,
  venueIds: [],
});

export function PatternPanel({
  value,
  locations,
  venuesByLocation,
  onChange,
  onGenerate,
  generating,
}: PatternPanelProps) {
  const venues = venuesByLocation[value.locationId] ?? [];

  const patchDay = (index: number, patch: Partial<PatternDayRow>) => {
    onChange({
      ...value,
      days: value.days.map((d, i) => (i === index ? { ...d, ...patch } : d)),
    });
  };

  const toggleVenue = (index: number, venueId: string) => {
    const day = value.days[index];
    patchDay(index, {
      venueIds: day.venueIds.includes(venueId)
        ? day.venueIds.filter((id) => id !== venueId)
        : [...day.venueIds, venueId],
    });
  };

  // Changing location invalidates every venue selection: venue ids belong to
  // exactly one location, and the endpoints reject a cross-location mix.
  const changeLocation = (locationId: string) => {
    onChange({
      ...value,
      locationId,
      days: value.days.map((d) => ({ ...d, venueIds: [] })),
    });
  };

  const canGenerate =
    value.locationId !== "" &&
    value.firstDate !== "" &&
    value.lastDate !== "" &&
    value.days.length > 0 &&
    value.days.every((d) => d.venueIds.length > 0);

  return (
    <section className="rounded-xl border border-border bg-cream-2 p-5 space-y-4">
      <h2 className="font-semibold text-ink">Pattern</h2>

      <div className="flex flex-wrap gap-4">
        <div>
          <Label htmlFor="block-storefront">Storefront</Label>
          <select
            id="block-storefront"
            value={value.brand}
            onChange={(e) => onChange({ ...value, brand: e.target.value as Storefront })}
            className="mt-1 rounded border border-border px-3 py-2 text-sm bg-cream w-48"
          >
            <option value="soccerone">SoccerOne</option>
            <option value="aspire">Aspire</option>
          </select>
        </div>
        <div>
          <Label htmlFor="block-location">Location</Label>
          <select
            id="block-location"
            value={value.locationId}
            onChange={(e) => changeLocation(e.target.value)}
            className="mt-1 rounded border border-border px-3 py-2 text-sm bg-cream w-56"
          >
            <option value="">Select a location…</option>
            {locations.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="space-y-3">
        {value.days.map((day, i) => (
          <div
            key={i}
            className="flex flex-wrap items-end gap-3 rounded-lg border border-border bg-cream px-3 py-3"
          >
            <div>
              <Label htmlFor={`block-day-${i}`}>Day</Label>
              <select
                id={`block-day-${i}`}
                value={day.weekday}
                onChange={(e) => patchDay(i, { weekday: Number(e.target.value) })}
                className="mt-1 rounded border border-border px-3 py-2 text-sm bg-cream w-36"
              >
                {[0, 1, 2, 3, 4, 5, 6].map((w) => (
                  <option key={w} value={w}>
                    {weekdayLabel(w)}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <Label htmlFor={`block-start-${i}`}>Start time</Label>
              <input
                id={`block-start-${i}`}
                type="time"
                value={day.startTime}
                onChange={(e) => patchDay(i, { startTime: e.target.value })}
                className="mt-1 rounded border border-border px-3 py-2 text-sm bg-cream"
              />
            </div>
            <div>
              <Label htmlFor={`block-duration-${i}`}>Duration</Label>
              <select
                id={`block-duration-${i}`}
                value={day.durationMinutes}
                onChange={(e) => patchDay(i, { durationMinutes: Number(e.target.value) })}
                className="mt-1 rounded border border-border px-3 py-2 text-sm bg-cream w-32"
              >
                {DURATION_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>
            <fieldset className="min-w-48">
              <legend className="text-xs text-ink-muted mb-1">Fields</legend>
              <div className="flex flex-wrap gap-3">
                {venues.length === 0 && (
                  <span className="text-xs text-ink-muted">
                    Pick a location to list its fields.
                  </span>
                )}
                {venues.map((v) => (
                  <label key={v.id} className="flex items-center gap-1.5 text-sm cursor-pointer">
                    <input
                      type="checkbox"
                      checked={day.venueIds.includes(v.id)}
                      onChange={() => toggleVenue(i, v.id)}
                    />
                    {v.name}
                  </label>
                ))}
              </div>
            </fieldset>
            {value.days.length > 1 && (
              <button
                type="button"
                onClick={() =>
                  onChange({ ...value, days: value.days.filter((_, j) => j !== i) })
                }
                className="text-xs text-rose-700 underline mb-2"
              >
                Remove
              </button>
            )}
          </div>
        ))}
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => onChange({ ...value, days: [...value.days, emptyDay()] })}
        >
          + Add day
        </Button>
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <div>
          <Label htmlFor="block-first-date">First date</Label>
          <input
            id="block-first-date"
            type="date"
            value={value.firstDate}
            onChange={(e) => onChange({ ...value, firstDate: e.target.value })}
            className="mt-1 rounded border border-border px-3 py-2 text-sm bg-cream"
          />
        </div>
        <div>
          <Label htmlFor="block-last-date">Last date</Label>
          <input
            id="block-last-date"
            type="date"
            value={value.lastDate}
            onChange={(e) => onChange({ ...value, lastDate: e.target.value })}
            className="mt-1 rounded border border-border px-3 py-2 text-sm bg-cream"
          />
        </div>
        <Button type="button" onClick={onGenerate} disabled={generating || !canGenerate}>
          {generating ? "Generating…" : "Generate"}
        </Button>
      </div>
    </section>
  );
}

/** The pattern the panel starts on: one weekday row, no fields chosen yet. */
export function emptyPatternState(): PatternFormState {
  return {
    brand: "soccerone",
    locationId: "",
    days: [emptyDay()],
    firstDate: "",
    lastDate: "",
  };
}

/** Panel state → the `pattern` the block endpoints validate. */
export function toApiPattern(value: PatternFormState, timeZone: string) {
  return {
    timeZone,
    firstDate: value.firstDate,
    lastDate: value.lastDate,
    days: value.days.map((d) => ({
      weekday: d.weekday,
      startMinute: timeInputToMinute(d.startTime),
      durationMinutes: d.durationMinutes,
      venueIds: d.venueIds,
    })),
  };
}
