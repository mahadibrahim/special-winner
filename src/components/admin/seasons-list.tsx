"use client"

import { useState, useEffect } from "react"
import { Plus, Pencil, Trash2, Loader2, Search, SearchX } from "lucide-react"
import { useHydrationBeacon } from "@/lib/hooks/use-hydration-beacon"
import { EmptyState } from "@/components/ui/empty-state"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Checkbox } from "@/components/ui/checkbox"
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "@/components/ui/select"
import { groupSpacesByLocation } from "@/lib/admin/group-spaces"
import { Badge } from "@/components/ui/badge"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { SeasonScaffoldPicker, type ScaffoldChoice } from "./season-scaffold-picker"
import { OfferingWizard } from "./offering-wizard/OfferingWizard"
import { toast } from "sonner"
import { toTimeInputValue } from "@/lib/time/time-of-day"
import { useConfirmDialog } from "@/components/ui/confirm-dialog"
import { formatDateOnly, formatTimeWindow } from "@/lib/time/format-date"
import { DAY_KEYS, DAY_LABELS, type DayKey } from "@/lib/programs/derive"
import {
  DIVISION_GENDERS,
  DIVISION_GENDER_LABEL,
  DIVISION_LEVELS,
  DIVISION_LEVEL_LABEL,
  type DivisionGender,
} from "@/lib/leagues/division-filters"

interface Season {
  id: string
  name: string
  slug: string
  startDate: string
  endDate: string
  registrationCloses?: string | null
  maxParticipants: number | null
  priceCents: number
  teamPriceCents: number | null
  earlyBirdDeadline: string | null
  earlyBirdPriceCents: number | null
  earlyBirdTeamPriceCents: number | null
  signupModes: string[]
  depositCents: number | null
  allowDeposit: boolean
  status: string
  scheduleNotes: string | null
  termSlug?: string | null
  termLabel?: string | null
  divisionGender?: DivisionGender | null
  skillLevel?: "a" | "b" | "c" | "d" | "open" | null
  dayOfWeek?: "mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun" | null
  startTime?: string | null
  endTime?: string | null
  venueId: string | null
  interestCount?: number
  createdAt?: string
  program: {
    id: string
    name: string
    slug: string
    programType?: string
    audienceType?: string
  }
  sport: { id: string; name: string; icon: string | null; color: string | null }
  location: { id: string; name: string }
  ageGroup: { id: string; name: string; minAge: number; maxAge: number } | null
}

interface Program {
  id: string
  name: string
  sport: { id: string; name: string; icon: string | null }
  location: { id: string; name: string }
}

interface AgeGroup {
  id: string
  name: string
  minAge: number
  maxAge: number
}

interface Venue {
  id: string
  name: string
  locationId: string
  location: { id: string; name: string }
}

const statusOptions = [
  { value: "draft", label: "Draft", color: "bg-gray-100 text-gray-700" },
  { value: "forming", label: "Forming", color: "bg-amber-100 text-amber-800" },
  { value: "open", label: "Open", color: "bg-green-100 text-green-700" },
  { value: "closed", label: "Closed", color: "bg-yellow-100 text-yellow-700" },
  { value: "active", label: "Active", color: "bg-blue-100 text-blue-700" },
  { value: "completed", label: "Completed", color: "bg-purple-100 text-purple-700" },
  { value: "cancelled", label: "Cancelled", color: "bg-red-100 text-red-700" },
]

// ---------------------------------------------------------------------------
// Filter helpers
// ---------------------------------------------------------------------------

/** Sentinel term-filter value for seasons without a termLabel. */
const NO_TERM = "__no_term__"

type SortKey = "start" | "closes" | "name" | "created"
type Facet = "status" | "term" | "type" | "audience" | "venue" | "day"

interface SeasonFilters {
  query: string
  status: string | null
  term: string | null
  type: string | null
  audience: string | null
  venue: string | null
  day: string | null
}

const EMPTY_FILTERS: SeasonFilters = {
  query: "",
  status: null,
  term: null,
  type: null,
  audience: null,
  venue: null,
  day: null,
}

/** Enum declaration order — keeps Type chips in a stable, sensible order. */
const PROGRAM_TYPE_ORDER = ["league", "camp", "clinic", "tournament", "training"]

/** Map program.audienceType (free-text, with legacy values) to youth/adult. */
function seasonAudience(s: Season): "youth" | "adult" {
  const a = s.program.audienceType
  return a === "adults" || a === "adult" ? "adult" : "youth" // legacy 'parents' → youth
}

/**
 * Does a season pass the active filters? `skipFacet` excludes one facet so
 * each chip group's counts reflect every OTHER active filter (same behavior
 * as the public catalog's chip counts).
 */
function seasonMatches(s: Season, f: SeasonFilters, skipFacet?: Facet): boolean {
  const q = f.query.trim().toLowerCase()
  if (q && !`${s.name} ${s.program.name}`.toLowerCase().includes(q)) return false
  if (skipFacet !== "status" && f.status && s.status !== f.status) return false
  if (skipFacet !== "term" && f.term && (s.termLabel || NO_TERM) !== f.term) return false
  if (skipFacet !== "type" && f.type && s.program.programType !== f.type) return false
  if (skipFacet !== "audience" && f.audience && seasonAudience(s) !== f.audience) return false
  if (skipFacet !== "venue" && f.venue && s.location.name !== f.venue) return false
  if (skipFacet !== "day" && f.day && s.dayOfWeek !== f.day) return false
  return true
}

/** "$120" for whole dollars, "$97.50" otherwise. */
function fmtUsd(cents: number): string {
  const dollars = cents / 100
  return Number.isInteger(dollars) ? `$${dollars}` : `$${dollars.toFixed(2)}`
}

/**
 * Capacity label. Two honesty rules, both verified against the enforcement
 * code (create-registration.ts):
 *
 * 1. The admin GET returns no registered count, so a "spots left" figure
 *    can't be computed here — maxParticipants is the CAP, labeled as such.
 * 2. maxParticipants counts PEOPLE, not teams: the capacity gate compares
 *    confirmed `registrations` rows (one per player) and only runs on the
 *    individual/free-agent path. Team signups never touch it — rosters are
 *    capped per-team by teams.maxRosterSize instead. So the label says
 *    "players", says "solo" when team mode is also on, and flags the cap as
 *    unused on team-only seasons (where nothing enforces it).
 */
function capacityLabel(s: Season): string {
  const modes = s.signupModes ?? ["individual"]
  const solo = modes.includes("individual")
  const team = modes.includes("team")
  if (s.maxParticipants == null) return "No player cap"
  const n = s.maxParticipants
  const noun = n === 1 ? "player" : "players"
  if (!solo && team) return `Cap ${n} unused (team-only)`
  if (solo && team) return `${n} solo ${noun} max`
  return `${n} ${noun} max`
}

/** Rounded filter chip row with per-option counts, catalog idiom. */
function FilterChipGroup({
  label,
  options,
  active,
  onChange,
}: {
  label: string
  options: Array<{ value: string; label: string; count: number }>
  active: string | null
  onChange: (v: string | null) => void
}) {
  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      <span className="text-[10px] tracking-[0.1em] uppercase text-ink-muted font-semibold mr-1">
        {label}:
      </span>
      <button
        type="button"
        onClick={() => onChange(null)}
        className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
          active === null
            ? "bg-ink text-cream border-ink"
            : "bg-paper text-ink-2 border-border hover:border-ink-muted"
        }`}
      >
        All
      </button>
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          onClick={() => onChange(active === opt.value ? null : opt.value)}
          className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
            active === opt.value
              ? "bg-ink text-cream border-ink"
              : "bg-paper text-ink-2 border-border hover:border-ink-muted"
          }`}
        >
          {opt.label} <span className="opacity-60 ml-0.5">{opt.count}</span>
        </button>
      ))}
    </div>
  )
}

export function SeasonsList() {
  useHydrationBeacon()
  const { confirm, dialog: confirmDialog } = useConfirmDialog()
  const [seasons, setSeasons] = useState<Season[]>([])
  const [programs, setPrograms] = useState<Program[]>([])
  const [ageGroups, setAgeGroups] = useState<AgeGroup[]>([])
  const [venues, setVenues] = useState<Venue[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [editingSeason, setEditingSeason] = useState<Season | null>(null)
  const [isWizardOpen, setIsWizardOpen] = useState(false)
  const [filters, setFilters] = useState<SeasonFilters>(EMPTY_FILTERS)
  const [sort, setSort] = useState<SortKey>("start")
  const [wizardLocationId, setWizardLocationId] = useState("")
  const [wizardSportId, setWizardSportId] = useState("")
  const [scaffold, setScaffold] = useState<ScaffoldChoice>({ type: "empty" })
  const [formData, setFormData] = useState({
    programId: "",
    ageGroupId: "",
    venueId: "",
    name: "",
    slug: "",
    startDate: "",
    endDate: "",
    registrationClosesDate: "",
    maxParticipants: "",
    priceCents: "",
    teamPriceCents: "",
    earlyBirdDeadlineDate: "",
    earlyBirdTeamPriceCents: "",
    allowIndividual: true,
    allowTeam: false,
    depositCents: "",
    allowDeposit: true,
    status: "draft",
    scheduleNotes: "",
    termSlug: "",
    termLabel: "",
    divisionGender: "",
    skillLevel: "",
    dayOfWeek: "",
    startTime: "",
    endTime: "",
  })

  useEffect(() => {
    fetchData()
  }, [])

  async function fetchData() {
    try {
      const [seasonsRes, programsRes, ageGroupsRes, venuesRes] = await Promise.all([
        // include_test=1 so admins see the full catalog (test fixtures included)
        // on /admin/seasons. Walk-up registration / re-registration callers
        // omit this flag and get the test-free list.
        fetch("/api/admin/seasons?include_test=1"),
        fetch("/api/admin/programs"),
        fetch("/api/admin/age-groups"),
        fetch("/api/admin/venues"),
      ])

      if (!seasonsRes.ok || !programsRes.ok || !ageGroupsRes.ok || !venuesRes.ok) {
        throw new Error("Failed to fetch data")
      }

      const [seasonsData, programsData, ageGroupsData, venuesData] = await Promise.all([
        seasonsRes.json(),
        programsRes.json(),
        ageGroupsRes.json(),
        venuesRes.json(),
      ])

      setSeasons(seasonsData.seasons)
      setPrograms(programsData.programs)
      setAgeGroups(ageGroupsData.ageGroups)
      setVenues(venuesData.venues || [])
    } catch (err) {
      setError("Failed to load data")
      console.error(err)
    } finally {
      setIsLoading(false)
    }
  }

  function openCreateDialog() {
    setEditingSeason(null)
    const today = new Date().toISOString().split("T")[0]
    setFormData({
      programId: programs[0]?.id || "",
      ageGroupId: "",
      venueId: "",
      name: "",
      slug: "",
      startDate: today,
      endDate: today,
      registrationClosesDate: "",
      maxParticipants: "",
      priceCents: "",
      teamPriceCents: "",
    earlyBirdDeadlineDate: "",
    earlyBirdTeamPriceCents: "",
      allowIndividual: true,
      allowTeam: false,
      depositCents: "",
      allowDeposit: true,
      status: "draft",
      scheduleNotes: "",
      termSlug: "",
      termLabel: "",
      divisionGender: "",
      skillLevel: "",
      dayOfWeek: "",
      startTime: "",
      endTime: "",
    })
    setScaffold({ type: "empty" })
    setIsDialogOpen(true)
  }

  function openEditDialog(season: Season) {
    setEditingSeason(season)
    const modes = season.signupModes ?? ["individual"]
    setFormData({
      programId: season.program.id,
      ageGroupId: season.ageGroup?.id || "",
      venueId: season.venueId || "",
      name: season.name,
      slug: season.slug,
      startDate: season.startDate,
      endDate: season.endDate,
      registrationClosesDate: season.registrationCloses
        ? new Date(season.registrationCloses).toISOString().slice(0, 10)
        : "",
      maxParticipants: season.maxParticipants?.toString() || "",
      priceCents: (season.priceCents / 100).toString(),
      teamPriceCents: season.teamPriceCents != null ? (season.teamPriceCents / 100).toString() : "",
      earlyBirdDeadlineDate: season.earlyBirdDeadline ? season.earlyBirdDeadline.slice(0, 10) : "",
      earlyBirdTeamPriceCents: season.earlyBirdTeamPriceCents != null ? (season.earlyBirdTeamPriceCents / 100).toString() : "",
      allowIndividual: modes.includes("individual"),
      allowTeam: modes.includes("team"),
      depositCents: season.depositCents ? (season.depositCents / 100).toString() : "",
      allowDeposit: season.allowDeposit,
      status: season.status,
      scheduleNotes: season.scheduleNotes || "",
      termSlug: season.termSlug || "",
      termLabel: season.termLabel || "",
      divisionGender: season.divisionGender || "",
      skillLevel: season.skillLevel || "",
      dayOfWeek: season.dayOfWeek || "",
      startTime: toTimeInputValue(season.startTime),
      endTime: toTimeInputValue(season.endTime),
    })
    setScaffold({ type: "empty" })
    setIsDialogOpen(true)
  }

  function handleNameChange(name: string) {
    setFormData((prev) => ({
      ...prev,
      name,
      slug: editingSeason ? prev.slug : name.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, ""),
    }))
  }

  function handleCloneSourceSelected(sourceSeasonId: string) {
    const source = seasons.find((s) => s.id === sourceSeasonId)
    if (!source) return
    const modes = source.signupModes ?? ["individual"]
    setFormData((prev) => ({
      ...prev,
      ageGroupId: source.ageGroup?.id || "",
      venueId: source.venueId || "",
      maxParticipants: source.maxParticipants?.toString() || "",
      priceCents: (source.priceCents / 100).toString(),
      teamPriceCents: source.teamPriceCents != null ? (source.teamPriceCents / 100).toString() : "",
      earlyBirdDeadlineDate: source.earlyBirdDeadline ? source.earlyBirdDeadline.slice(0, 10) : "",
      earlyBirdTeamPriceCents: source.earlyBirdTeamPriceCents != null ? (source.earlyBirdTeamPriceCents / 100).toString() : "",
      allowIndividual: modes.includes("individual"),
      allowTeam: modes.includes("team"),
      depositCents: source.depositCents ? (source.depositCents / 100).toString() : "",
      allowDeposit: source.allowDeposit,
      scheduleNotes: source.scheduleNotes || "",
      termSlug: source.termSlug || "",
      termLabel: source.termLabel || "",
      divisionGender: source.divisionGender || "",
      skillLevel: source.skillLevel || "",
      dayOfWeek: source.dayOfWeek || "",
      startTime: toTimeInputValue(source.startTime),
      endTime: toTimeInputValue(source.endTime),
    }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setIsSubmitting(true)
    setError(null)

    // Build signup_modes array from the two checkboxes; require at least one.
    const signupModes: string[] = []
    if (formData.allowIndividual) signupModes.push("individual")
    if (formData.allowTeam) signupModes.push("team")
    if (signupModes.length === 0) {
      setError("At least one signup mode (individual or team) must be enabled.")
      setIsSubmitting(false)
      return
    }

    try {
      const method = editingSeason ? "PUT" : "POST"
      const body = {
        ...(editingSeason ? { id: editingSeason.id } : {}),
        programId: formData.programId,
        ageGroupId: formData.ageGroupId || null,
        venueId: formData.venueId || null,
        name: formData.name,
        slug: formData.slug,
        startDate: formData.startDate,
        endDate: formData.endDate,
        // End-of-day in the admin's browser timezone → exact UTC instant.
        // Null clears it: the season then auto-closes the day after startDate.
        registrationCloses: formData.registrationClosesDate
          ? new Date(`${formData.registrationClosesDate}T23:59:59`).toISOString()
          : null,
        maxParticipants: formData.maxParticipants ? parseInt(formData.maxParticipants) : null,
        priceCents: Math.round(parseFloat(formData.priceCents || "0") * 100),
        teamPriceCents: formData.allowTeam && formData.teamPriceCents
          ? Math.round(parseFloat(formData.teamPriceCents) * 100)
          : null,
        // Early-bird: end-of-day in the admin's timezone, same convention as
        // registrationCloses. Team-only by policy — see the field help text.
        earlyBirdDeadline: formData.earlyBirdDeadlineDate
          ? new Date(`${formData.earlyBirdDeadlineDate}T23:59:59`).toISOString()
          : null,
        earlyBirdTeamPriceCents: formData.allowTeam && formData.earlyBirdTeamPriceCents
          ? Math.round(parseFloat(formData.earlyBirdTeamPriceCents) * 100)
          : null,
        signupModes,
        depositCents: formData.depositCents ? Math.round(parseFloat(formData.depositCents) * 100) : null,
        allowDeposit: formData.allowDeposit,
        status: formData.status,
        scheduleNotes: formData.scheduleNotes || null,
        termSlug: formData.termSlug || null,
        termLabel: formData.termLabel || null,
        divisionGender: formData.divisionGender || null,
        skillLevel: formData.skillLevel || null,
        dayOfWeek: formData.dayOfWeek || null,
        startTime: formData.startTime || null,
        endTime: formData.endTime || null,
        ...(editingSeason ? {} : { scaffold }),
      }

      const response = await fetch("/api/admin/seasons", {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })

      const data = await response.json()
      if (!response.ok) {
        // Surface zod field-level messages (data.details) instead of the bare
        // "Validation failed", so the user sees which field is wrong.
        const details = data.details as Record<string, string[]> | undefined
        const humanize = (f: string) =>
          f
            .replace(/Cents$/, "")
            .replace(/([A-Z])/g, " $1")
            .replace(/^./, (c) => c.toUpperCase())
            .trim()
        const fieldMsgs = details
          ? Object.entries(details).flatMap(([field, msgs]) =>
              (Array.isArray(msgs) ? msgs : []).map((m) => `${humanize(field)}: ${m}`),
            )
          : []
        throw new Error(
          fieldMsgs.length ? fieldMsgs.join("; ") : data.error || "Request failed",
        )
      }

      await fetchData()
      setIsDialogOpen(false)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setIsSubmitting(false)
    }
  }

  async function handleDelete(season: Season) {
    const ok = await confirm({
      title: "Delete season?",
      description: <>Delete <strong>{season.name}</strong>? This cannot be undone.</>,
      confirmLabel: "Delete",
      destructive: true,
    })
    if (!ok) return

    try {
      const response = await fetch(`/api/admin/seasons?id=${season.id}`, { method: "DELETE" })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error)
      await fetchData()
      toast.success(`Deleted "${season.name}"`)
    } catch (err: any) {
      toast.error(err.message ?? "Failed to delete season")
    }
  }

  function formatDate(dateStr: string) {
    // startDate/endDate are date-only columns — parse UTC-safe so they don't
    // render a day early in timezones behind UTC.
    return formatDateOnly(dateStr)
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  const priorSeasons = formData.programId
    ? seasons
        .filter((s) => s.program.id === formData.programId)
        .map((s) => ({ id: s.id, name: s.name, startDate: s.startDate }))
        .sort((a, b) => b.startDate.localeCompare(a.startDate))
    : []

  // Programs don't expose locationId in the current API; show all venues for now.
  // Server-side validation in Task 7 enforces the correct-location check.
  const venuesForProgram = venues

  // -------------------------------------------------------------------------
  // Filtering. All client-side; each chip group's counts respect every OTHER
  // active filter (skipFacet), mirroring the public catalog's behavior. Chips
  // render only for values present in the org's data; a chip with a 0 count
  // under the current cross-filters stays visible only while it's active.
  // -------------------------------------------------------------------------
  const setFacet = (key: keyof SeasonFilters) => (v: string | null) =>
    setFilters((prev) => ({ ...prev, [key]: v }))

  const facetValue: Record<Facet, (s: Season) => string | null> = {
    status: (s) => s.status,
    term: (s) => s.termLabel || NO_TERM,
    type: (s) => s.program.programType ?? null,
    audience: (s) => seasonAudience(s),
    venue: (s) => s.location.name,
    day: (s) => s.dayOfWeek ?? null,
  }

  const facetOptions = (
    facet: Facet,
    values: Array<{ value: string; label: string }>,
    active: string | null,
  ) =>
    values
      .map((v) => ({
        ...v,
        count: seasons.filter(
          // Count against every OTHER active filter, with this facet pinned
          // to the candidate value.
          (s) => seasonMatches(s, filters, facet) && facetValue[facet](s) === v.value,
        ).length,
      }))
      .filter((o) => o.count > 0 || o.value === active)

  const statusChipOptions = facetOptions(
    "status",
    statusOptions
      .filter((o) => seasons.some((s) => s.status === o.value))
      .map((o) => ({ value: o.value, label: o.label })),
    filters.status,
  )
  const termChipOptions = facetOptions(
    "term",
    [
      // Distinct labels in list order (API sorts by startDate asc)
      ...Array.from(new Set(seasons.map((s) => s.termLabel).filter((t): t is string => !!t)))
        .map((t) => ({ value: t, label: t })),
      ...(seasons.some((s) => !s.termLabel) ? [{ value: NO_TERM, label: "No term" }] : []),
    ],
    filters.term,
  )
  const typeChipOptions = facetOptions(
    "type",
    PROGRAM_TYPE_ORDER
      .filter((t) => seasons.some((s) => s.program.programType === t))
      .map((t) => ({ value: t, label: t.charAt(0).toUpperCase() + t.slice(1) })),
    filters.type,
  )
  const audienceChipOptions = facetOptions(
    "audience",
    (["youth", "adult"] as const)
      .filter((a) => seasons.some((s) => seasonAudience(s) === a))
      .map((a) => ({ value: a, label: a === "youth" ? "Youth" : "Adult" })),
    filters.audience,
  )
  const venueChipOptions = facetOptions(
    "venue",
    Array.from(new Set(seasons.map((s) => s.location.name)))
      .sort((a, b) => a.localeCompare(b))
      .map((n) => ({ value: n, label: n })),
    filters.venue,
  )
  const dayChipOptions = facetOptions(
    "day",
    DAY_KEYS
      .filter((d) => seasons.some((s) => s.dayOfWeek === d))
      .map((d) => ({ value: d, label: DAY_LABELS[d] })),
    filters.day,
  )

  const anyFilterActive =
    filters.query.trim() !== "" ||
    filters.status !== null ||
    filters.term !== null ||
    filters.type !== null ||
    filters.audience !== null ||
    filters.venue !== null ||
    filters.day !== null

  // Plain computation, deliberately NOT a hook: this sits below the isLoading
  // early return, where a hook would change the call order between renders
  // (Rules of Hooks). The list is small; re-filtering per render is fine.
  const visibleSeasons = (() => {
    const arr = seasons.filter((s) => seasonMatches(s, filters))
    switch (sort) {
      case "start":
        arr.sort((a, b) => a.startDate.localeCompare(b.startDate))
        break
      case "closes":
        arr.sort((a, b) => {
          if (!a.registrationCloses) return b.registrationCloses ? 1 : 0
          if (!b.registrationCloses) return -1
          return new Date(a.registrationCloses).getTime() - new Date(b.registrationCloses).getTime()
        })
        break
      case "name":
        arr.sort((a, b) => a.name.localeCompare(b.name))
        break
      case "created":
        arr.sort((a, b) => new Date(b.createdAt ?? 0).getTime() - new Date(a.createdAt ?? 0).getTime())
        break
    }
    return arr
  })()

  return (
    <div className="space-y-6">
      {confirmDialog}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Seasons</h1>
          <p className="text-gray-600 mt-1">Manage program seasons and registrations</p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            disabled={programs.length === 0}
            onClick={() => {
              const first = programs[0]
              setWizardLocationId(first?.location.id ?? "")
              setWizardSportId(first?.sport.id ?? "")
              setIsWizardOpen(true)
            }}
          >
            <Plus className="h-4 w-4 mr-2" />
            New offering
          </Button>
          <Button onClick={openCreateDialog} disabled={programs.length === 0}>
            <Plus className="h-4 w-4 mr-2" />
            Add Season
          </Button>
        </div>
      </div>

      {programs.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-muted-foreground mb-4">Create programs before adding seasons</p>
            <Button variant="outline" asChild>
              <a href="/admin/programs">Add Programs</a>
            </Button>
          </CardContent>
        </Card>
      ) : seasons.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-muted-foreground mb-4">No seasons created yet</p>
            <Button onClick={openCreateDialog}>
              <Plus className="h-4 w-4 mr-2" />
              Add Your First Season
            </Button>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Filter / search toolbar — sticks just below the portal header (h-16). */}
          <div className="sticky top-16 z-20 -mx-6 px-6 py-3 bg-cream/95 backdrop-blur-sm border-y border-border space-y-2.5">
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative w-full sm:w-72">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-ink-muted pointer-events-none" />
                <Input
                  type="search"
                  value={filters.query}
                  onChange={(e) => setFilters((prev) => ({ ...prev, query: e.target.value }))}
                  placeholder="Search seasons or programs…"
                  aria-label="Search seasons"
                  className="pl-8 h-9"
                />
              </div>
              <span className="text-xs text-ink-muted">
                {visibleSeasons.length === seasons.length
                  ? `${seasons.length} season${seasons.length === 1 ? "" : "s"}`
                  : `${visibleSeasons.length} of ${seasons.length} seasons`}
              </span>
              <div className="ml-auto flex items-center gap-2">
                {anyFilterActive && (
                  <button
                    type="button"
                    onClick={() => setFilters(EMPTY_FILTERS)}
                    className="text-xs font-medium text-primary hover:underline"
                  >
                    Clear filters
                  </button>
                )}
                <select
                  value={sort}
                  onChange={(e) => setSort(e.target.value as SortKey)}
                  className="bg-paper border border-border rounded-md px-2.5 py-1.5 text-xs text-ink-2"
                  aria-label="Sort seasons"
                >
                  <option value="start">Sort: Start date ↑</option>
                  <option value="closes">Sort: Registration closes ↑</option>
                  <option value="name">Sort: Name A–Z</option>
                  <option value="created">Sort: Recently created</option>
                </select>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
              {statusChipOptions.length > 1 && (
                <FilterChipGroup label="Status" options={statusChipOptions} active={filters.status} onChange={setFacet("status")} />
              )}
              {termChipOptions.length > 1 && (
                <FilterChipGroup label="Term" options={termChipOptions} active={filters.term} onChange={setFacet("term")} />
              )}
              {typeChipOptions.length > 1 && (
                <FilterChipGroup label="Type" options={typeChipOptions} active={filters.type} onChange={setFacet("type")} />
              )}
              {audienceChipOptions.length > 1 && (
                <FilterChipGroup label="Audience" options={audienceChipOptions} active={filters.audience} onChange={setFacet("audience")} />
              )}
              {venueChipOptions.length > 1 && (
                <FilterChipGroup label="Venue" options={venueChipOptions} active={filters.venue} onChange={setFacet("venue")} />
              )}
              {dayChipOptions.length > 0 && (
                <FilterChipGroup label="Day" options={dayChipOptions} active={filters.day} onChange={setFacet("day")} />
              )}
            </div>
          </div>

          {visibleSeasons.length === 0 ? (
            <Card>
              <CardContent>
                <EmptyState
                  icon={<SearchX className="h-8 w-8" />}
                  title="No seasons match these filters"
                  description="Try removing a filter or clearing the search."
                >
                  <Button variant="outline" onClick={() => setFilters(EMPTY_FILTERS)}>
                    Clear filters
                  </Button>
                </EmptyState>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {visibleSeasons.map((season) => {
                const statusConfig = statusOptions.find((s) => s.value === season.status)
                const allowTeam = (season.signupModes ?? ["individual"]).includes("team")
                const allowIndividual = (season.signupModes ?? ["individual"]).includes("individual")
                const dayLabel = season.dayOfWeek ? DAY_LABELS[season.dayOfWeek as DayKey] : ""
                const timeWindow = formatTimeWindow(season.startTime, season.endTime)
                const dayTime = dayLabel && timeWindow ? `${dayLabel} · ${timeWindow}` : dayLabel || timeWindow
                const regClosesPast =
                  season.registrationCloses != null && new Date(season.registrationCloses) < new Date()
                const depositMisconfigured =
                  season.allowDeposit &&
                  season.depositCents != null &&
                  season.priceCents != null &&
                  season.depositCents >= season.priceCents
                return (
                  <Card key={season.id}>
                    <CardContent className="p-4">
                      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                        <div className="flex items-center gap-4 min-w-0">
                          <div
                            className="w-12 h-12 rounded-xl flex items-center justify-center text-2xl shrink-0"
                            style={{
                              backgroundColor: `${season.sport.color || "#3b82f6"}20`,
                              color: season.sport.color || "#3b82f6",
                            }}
                          >
                            {season.sport.icon || "🏃"}
                          </div>
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <h3 className="font-display font-semibold text-lg text-ink leading-tight">
                                {season.name}
                              </h3>
                              <Badge className={statusConfig?.color}>{statusConfig?.label}</Badge>
                              {season.termLabel && (
                                <Badge variant="outline" className="text-ink-muted">{season.termLabel}</Badge>
                              )}
                              {depositMisconfigured && (
                                <Badge className="bg-amber-100 text-amber-800 border-amber-300">
                                  Deposit ≥ price
                                </Badge>
                              )}
                              {season.status === "forming" && (
                                <span className="text-xs text-ink-muted">{season.interestCount ?? 0} interested</span>
                              )}
                            </div>
                            <p className="text-sm text-muted-foreground truncate">
                              {season.program.name} · {season.location.name}
                              {season.ageGroup && ` · ${season.ageGroup.name}`}
                            </p>
                            <p className="text-sm text-muted-foreground">
                              {formatDate(season.startDate)} – {formatDate(season.endDate)}
                              {dayTime && <> · {dayTime}</>}
                              {season.registrationCloses && (
                                <>
                                  {" · "}
                                  <span className={regClosesPast ? "text-red-700 font-medium" : undefined}>
                                    Reg closes{" "}
                                    {new Date(season.registrationCloses).toLocaleDateString("en-US", {
                                      month: "short",
                                      day: "numeric",
                                      year: "numeric",
                                    })}
                                  </span>
                                </>
                              )}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-4 shrink-0 lg:pl-4">
                          <div className="text-right">
                            <p className="font-semibold text-ink">
                              {allowIndividual && (
                                <>
                                  {fmtUsd(season.priceCents)}{" "}
                                  <span className="text-xs font-normal text-muted-foreground">solo</span>
                                </>
                              )}
                              {allowTeam && season.teamPriceCents != null && (
                                <>
                                  {allowIndividual && <span className="text-muted-foreground font-normal"> · </span>}
                                  {fmtUsd(season.teamPriceCents)}{" "}
                                  <span className="text-xs font-normal text-muted-foreground">team</span>
                                </>
                              )}
                              {!allowIndividual && !(allowTeam && season.teamPriceCents != null) &&
                                fmtUsd(season.priceCents)}
                            </p>
                            {allowTeam && season.earlyBirdTeamPriceCents != null && (
                              <p className="text-xs text-muted-foreground">
                                EB {fmtUsd(season.earlyBirdTeamPriceCents)} team
                              </p>
                            )}
                            <p className="text-sm text-muted-foreground">{capacityLabel(season)}</p>
                          </div>
                          <div className="flex items-center gap-2">
                            <a
                              href={`/admin/seasons/${season.id}`}
                              className="text-sm text-primary hover:underline whitespace-nowrap"
                            >
                              Manage gear →
                            </a>
                            <Button
                              variant="ghost"
                              size="icon"
                              aria-label={`Edit season ${season.name}`}
                              title={`Edit season ${season.name}`}
                              onClick={() => openEditDialog(season)}
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              aria-label={`Delete season ${season.name}`}
                              title={`Delete season ${season.name}`}
                              onClick={() => handleDelete(season)}
                            >
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                )
              })}
            </div>
          )}
        </>
      )}

      {/* Offering wizard dialog — creates a new program + season via the wizard flow */}
      <Dialog open={isWizardOpen} onOpenChange={setIsWizardOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>New offering</DialogTitle>
            <DialogDescription>
              Choose a location and sport, then follow the steps to create a new program offering.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Location</Label>
                <Select
                  value={wizardLocationId}
                  onValueChange={(v) => {
                    setWizardLocationId(v)
                    // Reset sport when location changes — pick first matching sport
                    const match = programs.find((p) => p.location.id === v)
                    setWizardSportId(match?.sport.id ?? "")
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select location" />
                  </SelectTrigger>
                  <SelectContent>
                    {/* v1 limit: only offer location/sport combos that already have a program — so admins can't create an orphaned program+season. */}
                    {Array.from(new Map(programs.map((p) => [p.location.id, p.location])).values()).map((loc) => (
                      <SelectItem key={loc.id} value={loc.id}>{loc.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Sport</Label>
                <Select
                  value={wizardSportId}
                  onValueChange={setWizardSportId}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select sport" />
                  </SelectTrigger>
                  <SelectContent>
                    {Array.from(
                      new Map(
                        programs
                          .filter((p) => !wizardLocationId || p.location.id === wizardLocationId)
                          .map((p) => [p.sport.id, p.sport])
                      ).values()
                    ).map((sport) => (
                      <SelectItem key={sport.id} value={sport.id}>{sport.icon} {sport.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            {wizardLocationId && wizardSportId && (
              <OfferingWizard
                locationId={wizardLocationId}
                sportId={wizardSportId}
                onDone={() => {
                  setIsWizardOpen(false)
                  fetchData()
                  toast.success("Offering created!")
                }}
              />
            )}
            {(!wizardLocationId || !wizardSportId) && (
              <p className="text-sm text-ink-muted">Select a location and sport above to begin.</p>
            )}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingSeason ? "Edit Season" : "Add Season"}</DialogTitle>
            <DialogDescription>
              {editingSeason ? "Update season details" : "Create a new season"}
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSubmit}>
            {error && (
              <div className="bg-destructive/10 text-destructive text-sm p-3 rounded-lg mb-4">{error}</div>
            )}

            {!editingSeason && (
              <div className="mb-4">
                <SeasonScaffoldPicker
                  priorSeasons={priorSeasons}
                  value={scaffold}
                  onChange={setScaffold}
                  onCloneSourceSelected={handleCloneSourceSelected}
                />
              </div>
            )}

            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Program *</Label>
                <Select
                  value={formData.programId}
                  onValueChange={(v) => setFormData((prev) => ({ ...prev, programId: v }))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select program" />
                  </SelectTrigger>
                  <SelectContent>
                    {programs.map((prog) => (
                      <SelectItem key={prog.id} value={prog.id}>
                        {prog.sport.icon} {prog.name} ({prog.location.name})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="name">Season Name *</Label>
                  <Input
                    id="name"
                    value={formData.name}
                    onChange={(e) => handleNameChange(e.target.value)}
                    placeholder="Fall 2024"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="slug">Slug *</Label>
                  <Input
                    id="slug"
                    value={formData.slug}
                    onChange={(e) => setFormData((prev) => ({ ...prev, slug: e.target.value }))}
                    placeholder="fall-2024"
                    required
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label>Age Group</Label>
                <Select
                  value={formData.ageGroupId || "none"}
                  onValueChange={(v) => setFormData((prev) => ({ ...prev, ageGroupId: v === "none" ? "" : v }))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select age group (optional)" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No age restriction</SelectItem>
                    {ageGroups.map((ag) => (
                      <SelectItem key={ag.id} value={ag.id}>
                        {ag.name} (Ages {ag.minAge}-{ag.maxAge})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Space</Label>
                <Select
                  value={formData.venueId || "none"}
                  onValueChange={(v) => setFormData((prev) => ({ ...prev, venueId: v === "none" ? "" : v }))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select a space (optional)" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No space assigned</SelectItem>
                    {groupSpacesByLocation(venuesForProgram).map((group) => (
                      <SelectGroup key={group.locationName}>
                        <SelectLabel>{group.locationName}</SelectLabel>
                        {group.spaces.map((v) => (
                          <SelectItem key={v.id} value={v.id}>{v.name}</SelectItem>
                        ))}
                      </SelectGroup>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="startDate">Start Date *</Label>
                  <Input
                    id="startDate"
                    type="date"
                    value={formData.startDate}
                    onChange={(e) => setFormData((prev) => ({ ...prev, startDate: e.target.value }))}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="endDate">End Date *</Label>
                  <Input
                    id="endDate"
                    type="date"
                    value={formData.endDate}
                    onChange={(e) => setFormData((prev) => ({ ...prev, endDate: e.target.value }))}
                    required
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="registrationClosesDate">Registration closes</Label>
                <Input
                  id="registrationClosesDate"
                  type="date"
                  value={formData.registrationClosesDate}
                  onChange={(e) => setFormData((prev) => ({ ...prev, registrationClosesDate: e.target.value }))}
                />
                <p className="text-xs text-ink-muted">
                  Open seasons stop being visible and registerable at the end of this day.
                  Leave blank to auto-close the day after the start date. Set a date after
                  the start date to allow late joins.
                </p>
              </div>

              {/* Signup modes — drives which signup paths the season accepts */}
              <div className="space-y-2 rounded-lg border border-border p-4 bg-cream-2/50">
                <Label className="font-semibold">Signup modes</Label>
                <p className="text-xs text-ink-muted">
                  Which paths can a registrant take? At least one is required.
                </p>
                <div className="flex flex-wrap gap-4 pt-1">
                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="allowIndividual"
                      checked={formData.allowIndividual}
                      onCheckedChange={(checked) =>
                        setFormData((prev) => ({ ...prev, allowIndividual: checked === true }))
                      }
                    />
                    <Label htmlFor="allowIndividual" className="font-normal">
                      Individual / free agent (per-player)
                    </Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="allowTeam"
                      checked={formData.allowTeam}
                      onCheckedChange={(checked) =>
                        setFormData((prev) => ({ ...prev, allowTeam: checked === true }))
                      }
                    />
                    <Label htmlFor="allowTeam" className="font-normal">
                      Team (captain registers a roster)
                    </Label>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="priceCents">
                    Individual price ($) {formData.allowIndividual && "*"}
                  </Label>
                  <Input
                    id="priceCents"
                    type="number"
                    step="0.01"
                    min="0"
                    value={formData.priceCents}
                    onChange={(e) => setFormData((prev) => ({ ...prev, priceCents: e.target.value }))}
                    placeholder="90.00"
                    required={formData.allowIndividual}
                    disabled={!formData.allowIndividual && !formData.allowTeam}
                  />
                  <p className="text-xs text-ink-muted">
                    What one free agent pays. Required for individual signups; for team-only seasons we keep this equal to the team price.
                  </p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="teamPriceCents">
                    Team price ($) {formData.allowTeam && "*"}
                  </Label>
                  <Input
                    id="teamPriceCents"
                    type="number"
                    step="0.01"
                    min="0"
                    value={formData.teamPriceCents}
                    onChange={(e) => setFormData((prev) => ({ ...prev, teamPriceCents: e.target.value }))}
                    placeholder="720.00"
                    disabled={!formData.allowTeam}
                    required={formData.allowTeam}
                  />
                  <p className="text-xs text-ink-muted">
                    What a captain pays for a full roster. Leave blank if team signup isn't offered.
                  </p>
                </div>
              </div>

              {/* Early-bird. Team-only by policy: we don't discount solo signups
                  (it encourages free agents over full rosters). The API rejects an
                  early-bird price that isn't below its list price. */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="earlyBirdTeamPriceCents">Early-bird team price ($)</Label>
                  <Input
                    id="earlyBirdTeamPriceCents"
                    type="number"
                    step="0.01"
                    min="0"
                    value={formData.earlyBirdTeamPriceCents}
                    onChange={(e) => setFormData((prev) => ({ ...prev, earlyBirdTeamPriceCents: e.target.value }))}
                    placeholder="1000.00"
                    disabled={!formData.allowTeam}
                  />
                  <p className="text-xs text-ink-muted">
                    Discounted roster price for captains who register before the deadline. Must be
                    less than the team price. Leave blank for no early-bird.
                  </p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="earlyBirdDeadlineDate">Early-bird deadline</Label>
                  <Input
                    id="earlyBirdDeadlineDate"
                    type="date"
                    value={formData.earlyBirdDeadlineDate}
                    onChange={(e) => setFormData((prev) => ({ ...prev, earlyBirdDeadlineDate: e.target.value }))}
                    disabled={!formData.allowTeam}
                  />
                  <p className="text-xs text-ink-muted">
                    Last day at the early-bird price. The rate is locked in when the captain creates
                    the team, so it holds even if they pay later.
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="depositCents">Deposit ($)</Label>
                  <Input
                    id="depositCents"
                    type="number"
                    step="0.01"
                    min="0"
                    value={formData.depositCents}
                    onChange={(e) => setFormData((prev) => ({ ...prev, depositCents: e.target.value }))}
                    placeholder="25.00"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="maxParticipants">Max players (solo signups)</Label>
                  <Input
                    id="maxParticipants"
                    type="number"
                    min="1"
                    value={formData.maxParticipants}
                    onChange={(e) => setFormData((prev) => ({ ...prev, maxParticipants: e.target.value }))}
                    placeholder="50"
                  />
                  <p className="text-xs text-ink-muted">
                    Caps individual / free-agent registrations only — once reached, new solo
                    signups go to the waitlist. Team signups are NOT counted against this;
                    each team is capped by its own roster size. Leave blank for no cap.
                  </p>
                </div>
              </div>

              <div className="space-y-2">
                <Label>Status</Label>
                <Select
                  value={formData.status}
                  onValueChange={(v) => setFormData((prev) => ({ ...prev, status: v }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {statusOptions.map((status) => (
                      <SelectItem key={status.value} value={status.value}>{status.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="scheduleNotes">Schedule Notes</Label>
                <Input
                  id="scheduleNotes"
                  value={formData.scheduleNotes}
                  onChange={(e) => setFormData((prev) => ({ ...prev, scheduleNotes: e.target.value }))}
                  placeholder="Saturdays 9-10am"
                />
              </div>

              <div className="flex items-center space-x-2">
                <Checkbox
                  id="allowDeposit"
                  checked={formData.allowDeposit}
                  onCheckedChange={(checked) => setFormData((prev) => ({ ...prev, allowDeposit: checked === true }))}
                />
                <Label htmlFor="allowDeposit" className="font-normal">Allow deposit payment option</Label>
              </div>

              <div className="border-t border-border pt-4 mt-2">
                <p className="text-[11px] font-semibold tracking-[0.15em] uppercase text-ink-muted mb-3">
                  League page metadata (optional)
                </p>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="termLabel">Term label</Label>
                    <Input id="termLabel" value={formData.termLabel}
                      onChange={(e) => setFormData((p) => ({ ...p, termLabel: e.target.value }))}
                      placeholder="Fall 2026" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="termSlug">Term slug</Label>
                    <Input id="termSlug" value={formData.termSlug}
                      onChange={(e) => setFormData((p) => ({ ...p, termSlug: e.target.value }))}
                      placeholder="fall-2026" />
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-4 mt-4">
                  <div className="space-y-2">
                    <Label>Division gender</Label>
                    <Select value={formData.divisionGender || "none"}
                      onValueChange={(v) => setFormData((p) => ({ ...p, divisionGender: v === "none" ? "" : v }))}>
                      <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">—</SelectItem>
                        {DIVISION_GENDERS.map((g) => (
                          <SelectItem key={g} value={g}>{DIVISION_GENDER_LABEL[g]}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Skill level</Label>
                    <Select value={formData.skillLevel || "none"}
                      onValueChange={(v) => setFormData((p) => ({ ...p, skillLevel: v === "none" ? "" : v }))}>
                      <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">—</SelectItem>
                        {DIVISION_LEVELS.map((l) => (
                          <SelectItem key={l} value={l}>{DIVISION_LEVEL_LABEL[l]}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Night</Label>
                    <Select value={formData.dayOfWeek || "none"}
                      onValueChange={(v) => setFormData((p) => ({ ...p, dayOfWeek: v === "none" ? "" : v }))}>
                      <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">—</SelectItem>
                        {["mon","tue","wed","thu","fri","sat","sun"].map((d) => (
                          <SelectItem key={d} value={d}>{d[0].toUpperCase() + d.slice(1)}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4 mt-4">
                  <div className="space-y-2">
                    <Label htmlFor="startTime">Start time</Label>
                    <Input id="startTime" type="time" value={formData.startTime}
                      onChange={(e) => setFormData((p) => ({ ...p, startTime: e.target.value }))} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="endTime">End time</Label>
                    <Input id="endTime" type="time" value={formData.endTime}
                      onChange={(e) => setFormData((p) => ({ ...p, endTime: e.target.value }))} />
                  </div>
                </div>
              </div>
            </div>

            <DialogFooter className="mt-6">
              <Button type="button" variant="outline" onClick={() => setIsDialogOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                {editingSeason ? "Update" : "Add"} Season
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
