"use client"

import { useEffect, useState } from "react"
import {
  ChevronRight,
  Star,
  TrendingUp,
  Award,
  MoreHorizontal,
  Plus,
  Sparkles
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import { LoadingSkeleton } from "@/components/ui/loading-skeleton"
import { ErrorBanner } from "@/components/ui/error-banner"
import { useHydrationBeacon } from "@/lib/hooks/use-hydration-beacon"

interface Program {
  id: string
  name: string
  sport: string
  team?: string
  role?: string
  status: "active" | "upcoming" | "completed"
}

interface SkillAssessment {
  skill: string
  level: number // 1-5
  trend: "up" | "stable" | "new"
}

interface Child {
  id: string
  firstName: string
  lastName: string
  age: number
  avatarUrl?: string
  programs: Program[]
  recentAchievement?: string
  skillAssessments: SkillAssessment[]
  coachRating?: number // 1-5
  nextEvent?: {
    title: string
    date: string
  }
}

interface FamilyMemberApi {
  id: string
  firstName: string
  lastName: string
  birthDate: string
}

interface RegistrationApiRow {
  id: string
  status: string
  familyMember: { id: string }
  season: { id: string; name: string; startDate: string; endDate: string }
  program: { id: string; name: string }
  sport: { name: string }
}

function parseLocalDate(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number)
  return new Date(y, (m ?? 1) - 1, d ?? 1)
}

function computeAge(birthDate: string): number {
  const dob = parseLocalDate(birthDate)
  const now = new Date()
  let age = now.getFullYear() - dob.getFullYear()
  const pre =
    now.getMonth() < dob.getMonth() ||
    (now.getMonth() === dob.getMonth() && now.getDate() < dob.getDate())
  if (pre) age -= 1
  return age
}

function statusForSeason(start: string, end: string): "upcoming" | "active" | "completed" {
  const now = Date.now()
  if (parseLocalDate(start).getTime() > now) return "upcoming"
  if (parseLocalDate(end).getTime() < now) return "completed"
  return "active"
}

// sportColors removed — avatars use flat design-system tokens

function SkillBar({ level, trend }: { level: number; trend: string }) {
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 bg-cream-3 rounded-full overflow-hidden">
        <div
          className="h-full bg-primary rounded-full transition-all duration-500"
          style={{ width: `${(level / 5) * 100}%` }}
        />
      </div>
      {trend === "up" && (
        <TrendingUp className="w-3 h-3 text-sage" />
      )}
      {trend === "new" && (
        <Sparkles className="w-3 h-3 text-ochre" />
      )}
    </div>
  )
}

function ChildCard({ child }: { child: Child }) {
  const [expanded, setExpanded] = useState(false)

  return (
    <div className="group relative overflow-hidden rounded-2xl bg-paper border border-border hover:border-border transition-all">
      {/* Accent bar */}
      <div className="absolute top-0 left-0 right-0 h-1 bg-primary" />

      <div className="p-5">
        {/* Header */}
        <div className="flex items-start gap-4 mb-4">
          {/* Avatar */}
          <div className="relative w-14 h-14 rounded-xl bg-primary flex items-center justify-center text-white font-bold text-lg">
            {child.firstName[0]}{child.lastName[0]}
            {child.coachRating && child.coachRating >= 4.5 && (
              <div className="absolute -top-1 -right-1 w-5 h-5 bg-ochre rounded-full flex items-center justify-center">
                <Star className="w-3 h-3 text-white fill-white" />
              </div>
            )}
          </div>

          {/* Name & Info */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <h3 className="font-semibold text-ink text-lg">
                {child.firstName}
              </h3>
              <span className="text-sm text-ink-muted">
                Age {child.age}
              </span>
            </div>
            {child.nextEvent && (
              <p className="text-sm text-ink-muted mt-0.5">
                Next: <span className="text-ink">{child.nextEvent.title}</span>
                <span className="text-ink-faint"> • </span>
                <span className="text-primary">{child.nextEvent.date}</span>
              </p>
            )}
          </div>

          {/* Actions */}
          <Button variant="ghost" size="icon" className="text-ink-muted hover:text-ink -mr-2">
            <MoreHorizontal className="w-5 h-5" />
          </Button>
        </div>

        {/* Programs */}
        <div className="flex flex-wrap gap-2 mb-4">
          {child.programs.map((program) => (
            <a
              key={program.id}
              href={`/dashboard/registrations/${program.id}`}
              className="inline-block focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 rounded-md"
            >
              <Badge
                variant="outline"
                className={cn(
                  "border-border text-xs font-medium hover:border-primary/40 hover:bg-cream-2 transition-colors cursor-pointer",
                  program.status === "active" ? "text-ink bg-cream-2" : "text-ink-muted"
                )}
              >
                {program.team || program.name}
                {program.status === "upcoming" && (
                  <span className="ml-1 text-ochre">• Soon</span>
                )}
              </Badge>
            </a>
          ))}
        </div>

        {/* Achievement Banner */}
        {child.recentAchievement && (
          <div className="flex items-center gap-2 p-3 rounded-lg bg-amber-500/10 border border-amber-500/20 mb-4">
            <Award className="w-4 h-4 text-ochre flex-shrink-0" />
            <span className="text-sm text-ink-2">{child.recentAchievement}</span>
          </div>
        )}

        {/* Skills Preview */}
        <div className="space-y-2">
          <button
            onClick={() => setExpanded(!expanded)}
            className="flex items-center justify-between w-full text-left"
          >
            <span className="text-xs font-medium text-ink-muted uppercase tracking-wider">
              Development Progress
            </span>
            <ChevronRight className={cn(
              "w-4 h-4 text-ink-faint transition-transform",
              expanded && "rotate-90"
            )} />
          </button>

          <div className={cn(
            "grid gap-3 overflow-hidden transition-all",
            expanded ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"
          )}>
            <div className="overflow-hidden">
              {child.skillAssessments.map((assessment) => (
                <div key={assessment.skill} className="flex items-center gap-3 py-2">
                  <span className="text-sm text-ink-muted w-28 truncate">
                    {assessment.skill}
                  </span>
                  <div className="flex-1">
                    <SkillBar level={assessment.level} trend={assessment.trend} />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {!expanded && (
            <div className="flex gap-1">
              {child.skillAssessments.slice(0, 4).map((_, i) => (
                <div key={i} className="flex-1 h-1 bg-cream-3 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-primary/60 rounded-full"
                    style={{ width: `${(child.skillAssessments[i].level / 5) * 100}%` }}
                  />
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Quick Actions */}
        <div className="flex items-center gap-2 mt-4 pt-4 border-t border-border">
          <Button
            asChild
            variant="ghost"
            size="sm"
            className="flex-1 text-ink-muted hover:text-ink hover:bg-cream-2"
          >
            <a href={`/dashboard/children/${child.id}`}>View Profile</a>
          </Button>
          <Button
            asChild
            variant="ghost"
            size="sm"
            className="flex-1 text-ink-muted hover:text-ink hover:bg-cream-2"
          >
            <a
              href={`/dashboard/children/${child.id}/development`}
              data-testid="child-development-link"
              aria-label={`View development for ${child.firstName}`}
            >
              Development
            </a>
          </Button>
          <Button
            asChild
            variant="ghost"
            size="sm"
            className="flex-1 text-ink-muted hover:text-ink hover:bg-cream-2"
          >
            <a href="/dashboard/schedule">Schedule</a>
          </Button>
          <Button
            asChild
            variant="ghost"
            size="sm"
            className="text-primary hover:text-primary hover:bg-primary/10"
          >
            <a href={`/dashboard/children/${child.id}`} aria-label={`Open ${child.firstName}'s profile`}>
              <ChevronRight className="w-4 h-4" />
            </a>
          </Button>
        </div>
      </div>
    </div>
  )
}

export default function ChildrenOverview() {
  // ChildrenOverview is mounted `client:load` in family.astro so it doubles
  // as this page's hydration beacon (repo convention: the beacon lives on
  // the top-level client:load island — client:visible islands below the
  // fold may never hydrate before waitForHydration's timeout). E2E specs
  // that navigate from /dashboard/family (e.g.
  // tests/e2e/development-radar.spec.ts) rely on `waitForHydration(page)`
  // finding this.
  useHydrationBeacon()

  const [children, setChildren] = useState<Child[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [reloadKey, setReloadKey] = useState(0)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(false)
    ;(async () => {
      try {
        const [familyRes, regsRes] = await Promise.all([
          fetch("/api/family-members"),
          fetch("/api/registrations"),
        ])
        if (cancelled) return
        // family-members is the source of truth for the athlete list; if it
        // fails, surface an error rather than a misleading "no athletes" state.
        if (!familyRes.ok) {
          setError(true)
          return
        }
        const familyData = await familyRes.json()
        const members: FamilyMemberApi[] = familyData.familyMembers ?? []
        const regs: RegistrationApiRow[] = regsRes.ok
          ? ((await regsRes.json()).registrations ?? [])
          : []
        if (cancelled) return
        const kids: Child[] = members.map((m) => ({
          id: m.id,
          firstName: m.firstName,
          lastName: m.lastName,
          age: computeAge(m.birthDate),
          programs: regs
            .filter((r) => r.familyMember.id === m.id && r.status !== "cancelled")
            .map((r) => ({
              id: r.id,
              name: r.program.name,
              sport: r.sport.name,
              team: r.season.name,
              status: statusForSeason(r.season.startDate, r.season.endDate),
            })),
          skillAssessments: [],
        }))
        setChildren(kids)
      } catch (err) {
        if (!cancelled) {
          console.error("Failed to load children:", err)
          setError(true)
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [reloadKey])

  return (
    <div className="space-y-5">
      {/* Section Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-ink">Your Athletes</h2>
          {!loading && !error && (
            <p className="text-sm text-ink-muted mt-0.5">
              {children.length} registered {children.length === 1 ? "child" : "children"}
            </p>
          )}
        </div>
        <Button size="sm" className="gap-1.5" asChild>
          <a href="/programs">
            <Plus className="w-4 h-4" />
            Add Child
          </a>
        </Button>
      </div>

      {/* Loading */}
      {loading && <LoadingSkeleton rows={2} variant="card" />}

      {/* Error — distinct from the empty state so a fetch failure isn't
          mistaken for "no athletes" */}
      {!loading && error && (
        <div className="space-y-3">
          <ErrorBanner message="We couldn't load your athletes. Please try again." />
          <Button size="sm" variant="outline" onClick={() => setReloadKey((k) => k + 1)}>
            Retry
          </Button>
        </div>
      )}

      {/* Children Grid */}
      {!loading && !error && children.length > 0 && (
        <div className="grid gap-4 md:grid-cols-2">
          {children.map((child) => (
            <ChildCard key={child.id} child={child} />
          ))}
        </div>
      )}

      {/* Empty State */}
      {!loading && !error && children.length === 0 && (
        <div className="text-center py-12 px-6 rounded-2xl bg-paper border border-border border-dashed">
          <div className="w-16 h-16 rounded-full bg-cream-2 flex items-center justify-center mx-auto mb-4">
            <Plus className="w-8 h-8 text-ink-faint" />
          </div>
          <h3 className="text-lg font-medium text-ink mb-2">Add Your First Child</h3>
          <p className="text-ink-muted text-sm mb-4 max-w-sm mx-auto">
            Register your children to start signing them up for programs and tracking their progress.
          </p>
          <Button className="gap-2" asChild>
            <a href="/programs">
              <Plus className="w-4 h-4" />
              Add Child
            </a>
          </Button>
        </div>
      )}
    </div>
  )
}
