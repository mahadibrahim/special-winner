"use client"

import { useEffect, useState } from "react"
import type { VenueDayData } from "@/lib/admin/venue-day-data"
import { formatStripDate } from "@/lib/admin/week-strip"

type Props = { venues: { id: string; name: string }[] }

// Per-venue load state. Undefined while in-flight, "error" if the fetch
// failed (so we can show an error message instead of forever-Loading),
// or the actual payload when it lands. The previous shape conflated
// "loaded null on error" with "still loading" — UI got stuck on Loading
// whenever the API 4xx'd/5xx'd.
type CardState = VenueDayData | "error" | undefined

/**
 * Mini multi-venue snapshot for the super-admin home. Each card shows up
 * to 3 of today's activity blocks at one location, with a deep-link into
 * that venue's Venue Day. Empty venues render an italic "no activities"
 * line so the operator can see at a glance which venues are quiet today.
 */
export function TodayAcrossVenues({ venues }: Props) {
  const today = formatStripDate(new Date())
  const [data, setData] = useState<Record<string, CardState>>({})

  // Keyed on the joined list so re-renders with the same venues don't refetch.
  const venuesKey = venues.map((v) => v.id).join(",")

  useEffect(() => {
    let alive = true
    Promise.all(
      venues.map(async (v) => {
        try {
          const r = await fetch(
            `/api/admin/venue-day/${today}?locationId=${v.id}`,
          )
          if (!r.ok) {
            console.error(
              `[today-across-venues] /api/admin/venue-day → ${r.status} for ${v.name}`,
            )
            return [v.id, "error"] as const
          }
          const json = (await r.json()) as VenueDayData
          return [v.id, json] as const
        } catch (err) {
          console.error(`[today-across-venues] fetch failed for ${v.name}:`, err)
          return [v.id, "error"] as const
        }
      }),
    ).then((entries) => {
      if (!alive) return
      setData(Object.fromEntries(entries))
    })
    return () => {
      alive = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [today, venuesKey])

  if (venues.length === 0) return null

  return (
    <div>
      <h2 className="text-lg font-semibold text-ink mb-2">Today across venues</h2>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {venues.map((v) => {
          const d = data[v.id]
          return (
            <div key={v.id} className="bg-white border border-border rounded p-3">
              <div className="flex items-baseline justify-between mb-1.5 gap-2">
                <div className="font-medium text-sm text-ink">{v.name}</div>
                <a
                  href={`/admin/venue/day/${today}?locationId=${v.id}`}
                  className="text-xs underline whitespace-nowrap"
                >
                  Open Venue Day →
                </a>
              </div>
              {d === undefined && (
                <div className="text-xs text-ink-muted">Loading…</div>
              )}
              {d === "error" && (
                <div className="text-xs text-rose-700">
                  Couldn't load — check the console.
                </div>
              )}
              {d && d !== "error" && d.blocks.length === 0 && (
                <div className="text-xs text-ink-muted italic">
                  No activities scheduled
                </div>
              )}
              {d && d !== "error" && d.blocks.length > 0 && (
                <ul className="text-xs text-ink-muted space-y-1 list-none">
                  {d.blocks.slice(0, 3).map((b) => (
                    <li key={b.id} className="truncate">
                      {new Date(b.startAt).toLocaleTimeString("en-US", {
                        hour: "numeric",
                        minute: "2-digit",
                        hour12: true,
                      })}{" "}
                      · {b.title}
                    </li>
                  ))}
                  {d.blocks.length > 3 && (
                    <li className="italic">+ {d.blocks.length - 3} more…</li>
                  )}
                </ul>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
