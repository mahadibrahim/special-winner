"use client"

import { useState } from "react"
import { useHydrationBeacon } from "@/lib/hooks/use-hydration-beacon"
import { Layers, Sparkles, Tent } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { EmptyState } from "@/components/ui/empty-state"
import ClassGlows from "./class-glows"

export interface CoachClassGroupView {
  templateId: string
  name: string
  weekday: number
  startTime: string
  role: "lead" | "assistant"
  sessionOnly: boolean
}

/** Upcoming camp day the coach is staffed on (Camps Phase 4 Task 6) —
 *  `startsAt` is an ISO string (serialized at the Astro/API boundary). */
export interface CoachCampSessionView {
  sessionId: string
  label: string
  startsAt: string
  venueName: string
}

const WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]

/** "16:00:00" -> "4:00 PM". Slot times are wall-clock strings (HH:MM:SS),
 *  not instants — no timezone conversion needed here. */
function formatStartTime(time: string): string {
  const [hourStr, minuteStr] = time.split(":")
  const hour = Number(hourStr)
  const minute = Number(minuteStr)
  const period = hour >= 12 ? "PM" : "AM"
  const hour12 = hour % 12 === 0 ? 12 : hour % 12
  return `${hour12}:${String(minute).padStart(2, "0")} ${period}`
}

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  })
}

/**
 * "My Classes" — the coach-portal counterpart to CoachTeams. Lists every
 * class-slot template `getCoachGroups` resolved for the signed-in coach
 * (mounted server-side via /coach/classes.astro), each linking to its
 * roster/session detail page — plus the coach's upcoming camp days
 * (Camps Phase 4 Task 6), each opening the same Glows & Grows capture
 * flow class sessions use (`ClassGlows` → /api/coach/class-sessions/:id/glows,
 * which accepts camp day-sessions too).
 */
export default function MyClasses({
  classGroups,
  campSessions,
}: {
  classGroups: CoachClassGroupView[]
  campSessions: CoachCampSessionView[]
}) {
  useHydrationBeacon()

  // Which camp day's Glows & Grows modal is open, if any.
  const [glowsSessionId, setGlowsSessionId] = useState<string | null>(null)

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold">My Classes</h1>
        <p className="text-muted-foreground mt-1">Pick a class to see who's enrolled and what's coming up.</p>
      </div>

      {classGroups.length === 0 ? (
        <EmptyState
          title="No classes assigned yet"
          description="Once you're assigned to lead or assist a class, it shows up here."
          icon={<Layers className="h-10 w-10" />}
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {classGroups.map((group) => (
            <a
              key={group.templateId}
              href={`/coach/classes/${group.templateId}`}
              data-testid="my-class-card"
              className="block"
            >
              <Card className="h-full transition-colors hover:border-primary/40">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-lg">{group.name}</CardTitle>
                  <Badge variant={group.role === "lead" ? "default" : "outline"}>
                    {group.role === "lead" ? "Lead" : "Assistant"}
                  </Badge>
                </CardHeader>
                <CardContent className="pt-2 space-y-2">
                  <p className="text-sm text-muted-foreground">
                    {WEEKDAY_LABELS[group.weekday]} &middot; {formatStartTime(group.startTime)}
                  </p>
                  {group.sessionOnly && (
                    <Badge variant="outline" className="text-xs">
                      Substitute (session only)
                    </Badge>
                  )}
                </CardContent>
              </Card>
            </a>
          ))}
        </div>
      )}

      <section className="space-y-4">
        <div>
          <h2 className="text-xl font-semibold">Camp days</h2>
          <p className="text-muted-foreground mt-1 text-sm">
            Camp days you're coaching in the next week.
          </p>
        </div>
        {campSessions.length === 0 ? (
          <EmptyState
            title="No camp days coming up"
            description="When you're coaching a camp group or staffed on a camp day, it shows up here."
            icon={<Tent className="h-10 w-10" />}
          />
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {campSessions.map((session) => (
              <Card key={session.sessionId} data-testid="camp-day-card" className="h-full">
                <CardHeader className="pb-2">
                  <CardTitle className="text-lg">{session.label}</CardTitle>
                </CardHeader>
                <CardContent className="pt-2 space-y-3">
                  <p className="text-sm text-muted-foreground">
                    {formatDateTime(session.startsAt)} &middot; {session.venueName}
                  </p>
                  <Button
                    variant="outline"
                    size="sm"
                    data-testid="camp-glows-open"
                    onClick={() => setGlowsSessionId(session.sessionId)}
                  >
                    <Sparkles className="h-3.5 w-3.5" />
                    Glows &amp; grows
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </section>

      {glowsSessionId && (
        <ClassGlows sessionId={glowsSessionId} onClose={() => setGlowsSessionId(null)} />
      )}
    </div>
  )
}
