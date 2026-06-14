"use client"

import { useEffect, useState } from "react"
import { useHydrationBeacon } from "@/lib/hooks/use-hydration-beacon"

// ─── Types ────────────────────────────────────────────────────────────────────

interface WeighIn {
  weekNumber: number
  weightG: number
  deltaVsPriorWeekG: number | null
}

interface Stats {
  totalLostG: number
  pctLost: number
  fivePctAwarded: boolean
  tenPctAwarded: boolean
  hatTricksAwarded: number
}

interface Standing {
  played: number
  won: number
  drawn: number
  lost: number
  points: number
  bonusGoals: number
  totalGoals: number
}

interface MeResponse {
  player: { division: "mens" | "womens"; seasonName: string | null } | null
  weighIns: WeighIn[]
  stats: Stats
  team: { name: string } | null
  standing: Standing | null
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Convert grams to pounds, rounded to 1 decimal. */
function gToLbs(g: number): number {
  return Math.round((g / 453.592) * 10) / 10
}

/** Convert grams to whole pounds for the header display. */
function gToLbsInt(g: number): number {
  return Math.round(g / 453.592)
}

// ─── Sparkline ───────────────────────────────────────────────────────────────

function Sparkline({ weighIns }: { weighIns: WeighIn[] }) {
  if (weighIns.length < 2) return null

  const weights = weighIns.map((w) => w.weightG)
  const minW = Math.min(...weights)
  const maxW = Math.max(...weights)
  const range = maxW - minW || 1

  const W = 200
  const H = 48
  const pad = 4

  const points = weighIns.map((w, i) => {
    const x = pad + (i / (weighIns.length - 1)) * (W - pad * 2)
    // Invert Y so heavier = higher on chart (weight going down = line going down)
    const y = pad + ((w.weightG - minW) / range) * (H - pad * 2)
    return { x, y }
  })

  const d = points
    .map((p, i) => `${i === 0 ? "M" : "L"} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`)
    .join(" ")

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      aria-hidden="true"
      className="w-full max-w-[200px] h-12 overflow-visible"
    >
      <path
        d={d}
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="text-primary-orange"
      />
      {/* Final dot */}
      <circle
        cx={points[points.length - 1]!.x}
        cy={points[points.length - 1]!.y}
        r="3"
        className="fill-primary-orange"
      />
    </svg>
  )
}

// ─── Weigh-in list ────────────────────────────────────────────────────────────

function WeighInList({ weighIns }: { weighIns: WeighIn[] }) {
  if (weighIns.length === 0) {
    return (
      <p className="text-sm text-ink-muted">No weigh-ins recorded yet — see you at the scale!</p>
    )
  }

  return (
    <div className="divide-y divide-border">
      {weighIns.map((w) => {
        const lbs = gToLbs(w.weightG)
        const deltaLbs = w.deltaVsPriorWeekG !== null ? gToLbs(Math.abs(w.deltaVsPriorWeekG)) : null
        const isDown = w.deltaVsPriorWeekG !== null && w.deltaVsPriorWeekG < 0
        const isUp = w.deltaVsPriorWeekG !== null && w.deltaVsPriorWeekG > 0

        return (
          <div key={w.weekNumber} className="flex items-center justify-between py-2.5 gap-4">
            <span className="text-xs font-semibold tracking-wide uppercase text-ink-muted w-16 shrink-0">
              Week {w.weekNumber}
            </span>
            <span className="text-sm font-medium text-ink flex-1">{lbs} lbs</span>
            {deltaLbs !== null && (
              <span
                className={`text-xs font-semibold tabular-nums ${
                  isDown ? "text-green-600" : isUp ? "text-red-500" : "text-ink-muted"
                }`}
              >
                {isDown ? "▼" : isUp ? "▲" : "—"} {deltaLbs} lbs
              </span>
            )}
          </div>
        )
      })}
    </div>
  )
}

// ─── Milestone badges ─────────────────────────────────────────────────────────

function Badges({ stats }: { stats: Stats }) {
  const badges = [
    {
      key: "5pct",
      label: "Big Drop 5%",
      icon: "🔥",
      earned: stats.fivePctAwarded,
      desc: "5% of start weight gone",
    },
    {
      key: "10pct",
      label: "Big Drop 10%",
      icon: "🏆",
      earned: stats.tenPctAwarded,
      desc: "10% of start weight gone",
    },
  ]

  return (
    <div className="flex flex-wrap gap-3">
      {badges.map((b) => (
        <div
          key={b.key}
          title={b.desc}
          className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold border transition-opacity ${
            b.earned
              ? "bg-primary-orange/10 border-primary-orange/40 text-primary-orange"
              : "bg-cream-2 border-border text-ink-muted opacity-40"
          }`}
        >
          <span aria-hidden="true">{b.icon}</span>
          {b.label}
          {b.earned && <span className="ml-0.5 text-[10px]">✓</span>}
        </div>
      ))}

      {stats.hatTricksAwarded > 0 && (
        <div className="flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold border bg-ink text-cream border-ink">
          <span aria-hidden="true">🎩</span>
          Hat Trick × {stats.hatTricksAwarded}
        </div>
      )}
    </div>
  )
}

// ─── Team standing card ───────────────────────────────────────────────────────

function TeamCard({
  teamName,
  standing,
}: {
  teamName: string
  standing: Standing | null
}) {
  return (
    <div className="rounded-xl border border-border bg-paper p-6 shadow-sm">
      <p className="text-[11px] font-semibold tracking-[0.15em] uppercase text-primary-orange mb-1">
        Your Team
      </p>
      <h3 className="text-lg font-display leading-tight mb-4">{teamName}</h3>
      {standing ? (
        <div className="grid grid-cols-4 gap-2 text-center">
          {(
            [
              { label: "Pts", value: standing.points },
              { label: "W–D–L", value: `${standing.won}–${standing.drawn}–${standing.lost}` },
              { label: "Bonus G", value: standing.bonusGoals.toFixed(1) },
              { label: "Goals", value: standing.totalGoals },
            ] as { label: string; value: string | number }[]
          ).map((stat) => (
            <div key={stat.label} className="rounded-lg bg-cream-2 py-2 px-1">
              <p className="text-lg font-bold text-ink tabular-nums">{stat.value}</p>
              <p className="text-[10px] font-semibold tracking-wide uppercase text-ink-muted mt-0.5">
                {stat.label}
              </p>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-sm text-ink-muted">
          Standings update after each match week.
        </p>
      )}
    </div>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

export function DropDashboard() {
  useHydrationBeacon()

  const [status, setStatus] = useState<"loading" | "no-player" | "data" | "error">("loading")
  const [data, setData] = useState<MeResponse | null>(null)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  useEffect(() => {
    fetch("/api/drop/me")
      .then(async (res) => {
        if (!res.ok) {
          const json = (await res.json().catch(() => ({}))) as { error?: string }
          throw new Error(json.error ?? `HTTP ${res.status}`)
        }
        return res.json() as Promise<MeResponse>
      })
      .then((body) => {
        setData(body)
        setStatus(body.player === null ? "no-player" : "data")
      })
      .catch((err) => {
        setErrorMsg(err instanceof Error ? err.message : "Something went wrong")
        setStatus("error")
      })
  }, [])

  // ── Loading ──────────────────────────────────────────────────────────────
  if (status === "loading") {
    return (
      <div className="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8 py-24 flex items-center justify-center">
        <div className="flex items-center gap-3 text-ink-muted">
          <span className="inline-block h-5 w-5 animate-spin rounded-full border-2 border-current border-t-transparent" />
          <span className="text-sm">Loading your dashboard…</span>
        </div>
      </div>
    )
  }

  // ── Error ────────────────────────────────────────────────────────────────
  if (status === "error") {
    return (
      <div className="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8 py-24 text-center">
        <p className="text-sm text-red-600 font-medium">{errorMsg ?? "Could not load your dashboard."}</p>
      </div>
    )
  }

  // ── Not registered ───────────────────────────────────────────────────────
  if (status === "no-player") {
    return (
      <div className="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8 py-24 text-center">
        <h1 className="text-2xl font-display text-ink mb-3">
          You&rsquo;re not in a Drop League season yet.
        </h1>
        <p className="text-ink-muted text-sm mb-8 max-w-sm mx-auto">
          Registration is open — sign up and start your drop journey.
        </p>
        <a
          href="/drop-league/register"
          className="inline-flex items-center gap-2 rounded-lg bg-primary-orange px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:opacity-90 transition-opacity"
        >
          Register for Drop League
        </a>
      </div>
    )
  }

  // ── Data view ────────────────────────────────────────────────────────────
  const { player, weighIns, stats, team, standing } = data!
  const totalLostLbs = gToLbsInt(stats.totalLostG)
  const isGaining = stats.totalLostG < 0

  return (
    <div className="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8 py-12">

      {/* ── Hero header ── */}
      <section className="mb-10">
        <p className="text-[11px] font-semibold tracking-[0.15em] uppercase text-primary-orange mb-2">
          {player?.seasonName ?? "Drop League"} ·{" "}
          {player?.division === "mens" ? "Men's Division" : "Women's Division"}
        </p>
        <h1
          className="font-display text-ink"
          style={{ fontSize: "clamp(2rem, 5vw, 3.25rem)", lineHeight: "1.05", letterSpacing: "-0.03em" }}
        >
          {isGaining
            ? "Keep going — every week counts."
            : totalLostLbs === 0
            ? "Season starts now."
            : `You've dropped ${totalLostLbs} lb${totalLostLbs !== 1 ? "s" : ""}.`}
        </h1>
        {stats.pctLost > 0 && !isGaining && (
          <p className="mt-2 text-xl text-ink-muted font-medium">
            {stats.pctLost}% of your starting weight — keep the momentum going.
          </p>
        )}
      </section>

      {/* ── Milestones ── */}
      <section className="mb-10">
        <h2 className="text-xs font-semibold tracking-[0.12em] uppercase text-ink-muted mb-3">
          Milestones
        </h2>
        <Badges stats={stats} />
      </section>

      {/* ── Weigh-in history ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-8">
        <section className="rounded-xl border border-border bg-paper p-6 shadow-sm">
          <div className="flex items-start justify-between gap-4 mb-4">
            <h2 className="text-sm font-semibold text-ink">Week-by-week</h2>
            {weighIns.length >= 2 && (
              <div className="text-ink opacity-60">
                <Sparkline weighIns={weighIns} />
              </div>
            )}
          </div>
          <WeighInList weighIns={weighIns} />
        </section>

        {/* ── Team / standing ── */}
        {team ? (
          <TeamCard teamName={team.name} standing={standing} />
        ) : (
          <div className="rounded-xl border border-border bg-cream-2 p-6 flex items-center justify-center text-center">
            <div>
              <p className="text-sm font-semibold text-ink mb-1">Teams announced soon</p>
              <p className="text-xs text-ink-muted">You&rsquo;ll be slotted onto a team before match week 1.</p>
            </div>
          </div>
        )}
      </div>

      {/* ── Food diary widget placeholder ── */}
      {/* food diary widget mounts here in Task 4 */}

    </div>
  )
}
