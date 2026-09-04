"use client"

import { useEffect, useState } from "react"
import {
  ArrowLeft,
  Calendar,
  MapPin,
  Clock,
  TrendingUp,
  ChevronRight,
  Dumbbell,
  Users,
  Award,
  Trophy,
  Zap,
  Shirt,
  ShieldAlert,
  RefreshCw,
  Sparkles,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import { LoadingSkeleton } from "@/components/ui/loading-skeleton"
import { ErrorBanner } from "@/components/ui/error-banner"
import { useHydrationBeacon } from "@/lib/hooks/use-hydration-beacon"
import DevelopmentReport from "./development-report"
import AchievementsDisplay from "./achievements-display"
import {
  buildClassesSection,
  buildProfile,
  type ChildProfileData,
  type ClassesSection,
  type FamilyMemberApi,
  type Program,
  type RegistrationApiRow,
} from "./child-profile-data"
import type { FamilyScheduleEvent } from "@/lib/dashboard/schedule-events"

const eventTypeColors: Record<string, string> = {
  game: "text-amber-400 bg-amber-500/10",
  practice: "text-emerald-400 bg-emerald-500/10",
  class: "text-primary bg-blue-500/10",
  camp: "text-purple-400 bg-purple-500/10",
}

const programStatusStyles: Record<Program["status"], string> = {
  active: "border-emerald-500/50 text-emerald-400",
  upcoming: "border-amber-500/50 text-amber-400",
  completed: "border-gray-500/50 text-ink-muted",
}

interface ChildProfileProps {
  childId: string
}

function BackToDashboard() {
  return (
    <Button variant="ghost" size="sm" className="text-ink-muted hover:text-ink -ml-2" asChild>
      <a href="/dashboard">
        <ArrowLeft className="w-4 h-4 mr-2" />
        Back to Dashboard
      </a>
    </Button>
  )
}

type ChildProfileTab = "overview" | "progress" | "schedule" | "achievements"

const VALID_TABS: ChildProfileTab[] = ["overview", "progress", "schedule", "achievements"]

export default function ChildProfile({ childId }: ChildProfileProps) {
  // ChildProfile is mounted `client:load` at the top of
  // src/pages/dashboard/children/[id].astro, so it doubles as this page's
  // hydration beacon (repo convention — see children-overview.tsx's beacon
  // comment). E2E specs navigating to /dashboard/children/:id rely on
  // waitForHydration(page) finding this.
  useHydrationBeacon()

  const [activeTab, setActiveTab] = useState<ChildProfileTab>(() => {
    if (typeof window !== "undefined") {
      const t = new URLSearchParams(window.location.search).get("tab")
      if (t && (VALID_TABS as string[]).includes(t)) return t as ChildProfileTab
    }
    return "overview"
  })
  const [child, setChild] = useState<ChildProfileData | null>(null)
  const [classesSection, setClassesSection] = useState<ClassesSection | null>(null)
  const [classScheduleEvents, setClassScheduleEvents] = useState<FamilyScheduleEvent[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [notFound, setNotFound] = useState(false)
  const [reloadKey, setReloadKey] = useState(0)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(false)
    setNotFound(false)

    ;(async () => {
      try {
        // Summary/schedule are class-awareness ADDITIONS to this profile —
        // their failure degrades to "no classes section" / "no dated class
        // rows" rather than blocking the core member+registrations profile,
        // which is the page's original, still-primary contract.
        const [memberRes, regsRes, summaryRes, scheduleRes] = await Promise.all([
          fetch(`/api/family-members/${childId}`),
          fetch("/api/registrations"),
          fetch("/api/classes/summary"),
          fetch("/api/dashboard/schedule"),
        ])

        if (cancelled) return

        if (memberRes.status === 404) {
          setNotFound(true)
          return
        }
        if (!memberRes.ok || !regsRes.ok) {
          setError(true)
          return
        }

        const memberData = await memberRes.json()
        const regsData = await regsRes.json()
        if (cancelled) return

        const member: FamilyMemberApi = memberData.familyMember
        const regs: RegistrationApiRow[] = (regsData.registrations ?? []).filter(
          (r: RegistrationApiRow) => r.familyMember?.id === childId,
        )
        setChild(buildProfile(member, regs))

        if (summaryRes.ok) {
          const summaryData = await summaryRes.json()
          const summaryChild = (summaryData.children ?? []).find(
            (c: { familyMemberId: string }) => c.familyMemberId === childId,
          )
          setClassesSection(
            summaryChild
              ? buildClassesSection({
                  membership: summaryChild.membership ?? null,
                  enrollment: summaryChild.enrollment ?? null,
                  credits: summaryChild.credits ?? [],
                  kitSize: summaryChild.kitSize ?? null,
                  hasWaiverOnFile: summaryChild.hasWaiverOnFile ?? false,
                })
              : null,
          )
        } else {
          setClassesSection(null)
        }

        if (scheduleRes.ok) {
          const scheduleData = await scheduleRes.json()
          const events: FamilyScheduleEvent[] = scheduleData.events ?? []
          setClassScheduleEvents(events.filter((e) => e.childId === childId))
        } else {
          setClassScheduleEvents([])
        }
      } catch (err) {
        if (!cancelled) {
          console.error("Failed to load child profile:", err)
          setError(true)
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [childId, reloadKey])

  if (loading) {
    return (
      <div className="space-y-6">
        <BackToDashboard />
        <LoadingSkeleton rows={4} variant="card" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="space-y-6">
        <BackToDashboard />
        <ErrorBanner message="We couldn't load this profile. Please try again." />
        <Button size="sm" variant="outline" onClick={() => setReloadKey((k) => k + 1)}>
          Retry
        </Button>
      </div>
    )
  }

  if (notFound || !child) {
    return (
      <div className="space-y-6">
        <BackToDashboard />
        <div className="text-center py-16 px-6 rounded-2xl bg-paper border border-border">
          <Users className="w-12 h-12 text-ink-faint mx-auto mb-3" />
          <h2 className="text-ink font-medium mb-1">No child profile available</h2>
          <p className="text-sm text-ink-muted mb-4">
            Profiles appear here once a child is registered for a program.
          </p>
          <Button asChild size="sm">
            <a href="/programs">Browse programs</a>
          </Button>
        </div>
      </div>
    )
  }

  const activePrograms = child.programs.filter((p) => p.status === "active")

  return (
    <div className="space-y-6">
      <BackToDashboard />

      {/* Hero Header */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-white/[0.04] to-transparent border border-border">
        <div className="absolute top-0 right-0 w-96 h-96 rounded-full blur-3xl opacity-20 bg-gradient-to-br from-primary to-orange-500" />
        <div className="relative p-6 sm:p-8">
          <div className="flex flex-col sm:flex-row gap-6">
            {/* Avatar */}
            <div className="relative flex-shrink-0">
              <div className="w-24 h-24 sm:w-32 sm:h-32 rounded-2xl bg-gradient-to-br from-primary to-orange-500 p-1">
                <div className="w-full h-full rounded-xl bg-cream flex items-center justify-center overflow-hidden">
                  {child.avatarUrl ? (
                    <img
                      src={child.avatarUrl}
                      alt={`${child.firstName} ${child.lastName}`}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <span className="text-3xl sm:text-4xl font-bold text-ink ph-mask">
                      {child.firstName[0]}
                      {child.lastName[0]}
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Info */}
            <div className="flex-1">
              <h1 className="text-2xl sm:text-3xl font-bold text-ink mb-1 ph-mask">
                {child.firstName} {child.lastName}
              </h1>
              <div className="flex flex-wrap items-center gap-3 text-sm text-ink-muted mb-4">
                <span>{child.age != null ? `Age ${child.age}` : "Age —"}</span>
                <span className="text-ink-faint">•</span>
                <span className="ph-mask">
                  {child.dateOfBirth
                    ? `Born ${child.dateOfBirth.toLocaleDateString("en-US", {
                        month: "long",
                        day: "numeric",
                        year: "numeric",
                      })}`
                    : "DOB pending"}
                </span>
              </div>

              {activePrograms.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {activePrograms.map((program) => (
                    <Badge key={program.id} className="bg-cream-3 text-ink border-border">
                      {program.name}
                    </Badge>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Tab Navigation */}
      <div className="flex gap-1 p-1 rounded-xl bg-paper border border-border overflow-x-auto">
        {[
          { key: "overview", label: "Overview", icon: Users },
          { key: "progress", label: "Progress", icon: TrendingUp },
          { key: "schedule", label: "Schedule", icon: Calendar },
          { key: "achievements", label: "Achievements", icon: Award },
        ].map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => setActiveTab(key as typeof activeTab)}
            className={cn(
              "flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium whitespace-nowrap transition-all",
              activeTab === key
                ? "bg-cream-3 text-ink"
                : "text-ink-muted hover:text-ink-2 hover:bg-cream-2",
            )}
          >
            <Icon className="w-4 h-4" />
            {label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <div className="grid gap-6 lg:grid-cols-3">
        {/* Main Content */}
        <div className="lg:col-span-2 space-y-6">
          {activeTab === "overview" && (
            <>
              {classesSection && (
                <section
                  data-testid="child-classes-section"
                  className="p-5 rounded-2xl bg-paper border border-border mb-6"
                >
                  <div className="flex items-start justify-between gap-3 mb-3">
                    <h2 className="text-lg font-semibold text-ink flex items-center gap-2">
                      <Sparkles className="w-5 h-5 text-primary" />
                      Classes
                    </h2>
                    <Button variant="outline" size="sm" asChild>
                      <a href="/dashboard/family">Manage</a>
                    </Button>
                  </div>

                  <div className="space-y-2">
                    {classesSection.tierLine && (
                      <p className="text-sm text-ink">{classesSection.tierLine}</p>
                    )}
                    {classesSection.homeSlotLine && (
                      <div className="flex items-center gap-2 text-sm text-ink-muted">
                        <Clock className="w-3.5 h-3.5" />
                        {classesSection.homeSlotLine}
                      </div>
                    )}
                    {classesSection.renewsAt && (
                      <div className="flex items-center gap-2 text-sm text-ink-muted">
                        <RefreshCw className="w-3.5 h-3.5" />
                        Renews{" "}
                        {new Date(classesSection.renewsAt).toLocaleDateString("en-US", {
                          month: "long",
                          day: "numeric",
                        })}
                        {classesSection.cancelAtPeriodEnd ? " (cancels at period end)" : ""}
                      </div>
                    )}
                  </div>

                  <div className="flex flex-wrap items-center gap-2 mt-3">
                    {classesSection.kitSize && (
                      <Badge variant="outline" className="text-xs gap-1">
                        <Shirt className="w-3 h-3" />
                        Kit size {classesSection.kitSize}
                      </Badge>
                    )}
                    {!classesSection.hasWaiverOnFile && (
                      <Badge
                        variant="outline"
                        className="text-xs gap-1 border-amber-500/50 text-amber-500"
                      >
                        <ShieldAlert className="w-3 h-3" />
                        Waiver needed
                      </Badge>
                    )}
                  </div>
                </section>
              )}

              <section>
                <h2 className="text-lg font-semibold text-ink mb-4 flex items-center gap-2">
                  <Dumbbell className="w-5 h-5 text-primary" />
                  Programs
                </h2>
                {child.programs.length === 0 ? (
                  <div className="text-center py-10 px-6 rounded-xl bg-paper border border-border">
                    <p className="text-sm text-ink-muted mb-4">
                      <span className="ph-mask">{child.firstName}</span> isn't registered for any programs yet.
                    </p>
                    <Button asChild size="sm">
                      <a href="/programs">Browse programs</a>
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {child.programs.map((program) => (
                      <div
                        key={program.id}
                        className="p-4 rounded-xl bg-paper border border-border transition-all"
                      >
                        <div className="flex items-start justify-between mb-3">
                          <div>
                            <div className="flex items-center gap-2 mb-1">
                              <h3 className="font-semibold text-ink">{program.name}</h3>
                              <Badge
                                variant="outline"
                                className={cn("text-xs", programStatusStyles[program.status])}
                              >
                                {program.status}
                              </Badge>
                            </div>
                            <p className="text-sm text-ink-muted">{program.sport}</p>
                          </div>
                          <Button variant="ghost" size="sm" className="text-ink-muted hover:text-ink" asChild>
                            <a href={`/dashboard/registrations/${program.id}`}>
                              <ChevronRight className="w-4 h-4" />
                            </a>
                          </Button>
                        </div>
                        {program.schedule && (
                          <div className="flex items-center gap-2 text-sm text-ink-muted mb-2">
                            <Clock className="w-3.5 h-3.5" />
                            {program.schedule}
                          </div>
                        )}
                        {program.location && (
                          <div className="flex items-center gap-2 text-sm text-ink-muted">
                            <MapPin className="w-3.5 h-3.5" />
                            {program.location}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </section>
            </>
          )}

          {activeTab === "progress" && (
            <section>
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold text-ink flex items-center gap-2">
                  <TrendingUp className="w-5 h-5 text-primary" />
                  Development Progress
                </h2>
                <Button variant="outline" size="sm" asChild>
                  <a href={`/dashboard/children/${childId}/development`}>
                    View Full Report
                    <ChevronRight className="w-4 h-4 ml-1" />
                  </a>
                </Button>
              </div>
              <DevelopmentReport familyMemberId={childId} />
            </section>
          )}

          {activeTab === "schedule" && (
            <>
              {classScheduleEvents.length > 0 && (
                <section className="mb-6">
                  <h2 className="text-lg font-semibold text-ink mb-4 flex items-center gap-2">
                    <Sparkles className="w-5 h-5 text-primary" />
                    Classes
                  </h2>
                  <div className="space-y-2">
                    {classScheduleEvents.map((event) => {
                      const startsAt = new Date(event.startsAt)
                      return (
                        <div
                          key={event.id}
                          data-testid="class-schedule-row"
                          className="flex items-center gap-4 p-4 rounded-xl bg-paper border border-border transition-all"
                        >
                          <div className="text-center w-12">
                            <div className="text-[10px] font-bold text-ink-muted uppercase">
                              {startsAt.toLocaleDateString("en-US", { weekday: "short" })}
                            </div>
                            <div className="text-xl font-bold text-ink">{startsAt.getDate()}</div>
                          </div>
                          <div
                            className={cn(
                              "w-10 h-10 rounded-lg flex items-center justify-center",
                              eventTypeColors.class,
                            )}
                          >
                            <Users className="w-5 h-5" />
                          </div>
                          <div className="flex-1">
                            <h4 className="font-medium text-ink">{event.title}</h4>
                            <div className="flex items-center gap-3 text-sm text-ink-muted">
                              <span className="flex items-center gap-1">
                                <Clock className="w-3 h-3" />
                                {startsAt.toLocaleTimeString("en-US", {
                                  hour: "numeric",
                                  minute: "2-digit",
                                })}
                              </span>
                              {event.location && (
                                <span className="flex items-center gap-1">
                                  <MapPin className="w-3 h-3" />
                                  {event.location}
                                </span>
                              )}
                              {event.projected && (
                                <Badge variant="outline" className="text-[10px]">
                                  Planned
                                </Badge>
                              )}
                            </div>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </section>
              )}

              <section>
                <h2 className="text-lg font-semibold text-ink mb-4 flex items-center gap-2">
                  <Calendar className="w-5 h-5 text-primary" />
                  Upcoming Schedule
                </h2>
                {child.upcomingEvents.length === 0 ? (
                  <div className="text-center py-10 px-6 rounded-xl bg-paper border border-border">
                    <Calendar className="w-10 h-10 text-ink-faint mx-auto mb-3" />
                    <p className="text-sm text-ink-muted">
                      No upcoming sessions yet. New seasons appear here once <span className="ph-mask">{child.firstName}</span> is registered.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {child.upcomingEvents.map((event) => (
                      <div
                        key={event.id}
                        className="flex items-center gap-4 p-4 rounded-xl bg-paper border border-border transition-all"
                      >
                        <div className="text-center w-12">
                          <div className="text-[10px] font-bold text-ink-muted uppercase">
                            {event.date.toLocaleDateString("en-US", { weekday: "short" })}
                          </div>
                          <div className="text-xl font-bold text-ink">{event.date.getDate()}</div>
                        </div>
                        <div
                          className={cn(
                            "w-10 h-10 rounded-lg flex items-center justify-center",
                            eventTypeColors[event.type],
                          )}
                        >
                          {event.type === "game" ? (
                            <Trophy className="w-5 h-5" />
                          ) : event.type === "practice" ? (
                            <Dumbbell className="w-5 h-5" />
                          ) : event.type === "camp" ? (
                            <Zap className="w-5 h-5" />
                          ) : (
                            <Users className="w-5 h-5" />
                          )}
                        </div>
                        <div className="flex-1">
                          <h4 className="font-medium text-ink">{event.title}</h4>
                          <div className="flex items-center gap-3 text-sm text-ink-muted">
                            <span className="flex items-center gap-1">
                              <Clock className="w-3 h-3" />
                              {event.time}
                            </span>
                            <span className="flex items-center gap-1">
                              <MapPin className="w-3 h-3" />
                              {event.location}
                            </span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </section>
            </>
          )}

          {activeTab === "achievements" && (
            <section>
              <h2 className="text-lg font-semibold text-ink mb-4 flex items-center gap-2">
                <Award className="w-5 h-5 text-primary" />
                Achievements
              </h2>
              <AchievementsDisplay familyMemberId={childId} showLocked={true} />
            </section>
          )}
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          {/* Next Up */}
          <div className="p-5 rounded-2xl bg-paper border border-border">
            <h3 className="font-semibold text-ink mb-4 flex items-center gap-2">
              <Calendar className="w-4 h-4 text-primary" />
              Next Up
            </h3>
            {child.upcomingEvents.length === 0 ? (
              <p className="text-sm text-ink-muted">Nothing scheduled yet.</p>
            ) : (
              <>
                <div className="space-y-3">
                  {child.upcomingEvents.slice(0, 3).map((event) => (
                    <div key={event.id} className="flex items-center gap-3">
                      <div
                        className={cn(
                          "w-8 h-8 rounded-lg flex items-center justify-center text-xs",
                          eventTypeColors[event.type],
                        )}
                      >
                        {event.date.getDate()}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-ink truncate">{event.title}</p>
                        <p className="text-xs text-ink-muted">{event.time}</p>
                      </div>
                    </div>
                  ))}
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setActiveTab("schedule")}
                  className="w-full mt-3 text-ink-muted hover:text-ink"
                >
                  View Full Schedule
                </Button>
              </>
            )}
          </div>

          {/* Recent Achievements */}
          <div className="p-5 rounded-2xl bg-paper border border-border">
            <h3 className="font-semibold text-ink mb-4 flex items-center gap-2">
              <Award className="w-4 h-4 text-amber-400" />
              Recent Achievements
            </h3>
            <AchievementsDisplay familyMemberId={childId} compact limit={3} showLocked={false} />
          </div>

          {/* Season History */}
          {child.seasonHistory.length > 0 && (
            <div className="p-5 rounded-2xl bg-paper border border-border">
              <h3 className="font-semibold text-ink mb-4">Season History</h3>
              <div className="space-y-2">
                {child.seasonHistory.map((season, i) => (
                  <div
                    key={i}
                    className="flex items-center justify-between py-2 border-b border-border last:border-0"
                  >
                    <div>
                      <p className="text-sm text-ink">{season.program}</p>
                      <p className="text-xs text-ink-muted">{season.sport}</p>
                    </div>
                    <span className="text-xs text-ink-muted">{season.season}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
