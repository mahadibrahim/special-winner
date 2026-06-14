"use client"

import { useState, useEffect } from "react"
import { useHydrationBeacon } from "@/lib/hooks/use-hydration-beacon"

type StandingsRow = {
  teamName: string
  played: number
  won: number
  drawn: number
  lost: number
  bonusGoals: number
  totalGoals: number
  points: number
}

type Division = "mens" | "womens"

export function DropStandingsTable() {
  useHydrationBeacon()

  const [division, setDivision] = useState<Division>("mens")
  const [rows, setRows] = useState<StandingsRow[]>([])
  const [status, setStatus] = useState<"idle" | "loading" | "empty" | "error">("idle")

  useEffect(() => {
    let cancelled = false
    setStatus("loading")
    setRows([])

    fetch(`/api/public/drop-standings?division=${division}`)
      .then(async (res) => {
        if (!res.ok) throw new Error("Failed to load standings")
        const data = (await res.json()) as { standings?: StandingsRow[] }
        if (cancelled) return
        const standings = data.standings ?? []
        setRows(standings)
        setStatus(standings.length === 0 ? "empty" : "idle")
      })
      .catch(() => {
        if (!cancelled) setStatus("error")
      })

    return () => {
      cancelled = true
    }
  }, [division])

  return (
    <div>
      {/* Division toggle */}
      <div className="flex gap-2 mb-6">
        <button
          onClick={() => setDivision("mens")}
          className={`rounded-full px-4 py-1.5 text-sm font-semibold transition-colors ${
            division === "mens"
              ? "bg-ink text-cream"
              : "border border-border bg-paper text-ink-muted hover:text-ink"
          }`}
        >
          Men&apos;s
        </button>
        <button
          onClick={() => setDivision("womens")}
          className={`rounded-full px-4 py-1.5 text-sm font-semibold transition-colors ${
            division === "womens"
              ? "bg-ink text-cream"
              : "border border-border bg-paper text-ink-muted hover:text-ink"
          }`}
        >
          Women&apos;s
        </button>
      </div>

      {/* Table states */}
      {status === "loading" && (
        <div className="rounded-xl border border-border bg-paper px-6 py-10 text-center">
          <p className="text-sm text-ink-muted">Loading standings&hellip;</p>
        </div>
      )}

      {status === "empty" && (
        <div className="rounded-xl border border-border bg-cream-2 px-6 py-10 text-center">
          <p className="text-sm text-ink-muted">
            Standings post once the season&apos;s first matches are played.
          </p>
        </div>
      )}

      {status === "error" && (
        <div className="rounded-xl border border-border bg-cream-2 px-6 py-10 text-center">
          <p className="text-sm text-red-600">
            Could not load standings. Try refreshing the page.
          </p>
        </div>
      )}

      {status === "idle" && rows.length > 0 && (
        <div className="overflow-x-auto rounded-xl border border-border bg-paper shadow-sm">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-cream-2">
                <th className="px-4 py-3 text-left text-[11px] font-semibold tracking-[0.1em] uppercase text-ink-muted w-8">
                  #
                </th>
                <th className="px-4 py-3 text-left text-[11px] font-semibold tracking-[0.1em] uppercase text-ink-muted">
                  Team
                </th>
                <th className="px-4 py-3 text-center text-[11px] font-semibold tracking-[0.1em] uppercase text-ink-muted">
                  P
                </th>
                <th className="px-4 py-3 text-center text-[11px] font-semibold tracking-[0.1em] uppercase text-ink-muted">
                  W
                </th>
                <th className="px-4 py-3 text-center text-[11px] font-semibold tracking-[0.1em] uppercase text-ink-muted">
                  D
                </th>
                <th className="px-4 py-3 text-center text-[11px] font-semibold tracking-[0.1em] uppercase text-ink-muted">
                  L
                </th>
                <th className="px-4 py-3 text-center text-[11px] font-semibold tracking-[0.1em] uppercase text-primary-orange">
                  Bonus Goals
                </th>
                <th className="px-4 py-3 text-center text-[11px] font-semibold tracking-[0.1em] uppercase text-ink-muted">
                  Total Goals
                </th>
                <th className="px-4 py-3 text-center text-[11px] font-semibold tracking-[0.1em] uppercase text-ink-muted">
                  Pts
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.map((row, i) => (
                <tr
                  key={row.teamName}
                  className={`${i === 0 ? "bg-cream-2/50" : ""} hover:bg-cream-2/30 transition-colors`}
                >
                  <td className="px-4 py-3 text-ink-muted font-mono text-xs">{i + 1}</td>
                  <td className="px-4 py-3 font-semibold text-ink">{row.teamName}</td>
                  <td className="px-4 py-3 text-center font-mono text-ink-muted">{row.played}</td>
                  <td className="px-4 py-3 text-center font-mono text-ink-muted">{row.won}</td>
                  <td className="px-4 py-3 text-center font-mono text-ink-muted">{row.drawn}</td>
                  <td className="px-4 py-3 text-center font-mono text-ink-muted">{row.lost}</td>
                  <td className="px-4 py-3 text-center font-mono font-semibold text-primary-orange">
                    {row.bonusGoals}
                  </td>
                  <td className="px-4 py-3 text-center font-mono text-ink-muted">{row.totalGoals}</td>
                  <td className="px-4 py-3 text-center font-mono font-bold text-ink">{row.points}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
