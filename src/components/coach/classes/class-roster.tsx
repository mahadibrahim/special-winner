"use client"

import { useEffect, useState } from "react"
import { useHydrationBeacon } from "@/lib/hooks/use-hydration-beacon"
import { Users, CalendarClock, ArrowLeft, Sparkles, Target } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { EmptyState } from "@/components/ui/empty-state"
import { LoadingSkeleton } from "@/components/ui/loading-skeleton"
import { ErrorBanner } from "@/components/ui/error-banner"
import ClassGlows from "./class-glows"
import PlayerAssessmentForm from "../player-assessment-form"

interface Enrollment {
  enrollmentId: string
  familyMemberId: string
  childName: string
  age: number | null
  kitSize: string | null
  startedAt: string
}

interface SessionCoach {
  coachUserId: string
  role: "lead" | "assistant"
  name: string
}

interface SessionBooking {
  familyMemberId: string | null
  childName: string
  status: string
  checkedInAt: string | null
}

interface UpcomingSession {
  sessionId: string
  startsAt: string
  capacity: number
  coaches: SessionCoach[]
  bookings: SessionBooking[]
}

interface ClassRosterResponse {
  writable: boolean
  role: "lead" | "assistant" | null
  template: {
    id: string
    name: string
    weekday: number
    startTime: string
    sportLabel: string
    capacity: number
    /** Resolved sport for the per-child assessment flow's skill picker —
     *  null when the template's free-text `sportLabel` doesn't match any of
     *  this org's configured sports (see the roster endpoint's header
     *  comment). The "Assess" action is hidden per-row when null. */
    sport: { id: string; name: string } | null
  }
  enrollments: Enrollment[]
  upcomingSessions: UpcomingSession[]
}

const WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]

/** "16:00:00" -> "4:00 PM". Slot times are wall-clock strings (HH:MM:SS),
 *  not instants — no timezone conversion needed. Mirrors my-classes.tsx's
 *  identical helper (small enough that sharing a module isn't worth it). */
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

function statusLabel(status: string): string {
  switch (status) {
    case "confirmed":
      return "Confirmed"
    case "pending_payment":
      return "Pending payment"
    case "pending_claim":
      return "Pending claim"
    default:
      return status
  }
}

export default function ClassRoster({ templateId }: { templateId: string }) {
  useHydrationBeacon()

  const [data, setData] = useState<ClassRosterResponse | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  // Which session's Glows & Grows modal is open, if any. Only offered when
  // the page-level `writable` flag is true — a read-only coach can't write
  // glows for any session on this class, so there's no point showing the
  // action. (A substitute coach assigned to only ONE materialized session
  // is `writable: true` at the page level per the roster endpoint's tier-a
  // logic but could still 403 on a DIFFERENT session's glows endpoint —
  // the modal surfaces that via its own error state if it happens, same
  // graceful-degradation precedent as Task 5's roster page.)
  const [glowsSessionId, setGlowsSessionId] = useState<string | null>(null)

  // Which enrolled child the per-child assessment modal is open for, if
  // any. Same `writable`-gated availability as glows above; additionally
  // requires `template.sport` to resolve (see PlayerAssessmentForm's
  // `classSport` prop) — no sport means no skill list to assess against.
  const [assessTarget, setAssessTarget] = useState<{
    familyMemberId: string
    childName: string
    age: number | null
  } | null>(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    fetch(`/api/coach/classes/${templateId}`)
      .then(async (res) => {
        if (res.status === 403) {
          throw new Error("You're not staffed on this class.")
        }
        if (res.status === 404) {
          throw new Error("This class couldn't be found.")
        }
        if (!res.ok) {
          throw new Error("Failed to load the class.")
        }
        return (await res.json()) as ClassRosterResponse
      })
      .then((json) => {
        if (!cancelled) setData(json)
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Couldn't load the class. Try refreshing.")
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [templateId])

  if (loading) {
    return (
      <div className="max-w-3xl space-y-6">
        <LoadingSkeleton rows={4} />
      </div>
    )
  }

  if (error || !data) {
    return (
      <div className="max-w-3xl space-y-4">
        <a href="/coach/classes" className="inline-flex items-center gap-1.5 text-sm text-primary hover:underline">
          <ArrowLeft className="h-4 w-4" /> Back to My Classes
        </a>
        <ErrorBanner message={error ?? "Couldn't load the class."} />
      </div>
    )
  }

  const { template, role, writable, enrollments, upcomingSessions } = data

  return (
    <div className="max-w-3xl space-y-8">
      <div className="space-y-3">
        <a href="/coach/classes" className="inline-flex items-center gap-1.5 text-sm text-primary hover:underline">
          <ArrowLeft className="h-4 w-4" /> Back to My Classes
        </a>
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-2xl font-semibold">{template.name}</h1>
          {role && <Badge variant={role === "lead" ? "default" : "outline"}>{role === "lead" ? "Lead" : "Assistant"}</Badge>}
          {!writable && (
            <Badge variant="outline" className="text-xs" data-testid="class-roster-readonly">
              Read only
            </Badge>
          )}
        </div>
        <p className="text-sm text-muted-foreground">
          {template.sportLabel} &middot; {WEEKDAY_LABELS[template.weekday]}s &middot; {formatStartTime(template.startTime)}
        </p>
      </div>

      <section className="space-y-3">
        <h2 className="font-semibold text-ink text-lg">Enrolled children</h2>
        {enrollments.length === 0 ? (
          <EmptyState
            title="No active enrollments"
            description="Children enrolled in this class will show up here."
            icon={<Users className="h-8 w-8" />}
          />
        ) : (
          <div className="rounded-lg border border-border bg-cream-2 overflow-hidden overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-cream border-b border-border">
                <tr className="text-left">
                  <th className="px-4 py-2 font-medium text-ink-muted">Child</th>
                  <th className="px-4 py-2 font-medium text-ink-muted">Age</th>
                  <th className="px-4 py-2 font-medium text-ink-muted">Kit size</th>
                  {writable && <th className="px-4 py-2 font-medium text-ink-muted">Actions</th>}
                </tr>
              </thead>
              <tbody>
                {enrollments.map((e) => (
                  <tr key={e.enrollmentId} className="border-t border-border" data-testid="class-roster-row">
                    <td className="px-4 py-3 font-medium text-ink">{e.childName}</td>
                    <td className="px-4 py-3 text-ink-muted">{e.age ?? "—"}</td>
                    <td className="px-4 py-3 text-ink-muted">{e.kitSize ?? "—"}</td>
                    {writable && (
                      <td className="px-4 py-3">
                        {template.sport ? (
                          <Button
                            variant="outline"
                            size="sm"
                            data-testid="class-assess-open"
                            onClick={() =>
                              setAssessTarget({ familyMemberId: e.familyMemberId, childName: e.childName, age: e.age })
                            }
                          >
                            <Target className="h-3.5 w-3.5" />
                            Assess
                          </Button>
                        ) : (
                          <span className="text-xs text-ink-faint">Sport not configured</span>
                        )}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="font-semibold text-ink text-lg">Upcoming sessions</h2>
        {upcomingSessions.length === 0 ? (
          <EmptyState
            title="No upcoming sessions"
            description="Sessions materialize from this class's weekly schedule."
            icon={<CalendarClock className="h-8 w-8" />}
          />
        ) : (
          <div className="space-y-4">
            {upcomingSessions.map((session) => (
              <div
                key={session.sessionId}
                data-testid="class-session-row"
                className="rounded-lg border border-border bg-cream-2 p-4 space-y-3"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-medium text-ink">{formatDateTime(session.startsAt)}</p>
                  <div className="flex flex-wrap gap-1.5">
                    {session.coaches.length === 0 ? (
                      <Badge variant="outline" className="text-xs">
                        Unassigned
                      </Badge>
                    ) : (
                      session.coaches.map((c) => (
                        <Badge key={c.coachUserId} variant="outline" className="text-xs">
                          {c.name} ({c.role === "lead" ? "Lead" : "Assist"})
                        </Badge>
                      ))
                    )}
                  </div>
                </div>
                {session.bookings.length === 0 ? (
                  <p className="text-sm text-ink-muted">No children booked yet.</p>
                ) : (
                  <ul className="text-sm divide-y divide-border">
                    {session.bookings.map((b, idx) => (
                      <li
                        key={b.familyMemberId ?? `${session.sessionId}-${idx}`}
                        className="py-1.5 flex items-center justify-between gap-2"
                      >
                        <span className="text-ink">{b.childName}</span>
                        <span className="text-ink-muted text-xs">
                          {statusLabel(b.status)}
                          {b.checkedInAt ? " · Checked in" : ""}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
                {writable && (
                  <Button
                    variant="outline"
                    size="sm"
                    data-testid="class-glows-open"
                    onClick={() => setGlowsSessionId(session.sessionId)}
                  >
                    <Sparkles className="h-3.5 w-3.5" />
                    Glows &amp; grows
                  </Button>
                )}
              </div>
            ))}
          </div>
        )}
      </section>

      {glowsSessionId && (
        <ClassGlows sessionId={glowsSessionId} onClose={() => setGlowsSessionId(null)} />
      )}

      {assessTarget && template.sport && (
        <PlayerAssessmentForm
          playerId={assessTarget.familyMemberId}
          playerName={assessTarget.childName}
          playerAge={assessTarget.age ?? undefined}
          teams={[]}
          classSport={template.sport}
          isOpen={true}
          onClose={() => setAssessTarget(null)}
        />
      )}
    </div>
  )
}
