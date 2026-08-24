"use client"

import { useCallback, useEffect, useState } from "react"
import { useHydrationBeacon } from "@/lib/hooks/use-hydration-beacon"
import { LoadingSkeleton } from "@/components/ui/loading-skeleton"

/**
 * Live "this week's classes" schedule for /youth/classes. The enclosing page
 * is edge-cached marketing HTML (setMarketingEdgeCache in classes.astro), so
 * this island — not the Astro frontmatter — is the only place live slot/
 * capacity data may live; anything computed in the page's frontmatter would
 * freeze into the cached response for up to a day.
 *
 * Fetches GET /api/public/class-schedule (see that route for the response
 * shape) and renders every ACTIVE class_slot_template grouped by weekday.
 * `sessions` (materialized upcoming sessions) is not used here — this
 * section is about the standing weekly slots, not individual dates.
 *
 * CTAs:
 * - "Book a free trial" dispatches `youth:trial-requested` (detail:
 *   { templateId }) on window and scrolls to #pricing as an interim
 *   behavior — Task 5 wires the actual trial-booking modal by listening for
 *   this event, per the brief. Do not build a modal here.
 * - "Join" is a plain anchor to #pricing.
 * Both carry `data-youth-cta="schedule"` so the page's existing click
 * tracker (classes.astro, the `[data-youth-cta]` listener near the bottom)
 * picks them up.
 */

interface ScheduleSlot {
  templateId: string
  name: string
  sportLabel: string | null
  weekday: number
  startTime: string
  durationMins: number
  minAge: number | null
  maxAge: number | null
  locationName: string | null
  venueName: string | null
  capacity: number
  enrolledCount: number
  spotsLeft: number
}

const WEEKDAY_NAMES = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
]

function formatWeekdayTime(weekday: number, startTime: string): string {
  const day = WEEKDAY_NAMES[weekday] ?? `Day ${weekday}`
  const [hourStr, minuteStr] = startTime.slice(0, 5).split(":")
  const hour = Number(hourStr)
  const minute = Number(minuteStr)
  if (Number.isNaN(hour) || Number.isNaN(minute)) return `${day} · ${startTime.slice(0, 5)}`
  const period = hour >= 12 ? "PM" : "AM"
  const hour12 = hour % 12 === 0 ? 12 : hour % 12
  return `${day} · ${hour12}:${String(minute).padStart(2, "0")} ${period}`
}

function formatAges(minAge: number | null, maxAge: number | null): string {
  if (minAge === null && maxAge === null) return "All ages"
  if (minAge !== null && maxAge !== null) return `Ages ${minAge}–${maxAge}`
  if (minAge !== null) return `Ages ${minAge}+`
  return `Ages up to ${maxAge}`
}

function spotsChip(spotsLeft: number): { label: string; className: string } {
  if (spotsLeft === 0) {
    return { label: "Full", className: "bg-cream-2 text-ink-muted border border-cream-3" }
  }
  if (spotsLeft <= 3) {
    return {
      label: `${spotsLeft} spot${spotsLeft === 1 ? "" : "s"} left`,
      className: "bg-amber-100 text-amber-800",
    }
  }
  return { label: `${spotsLeft} spots left`, className: "bg-emerald-50 text-emerald-700" }
}

/** Groups slots by weekday, Sun..Sat order, but only weekdays that actually
 *  have a slot appear — so the rendered list effectively starts at the
 *  first weekday with classes rather than showing empty day headers. */
function groupByWeekday(slots: ScheduleSlot[]): { weekday: number; slots: ScheduleSlot[] }[] {
  const byDay = new Map<number, ScheduleSlot[]>()
  for (const slot of slots) {
    const list = byDay.get(slot.weekday) ?? []
    list.push(slot)
    byDay.set(slot.weekday, list)
  }
  const groups: { weekday: number; slots: ScheduleSlot[] }[] = []
  for (let day = 0; day < 7; day++) {
    const daySlots = byDay.get(day)
    if (!daySlots || daySlots.length === 0) continue
    groups.push({ weekday: day, slots: [...daySlots].sort((a, b) => a.startTime.localeCompare(b.startTime)) })
  }
  return groups
}

function requestTrial(templateId: string) {
  window.dispatchEvent(new CustomEvent("youth:trial-requested", { detail: { templateId } }))
  document.getElementById("pricing")?.scrollIntoView({ behavior: "smooth" })
}

type Phase = "loading" | "error" | "ready"

export default function ClassSchedule() {
  useHydrationBeacon()

  const [phase, setPhase] = useState<Phase>("loading")
  const [slots, setSlots] = useState<ScheduleSlot[]>([])

  const load = useCallback(async () => {
    setPhase("loading")
    try {
      const res = await fetch("/api/public/class-schedule")
      if (!res.ok) throw new Error("bad status")
      const body = (await res.json()) as { slots: ScheduleSlot[] }
      setSlots(body.slots)
      setPhase("ready")
    } catch {
      setPhase("error")
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  if (phase === "loading") {
    return (
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <LoadingSkeleton variant="card" rows={3} />
        <LoadingSkeleton variant="card" rows={3} />
        <LoadingSkeleton variant="card" rows={3} />
      </div>
    )
  }

  if (phase === "error") {
    return (
      <div className="py-10 text-center">
        <button
          type="button"
          onClick={() => void load()}
          className="text-sm text-ink-muted underline underline-offset-2 hover:text-ink"
        >
          Couldn't load the schedule — retry
        </button>
      </div>
    )
  }

  const groups = groupByWeekday(slots)

  if (groups.length === 0) {
    return (
      <div className="bg-paper border border-cream-3 rounded-2xl p-[26px] text-center">
        <p className="text-[15.5px] text-ink-2">
          This week's schedule is being finalized — check back soon, or lock in your spot now.
        </p>
        <a
          href="#pricing"
          data-youth-cta="schedule"
          className="inline-block mt-4 font-semibold text-[13.5px] px-5 py-[11px] rounded-[10px] bg-brand-red text-cream no-underline"
        >
          Join →
        </a>
      </div>
    )
  }

  return (
    <div className="space-y-8">
      {groups.map((group) => (
        <div key={group.weekday}>
          <h3 className="font-mono text-[11px] tracking-[0.16em] uppercase text-emerald-700 mb-3">
            {WEEKDAY_NAMES[group.weekday]}
          </h3>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {group.slots.map((slot) => {
              const chip = spotsChip(slot.spotsLeft)
              return (
                <div
                  key={slot.templateId}
                  className="bg-paper text-ink border border-cream-3 rounded-2xl p-[22px] flex flex-col gap-3"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-mono text-[10px] tracking-[0.16em] uppercase text-ink-muted">
                        {formatWeekdayTime(slot.weekday, slot.startTime)}
                      </p>
                      <h4 className="font-display font-semibold text-[18px] mt-1">{slot.name}</h4>
                    </div>
                    <span
                      className={`shrink-0 font-medium text-[11.5px] px-2.5 py-1 rounded-full whitespace-nowrap ${chip.className}`}
                    >
                      {chip.label}
                    </span>
                  </div>

                  <div className="text-[13.5px] text-ink-2 space-y-0.5">
                    <div>
                      {slot.durationMins} min · {formatAges(slot.minAge, slot.maxAge)}
                    </div>
                    {(slot.venueName || slot.locationName) && (
                      <div>{slot.venueName ?? slot.locationName}</div>
                    )}
                  </div>

                  <div className="flex flex-wrap gap-2 mt-1">
                    <button
                      type="button"
                      data-trial-slot={slot.templateId}
                      data-youth-cta="schedule"
                      onClick={() => requestTrial(slot.templateId)}
                      className="inline-block font-semibold text-[13px] px-4 py-[9px] rounded-[8px] bg-brand-red text-cream no-underline"
                    >
                      Book a free trial
                    </button>
                    <a
                      href="#pricing"
                      data-youth-cta="schedule"
                      className="inline-block font-semibold text-[13px] px-4 py-[9px] rounded-[8px] border-[1.5px] border-ink/15 text-ink no-underline"
                    >
                      Join
                    </a>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      ))}
    </div>
  )
}
