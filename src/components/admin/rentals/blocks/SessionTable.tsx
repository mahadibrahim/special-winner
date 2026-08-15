"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { localMinuteToUtc } from "@/lib/rentals/blocks/generate";
import {
  fmtSessionDate,
  fmtSessionTime,
  formatDollars,
  minuteToTimeInput,
  timeInputToMinute,
} from "./format";
import type { ExtraSession, SessionOverride, SessionRow, VenueOption } from "./types";

const DURATION_OPTIONS = [60, 90, 120, 180, 240];

interface SessionTableProps {
  sessions: SessionRow[];
  excludedKeys: Set<string>;
  venues: VenueOption[];
  timeZone: string;
  /** Internal reserves fence inventory rather than sell it: no money column. */
  showMoney: boolean;
  onToggle: (key: string) => void;
  onEdit: (key: string, patch: SessionOverride) => void;
  onAddOneOff: (session: ExtraSession) => void;
}

export function SessionTable({
  sessions,
  excludedKeys,
  venues,
  timeZone,
  showMoney,
  onToggle,
  onEdit,
  onAddOneOff,
}: SessionTableProps) {
  const [adding, setAdding] = useState(false);
  const [oneOffDate, setOneOffDate] = useState("");
  const [oneOffTime, setOneOffTime] = useState("20:00");
  const [oneOffDuration, setOneOffDuration] = useState(60);
  const [oneOffVenueId, setOneOffVenueId] = useState(venues[0]?.id ?? "");

  const selected = sessions.filter((s) => !excludedKeys.has(s.key)).length;

  const addOneOff = () => {
    if (!oneOffDate || !oneOffVenueId) return;
    const startMinute = timeInputToMinute(oneOffTime);
    // Local wall-clock resolves per-date in the org timezone, exactly as the
    // generator does: adding a fixed number of hours would shift a session an
    // hour across a DST boundary.
    onAddOneOff({
      key: `${oneOffDate}|${oneOffVenueId}|${startMinute}`,
      date: oneOffDate,
      venueId: oneOffVenueId,
      startMinute,
      durationMinutes: oneOffDuration,
      startsAt: localMinuteToUtc(oneOffDate, startMinute, timeZone).toISOString(),
      endsAt: localMinuteToUtc(
        oneOffDate,
        startMinute + oneOffDuration,
        timeZone,
      ).toISOString(),
    });
    setAdding(false);
    setOneOffDate("");
  };

  return (
    <section className="rounded-xl border border-border bg-cream-2 p-5 space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h2 className="font-semibold text-ink">Sessions</h2>
        <span className="text-sm text-ink-muted">
          {selected} of {sessions.length} selected
        </span>
      </div>

      {sessions.length === 0 ? (
        <EmptyState
          title="No sessions yet"
          description="Set a pattern and press Generate to build the session list."
        />
      ) : (
        <div className="rounded-lg border border-border bg-cream overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-cream-2 border-b border-border">
              <tr className="text-left">
                <th className="px-3 py-2"></th>
                <th className="px-3 py-2 font-medium text-ink-muted">Date</th>
                <th className="px-3 py-2 font-medium text-ink-muted">Start</th>
                <th className="px-3 py-2 font-medium text-ink-muted">Duration</th>
                <th className="px-3 py-2 font-medium text-ink-muted">Field</th>
                {showMoney && <th className="px-3 py-2 font-medium text-ink-muted">Amount</th>}
                <th className="px-3 py-2 font-medium text-ink-muted">Notes</th>
              </tr>
            </thead>
            <tbody>
              {sessions.map((s) => {
                const included = !excludedKeys.has(s.key);
                return (
                  <tr
                    key={s.key}
                    className={`border-t border-border ${included ? "" : "opacity-60"}`}
                  >
                    <td className="px-3 py-2 align-middle">
                      <input
                        type="checkbox"
                        checked={included}
                        aria-label={`Include ${fmtSessionDate(s.startsAt, timeZone)}`}
                        onChange={() => onToggle(s.key)}
                      />
                    </td>
                    <td className="px-3 py-2 align-middle text-ink whitespace-nowrap">
                      {fmtSessionDate(s.startsAt, timeZone)}
                    </td>
                    <td className="px-3 py-2 align-middle">
                      <input
                        type="time"
                        value={minuteToTimeInput(s.startMinute)}
                        aria-label={`Start time ${s.date}`}
                        onChange={(e) =>
                          onEdit(s.key, { startMinute: timeInputToMinute(e.target.value) })
                        }
                        className="rounded border border-border px-2 py-1 text-sm bg-cream"
                      />
                    </td>
                    <td className="px-3 py-2 align-middle">
                      <select
                        value={s.durationMinutes}
                        aria-label={`Duration ${s.date}`}
                        onChange={(e) =>
                          onEdit(s.key, { durationMinutes: Number(e.target.value) })
                        }
                        className="rounded border border-border px-2 py-1 text-sm bg-cream"
                      >
                        {DURATION_OPTIONS.map((m) => (
                          <option key={m} value={m}>
                            {m / 60} hr
                          </option>
                        ))}
                        {!DURATION_OPTIONS.includes(s.durationMinutes) && (
                          <option value={s.durationMinutes}>{s.durationMinutes / 60} hr</option>
                        )}
                      </select>
                    </td>
                    <td className="px-3 py-2 align-middle">
                      <select
                        value={s.venueId}
                        aria-label={`Field ${s.date}`}
                        onChange={(e) => onEdit(s.key, { venueId: e.target.value })}
                        className="rounded border border-border px-2 py-1 text-sm bg-cream"
                      >
                        {venues.map((v) => (
                          <option key={v.id} value={v.id}>
                            {v.name}
                          </option>
                        ))}
                      </select>
                    </td>
                    {showMoney && (
                      <td className="px-3 py-2 align-middle text-ink whitespace-nowrap">
                        {included ? formatDollars(s.allocatedCents) : "–"}
                      </td>
                    )}
                    <td className="px-3 py-2 align-middle text-xs">
                      {s.conflict ? (
                        <span className="text-rose-700">&#9888; {s.conflict.reason}</span>
                      ) : s.competingQuote ? (
                        <span className="text-amber-700">
                          also quoted to {s.competingQuote.label} ·{" "}
                          {fmtSessionDate(s.competingQuote.quotedAt, timeZone)}
                        </span>
                      ) : (
                        <span className="text-ink-muted">
                          until {fmtSessionTime(s.endsAt, timeZone)}
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {adding ? (
        <div className="flex flex-wrap items-end gap-3 rounded-lg border border-border bg-cream px-3 py-3">
          <div className="flex flex-col gap-1">
            <label className="text-xs text-ink-muted" htmlFor="one-off-date">
              Date
            </label>
            <input
              id="one-off-date"
              type="date"
              value={oneOffDate}
              onChange={(e) => setOneOffDate(e.target.value)}
              className="rounded border border-border px-2 py-1.5 text-sm bg-cream"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-ink-muted" htmlFor="one-off-time">
              Start
            </label>
            <input
              id="one-off-time"
              type="time"
              value={oneOffTime}
              onChange={(e) => setOneOffTime(e.target.value)}
              className="rounded border border-border px-2 py-1.5 text-sm bg-cream"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-ink-muted" htmlFor="one-off-duration">
              Duration
            </label>
            <select
              id="one-off-duration"
              value={oneOffDuration}
              onChange={(e) => setOneOffDuration(Number(e.target.value))}
              className="rounded border border-border px-2 py-1.5 text-sm bg-cream"
            >
              {DURATION_OPTIONS.map((m) => (
                <option key={m} value={m}>
                  {m / 60} hr
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-ink-muted" htmlFor="one-off-venue">
              Field
            </label>
            <select
              id="one-off-venue"
              value={oneOffVenueId}
              onChange={(e) => setOneOffVenueId(e.target.value)}
              className="rounded border border-border px-2 py-1.5 text-sm bg-cream"
            >
              {venues.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.name}
                </option>
              ))}
            </select>
          </div>
          <Button type="button" size="sm" onClick={addOneOff} disabled={!oneOffDate}>
            Add session
          </Button>
          <Button type="button" size="sm" variant="outline" onClick={() => setAdding(false)}>
            Cancel
          </Button>
        </div>
      ) : (
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => setAdding(true)}
          disabled={venues.length === 0}
        >
          + Add a one-off session
        </Button>
      )}
    </section>
  );
}
