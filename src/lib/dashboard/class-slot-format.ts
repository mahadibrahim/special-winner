/**
 * Shared pure formatters for a class slot template's weekday+time and a
 * membership's monthly class allotment.
 *
 * Most small pure helpers in the classes dashboard surface area are
 * deliberately DUPLICATED per client island rather than imported (see
 * family-classes-card.tsx's "Helpers" section header comment) — that
 * convention exists to keep a `"use client"` island from pulling in
 * server-only dependencies through a shared module. These two helpers are
 * the documented exception (Task 11 of the classes-dashboard-launch plan):
 * `child-profile-data.ts` is a pure, DOM-free module unit-tested directly,
 * and importing family-classes-card.tsx's `formatDayTime`/`allotmentLabel`
 * into it would instead pull that island's Dialog/sonner/DashboardCard
 * imports into a supposedly pure test target — the "awkward" import
 * direction the plan calls out. Living here, both call sites (the family
 * card and the child profile) import the same implementation instead of
 * hand-copying the allotment string logic a second time.
 */

const WEEKDAY_NAMES_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const WEEKDAY_NAMES_LONG = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

/**
 * Formats a `class_slot_templates` weekday (0=Sunday) + "HH:MM[:SS]" start
 * time into a display string, e.g. "Wed 5:30 PM" (`style: "short"`, the
 * family card's original behavior) or "Wednesday 5:30 PM" (`style: "long"`,
 * used by the child profile's home-slot line).
 */
export function formatDayTime(
  weekday: number,
  startTime: string,
  style: "short" | "long" = "short",
): string {
  const names = style === "long" ? WEEKDAY_NAMES_LONG : WEEKDAY_NAMES_SHORT;
  const day = names[weekday] ?? `Day ${weekday}`
  const [hourStr, minuteStr] = startTime.slice(0, 5).split(":")
  const hour = Number(hourStr)
  const minute = Number(minuteStr)
  if (Number.isNaN(hour) || Number.isNaN(minute)) return `${day} ${startTime.slice(0, 5)}`
  const period = hour >= 12 ? "PM" : "AM"
  const hour12 = hour % 12 === 0 ? 12 : hour % 12
  return `${day} ${hour12}:${String(minute).padStart(2, "0")} ${period}`
}

/** "N classes left this month" / "Unlimited classes this month". */
export function allotmentLabel(remaining: number | "unlimited"): string {
  if (remaining === "unlimited") return "Unlimited classes this month"
  return `${remaining} class${remaining === 1 ? "" : "es"} left this month`
}
