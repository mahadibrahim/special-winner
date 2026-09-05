"use client"

import { useHydrationBeacon } from "@/lib/hooks/use-hydration-beacon"
import { Layers } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { EmptyState } from "@/components/ui/empty-state"

export interface CoachClassGroupView {
  templateId: string
  name: string
  weekday: number
  startTime: string
  role: "lead" | "assistant"
  sessionOnly: boolean
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

/**
 * "My Classes" — the coach-portal counterpart to CoachTeams. Lists every
 * class-slot template `getCoachGroups` resolved for the signed-in coach
 * (mounted server-side via /coach/classes.astro), each linking to its
 * roster/session detail page.
 */
export default function MyClasses({ classGroups }: { classGroups: CoachClassGroupView[] }) {
  useHydrationBeacon()

  if (classGroups.length === 0) {
    return (
      <EmptyState
        title="No classes assigned yet"
        description="Once you're assigned to lead or assist a class, it shows up here."
        icon={<Layers className="h-10 w-10" />}
      />
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">My Classes</h1>
        <p className="text-muted-foreground mt-1">Pick a class to see who's enrolled and what's coming up.</p>
      </div>
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
    </div>
  )
}
