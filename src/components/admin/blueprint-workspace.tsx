"use client"

/**
 * The Blueprint workspace island (Program Blueprint T6). See "The Blueprint
 * workspace" in docs/superpowers/specs/2026-07-10-program-blueprint-design.md.
 *
 * --- Sequence selection flow (read before touching this file) ---
 * A season has no sequence to compose against until one is picked. This
 * component does NOT create a new "select sequence" endpoint pattern from
 * scratch — it composes two EXISTING pieces:
 *   1. Create path: POST /api/admin/curriculum/sequences (the standard,
 *      unmodified sequence-creation endpoint) with a name defaulted to
 *      "{season name} blueprint", sportId = program.sportId, and
 *      developmentStageId = the bootstrap's `season.primaryStageId`.
 *   2. Link path: POST /api/admin/blueprint/[seasonId] (new in this task,
 *      lives in the bootstrap route file) with `{ sequenceId }` — sets
 *      `seasons.curriculum_sequence_id` directly, without running the full
 *      attach/distribute flow (which needs a weekday/startDate/timeOfDay
 *      and immediately generates sessions — wrong for "just start
 *      composing"). See that file's header comment for the full rationale.
 * Picking an EXISTING candidate sequence only needs step 2. Creating a new
 * one runs step 1 then step 2. Either way, the island re-fetches the
 * bootstrap afterward so slots/guardrails reflect the newly-linked sequence.
 *
 * --- Slot model ---
 * The arc always shows (filled entries) + at least one trailing empty slot,
 * padded to a minimum of 4 visual slots. There is no persisted concept of
 * an "empty middle slot" — the entries PUT endpoint
 * (/api/admin/curriculum/sequences/[id]/entries) replaces the FULL ordered
 * list and assigns positions 1..N from array order, so removing an entry
 * simply shifts everything after it up by one. Clicking a template in the
 * rail always assigns to the first EMPTY slot, which by construction is
 * always the slot right after the last filled one.
 *
 * All slot mutations (add/replace/remove/reorder) go through that same PUT
 * with the full entries array; on success the bootstrap is re-fetched (this
 * keeps guardrail state — evaluated server-side against the season's real
 * age band — always fresh rather than duplicating that logic client-side).
 * On a 422 (BLOCK-tier rejection), the rule text from the response is
 * surfaced via toast.error and local state is left untouched (nothing was
 * written), per "toast.error preserving state on slot-save failures" in the
 * spec's Error handling section.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Checkbox } from "@/components/ui/checkbox"
import { ErrorBanner } from "@/components/ui/error-banner"
import { EmptyState } from "@/components/ui/empty-state"
import { LoadingSkeleton } from "@/components/ui/loading-skeleton"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog"
import { toast } from "sonner"
import { useHydrationBeacon } from "@/lib/hooks/use-hydration-beacon"
import { programTypeLabel } from "@/lib/programs/program-type-labels"
import { AlertTriangle, ArrowDown, ArrowUp, Check, ListChecks, Plus, X } from "lucide-react"

interface GuardrailBlock {
  activityName: string
  skillName: string
  reason: string
  rule: string
  source: string
}

interface GuardrailWarn {
  activityName: string
  reason: string
}

interface Slot {
  entryId: string
  order: number
  template: { id: string; title: string; durationMinutes: number; focusSkillNames: string[] }
  guardrails: {
    blocks: GuardrailBlock[]
    warns: GuardrailWarn[]
    dismissed: boolean
    dismissedBy: string | null
    dismissedAt: string | null
  }
}

interface RailTemplate {
  id: string
  title: string
  durationMinutes: number
  stageSlug: string
  focusSkillNames: string[]
}

interface CandidateSequence {
  id: string
  name: string
  stage: string
}

interface Bootstrap {
  program: { id: string; name: string; programType: string; sportId: string; sportName: string }
  season: {
    id: string
    name: string
    startDate: string
    endDate: string
    band: { minAge: number | null; maxAge: number | null; known: boolean }
    stageLabels: string[]
    stageSlugs: string[]
    primaryStageId: string | null
  }
  noun: string
  sequence: { id: string; name: string; stageSlug: string } | null
  candidateSequences: CandidateSequence[]
  slots: Slot[]
  templates: RailTemplate[]
}

// --- Distribution (Task 8) ---
// Shapes mirror GET/POST .../attach-preview and .../attach exactly (see
// "Distribution" in docs/superpowers/specs/2026-07-10-program-blueprint-design.md
// and the two endpoints' docstrings) — nothing is re-derived client-side,
// this is a straight read of what the server already computed.
interface PreviewGroup {
  teamId: string
  groupLabel: string
  noun: string
  dates: string[]
  conflicts: string[]
  alreadyDistributed: number
  truncated: boolean
}

interface PreviewSafety {
  blocks: GuardrailBlock[]
  warns: GuardrailWarn[]
  bandKnown: boolean
}

interface AttachPreview {
  groups: PreviewGroup[]
  summary: { groupCount: number; sessionCount: number; conflictCount: number }
  safety: PreviewSafety
  truncatedBySeasonEnd: boolean
}

interface AttachResultRow {
  teamId: string
  created: number
  skippedExisting?: number
  error?: string
}

interface AttachResult {
  results: AttachResultRow[]
  attachmentId: string | null
  raceLost?: boolean
  teamsWithoutCoach: string[]
  truncatedBySeasonEnd: boolean
}

// --- Delivery visibility (Task 10) ---
// Shape mirrors GET .../blueprint/[seasonId]/delivery exactly (see that
// endpoint's docstring) — nothing re-derived client-side.
type DeliveryStatus = "delivered" | "adapted" | "scheduled" | "cancelled" | "none"

interface DeliveryGroup {
  teamId: string
  groupLabel: string
  status: DeliveryStatus
  sessionId: string | null
}

interface DeliverySlot {
  entryId: string
  order: number
  templateTitle: string
  groups: DeliveryGroup[]
  deliveredCount: number
  totalGroups: number
}

interface DeliveryResponse {
  noun: string
  slots: DeliverySlot[]
  hasDistributed: boolean
}

const DELIVERY_MARKER: Record<
  DeliveryStatus,
  { symbol: string; className: string; describe: (groupLabel: string) => string }
> = {
  delivered: {
    symbol: "✓",
    className: "text-sage",
    describe: (g) => `${g} — delivered as planned`,
  },
  adapted: {
    symbol: "✎",
    className: "text-ochre",
    describe: (g) => `${g} — adapted from the plan`,
  },
  scheduled: {
    symbol: "○",
    className: "text-ink-faint",
    describe: (g) => `${g} — scheduled, hasn't run yet`,
  },
  none: {
    symbol: "○",
    className: "text-ink-faint/50",
    describe: (g) => `${g} — not distributed yet`,
  },
  cancelled: {
    symbol: "–",
    className: "text-ink-faint",
    describe: (g) => `${g} — cancelled`,
  },
}

/** "team" -> "teams", "class" -> "classes", "camp group" -> "camp groups",
 * "group" -> "groups" -- every noun `groupNoun()` can return, pluralized
 * sensibly. Singular count (1) returns the noun unchanged. */
function pluralizeNoun(noun: string, count: number): string {
  if (count === 1) return noun
  return noun.endsWith("class") ? `${noun}es` : `${noun}s`
}

const MIN_VISUAL_SLOTS = 4

function arcUnitLabel(programType: string): string {
  return programType === "camp" ? "Day" : "Week"
}

function formatDate(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
}

// Shared copy for a fetch that rejected outright (network blip, offline,
// DNS failure, etc.) rather than returning a non-2xx response — those two
// failure modes are handled identically everywhere in this file: toast the
// same reassuring message and leave state exactly as it was (T6 review fix).
const CONNECTION_ERROR_MESSAGE = "Couldn't save — check your connection and try again"

export function BlueprintWorkspace({ seasonId }: { seasonId: string }) {
  useHydrationBeacon()

  const [data, setData] = useState<Bootstrap | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [mutating, setMutating] = useState(false)

  // Sequence picker
  const [pickCandidateId, setPickCandidateId] = useState("")
  const [newSequenceName, setNewSequenceName] = useState("")
  const [creatingSequence, setCreatingSequence] = useState(false)

  // Template rail
  const [search, setSearch] = useState("")
  const [showAllStages, setShowAllStages] = useState(false)

  // Warn-tier dismissals (Task 7). `optimisticallyDismissed` collapses a
  // slot's badge to "Acknowledged" the instant Acknowledge is clicked,
  // before the POST resolves — reverted if the request fails. Keyed by
  // templateId (dismissals are (sequenceId, templateId)-keyed, not
  // per-entry — see dismissals.ts). `dismissingTemplateId` disables the
  // Acknowledge button mid-flight; `expandedAcknowledged` tracks which
  // already-acknowledged slots the director has re-expanded to see the
  // original reasons + who/when.
  const [optimisticallyDismissed, setOptimisticallyDismissed] = useState<Set<string>>(
    new Set(),
  )
  const [dismissingTemplateId, setDismissingTemplateId] = useState<string | null>(null)
  const [expandedAcknowledged, setExpandedAcknowledged] = useState<Set<string>>(new Set())

  // Distribution (Task 8). `distributeOpen` gates the settings/preview/
  // confirm dialog; `preview` holds the last GET attach-preview result
  // (null = still on the settings step); `distributeResult` holds the
  // POST attach response once confirmed (null = still previewing).
  // Settings fields are preserved across a failed preview/confirm so the
  // director never has to re-type anything.
  const [distributeOpen, setDistributeOpen] = useState(false)
  const [weekday, setWeekday] = useState(0)
  const [distStartDate, setDistStartDate] = useState("")
  const [timeOfDay, setTimeOfDay] = useState("17:00")
  const [count, setCount] = useState(1)
  const [previewLoading, setPreviewLoading] = useState(false)
  const [previewError, setPreviewError] = useState<string | null>(null)
  const [preview, setPreview] = useState<AttachPreview | null>(null)
  const [distributing, setDistributing] = useState(false)
  const [distributeResult, setDistributeResult] = useState<AttachResult | null>(null)

  // Delivery visibility (Task 10). Toggled by the director, not loaded
  // eagerly — the strip is read-only coverage info, not core to composing
  // the arc, so it's fetched lazily on first toggle-on and refreshed after
  // every successful distribution while visible.
  const [showDelivery, setShowDelivery] = useState(false)
  const [delivery, setDelivery] = useState<DeliveryResponse | null>(null)
  const [deliveryLoading, setDeliveryLoading] = useState(false)
  const [deliveryError, setDeliveryError] = useState<string | null>(null)

  // Tracks whether we've ever loaded data, so the name-prefill only fires
  // once (on first load) rather than clobbering an in-progress edit every
  // time a silent post-mutation refresh comes back.
  const hasLoadedOnce = useRef(false)

  // `showSpinner` is false for the silent re-fetches that follow a
  // successful mutation (add/replace/remove/reorder/link-sequence) — those
  // should update the arc/guardrails in place, not blank the whole page
  // back to the loading skeleton. Only the very first load, and an explicit
  // "Retry" after an error, show the full loading state.
  const loadBootstrap = useCallback(
    async (showSpinner: boolean) => {
      try {
        if (showSpinner) setLoading(true)
        const res = await fetch(`/api/admin/blueprint/${seasonId}`)
        if (!res.ok) {
          const body = await res.json().catch(() => ({}))
          throw new Error(body.error || "Failed to load the blueprint")
        }
        const json = (await res.json()) as Bootstrap
        setData(json)
        if (!hasLoadedOnce.current) {
          setNewSequenceName(`${json.season.name} blueprint`)
          hasLoadedOnce.current = true
        }
        setError(null)
      } catch (err) {
        const message = err instanceof Error ? err.message : "Failed to load the blueprint"
        // A silent post-mutation refresh failing shouldn't blank an
        // already-rendered workspace back to a full-page error — that's
        // exactly the "never a full-page error after load" case. Only the
        // initial load (or an explicit Retry) surfaces the page-level
        // ErrorBanner; a failed background refresh just toasts and leaves
        // the last-good data on screen.
        if (showSpinner) {
          setError(message)
        } else {
          toast.error(message)
        }
      } finally {
        if (showSpinner) setLoading(false)
      }
    },
    [seasonId],
  )

  const fetchBootstrap = useCallback(() => loadBootstrap(true), [loadBootstrap])
  const refreshBootstrap = useCallback(() => loadBootstrap(false), [loadBootstrap])

  useEffect(() => {
    fetchBootstrap()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seasonId])

  const loadDelivery = useCallback(async () => {
    setDeliveryLoading(true)
    setDeliveryError(null)
    try {
      const res = await fetch(`/api/admin/blueprint/${seasonId}/delivery`)
      const body = await res.json().catch(() => ({}))
      if (!res.ok) {
        setDeliveryError(body.error || "Couldn't load delivery")
        return
      }
      setDelivery(body as DeliveryResponse)
    } catch {
      setDeliveryError(CONNECTION_ERROR_MESSAGE)
    } finally {
      setDeliveryLoading(false)
    }
  }, [seasonId])

  // Fetch on first toggle-on (and whenever the toggle is re-opened) —
  // cheap, read-only, and keeps the strip honest if sessions were
  // completed/adapted since the last time it was shown.
  useEffect(() => {
    if (showDelivery) loadDelivery()
  }, [showDelivery, loadDelivery])

  async function linkSequence(sequenceId: string) {
    setCreatingSequence(true)
    try {
      const res = await fetch(`/api/admin/blueprint/${seasonId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sequenceId }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) {
        toast.error(body.error || "Failed to attach this sequence to the season")
        return
      }
      toast.success("Ready to compose")
      await refreshBootstrap()
    } catch {
      // Network/DNS failure — the fetch itself rejected rather than
      // resolving with a non-2xx status. State is untouched either way
      // (nothing was optimistically applied above).
      toast.error(CONNECTION_ERROR_MESSAGE)
    } finally {
      setCreatingSequence(false)
    }
  }

  async function handlePickExisting() {
    if (!pickCandidateId) {
      toast.error("Pick a sequence first")
      return
    }
    await linkSequence(pickCandidateId)
  }

  async function handleCreateNew() {
    if (!data) return
    if (!data.season.primaryStageId) {
      toast.error(
        "Can't create a new sequence — no curriculum stage resolves for this season's age band yet",
      )
      return
    }
    if (!newSequenceName.trim()) {
      toast.error("Name is required")
      return
    }
    setCreatingSequence(true)
    try {
      const res = await fetch("/api/admin/curriculum/sequences", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sportId: data.program.sportId,
          developmentStageId: data.season.primaryStageId,
          programType: toSequenceProgramType(data.program.programType),
          name: newSequenceName.trim(),
        }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) {
        toast.error(body.error || "Failed to create the sequence")
        return
      }
      await linkSequence(body.sequence.id)
    } catch {
      toast.error(CONNECTION_ERROR_MESSAGE)
    } finally {
      setCreatingSequence(false)
    }
  }

  // Full-entries PUT — shared by add/replace/remove/reorder. Never mutates
  // local state optimistically: on success we re-fetch bootstrap (fresh
  // guardrails); on failure (incl. 422 BLOCK) we toast and leave state as-is.
  const putEntries = useCallback(
    async (nextTemplateIds: string[]) => {
      if (!data?.sequence) return
      setMutating(true)
      try {
        const res = await fetch(
          `/api/admin/curriculum/sequences/${data.sequence.id}/entries`,
          {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              entries: nextTemplateIds.map((templateId) => ({ templateId })),
            }),
          },
        )
        const body = await res.json().catch(() => ({}))
        if (!res.ok) {
          if (res.status === 422 && Array.isArray(body.blocks) && body.blocks.length > 0) {
            const b = body.blocks[0]
            toast.error(`Blocked: ${b.rule ?? b.reason} — ${b.source ?? ""}`.trim())
          } else {
            toast.error(body.error || "Failed to update the arc")
          }
          return
        }
        await refreshBootstrap()
      } catch {
        // Fetch itself rejected (network blip) — nothing was written,
        // local state is preserved as-is.
        toast.error(CONNECTION_ERROR_MESSAGE)
      } finally {
        setMutating(false)
      }
    },
    [data?.sequence, refreshBootstrap],
  )

  // Dismiss a warn-tier slot (Task 7). Optimistically collapses the badge
  // to "Acknowledged" before the POST resolves; reverts + toasts on
  // failure. Keyed by templateId, not entryId — a dismissal applies to
  // "this template's stage skew, for this sequence" regardless of which
  // entry currently holds it (see dismissals.ts).
  const dismissWarning = useCallback(
    async (templateId: string) => {
      if (!data?.sequence) return
      setOptimisticallyDismissed((prev) => new Set(prev).add(templateId))
      setDismissingTemplateId(templateId)
      try {
        const res = await fetch("/api/admin/blueprint/dismissals", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sequenceId: data.sequence.id, templateId }),
        })
        const body = await res.json().catch(() => ({}))
        if (!res.ok) {
          setOptimisticallyDismissed((prev) => {
            const next = new Set(prev)
            next.delete(templateId)
            return next
          })
          toast.error(body.error || "Failed to acknowledge this warning")
          return
        }
        await refreshBootstrap()
      } catch {
        setOptimisticallyDismissed((prev) => {
          const next = new Set(prev)
          next.delete(templateId)
          return next
        })
        toast.error(CONNECTION_ERROR_MESSAGE)
      } finally {
        setDismissingTemplateId(null)
      }
    },
    [data?.sequence, refreshBootstrap],
  )

  // Opens the Distribute pane and seeds the settings step's defaults:
  // weekday from the season start date's own weekday, start date = season
  // start, time = 5pm, count = filled slot count (spec defaults). Resets
  // any stale preview/result from a previous open.
  function openDistribute() {
    if (!data) return
    const parsed = new Date(`${data.season.startDate}T00:00:00Z`)
    setWeekday(Number.isNaN(parsed.getTime()) ? 0 : parsed.getUTCDay())
    setDistStartDate(data.season.startDate)
    setTimeOfDay("17:00")
    setCount(Math.max(data.slots.length, 1))
    setPreview(null)
    setPreviewError(null)
    setDistributeResult(null)
    setDistributeOpen(true)
  }

  // Step 1 -> preview: read-only GET, re-runs the same safety check the
  // confirm POST will, so blocks/warns are visible before anything writes.
  const runPreview = useCallback(async () => {
    if (!data?.sequence) return
    setPreviewLoading(true)
    setPreviewError(null)
    try {
      const params = new URLSearchParams({
        seasonId,
        weekday: String(weekday),
        startDate: distStartDate,
        timeOfDay,
        count: String(count),
      })
      const res = await fetch(
        `/api/admin/curriculum/sequences/${data.sequence.id}/attach-preview?${params.toString()}`,
      )
      const body = await res.json().catch(() => ({}))
      if (!res.ok) {
        setPreviewError(body.error || "Couldn't preview this distribution")
        return
      }
      setPreview(body as AttachPreview)
    } catch {
      // Fetch itself rejected -- settings are preserved, nothing written.
      toast.error(CONNECTION_ERROR_MESSAGE)
    } finally {
      setPreviewLoading(false)
    }
  }, [data?.sequence, seasonId, weekday, distStartDate, timeOfDay, count])

  // Step 2 -> confirm: the actual POST. A 422 here (template changed
  // between preview and confirm) merges the fresh blocks into the visible
  // preview rather than bouncing back to the settings step.
  const runDistribute = useCallback(async () => {
    if (!data?.sequence) return
    setDistributing(true)
    try {
      const res = await fetch(`/api/admin/curriculum/sequences/${data.sequence.id}/attach`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ seasonId, weekday, startDate: distStartDate, timeOfDay, count }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) {
        if (res.status === 422 && Array.isArray(body.blocks)) {
          setPreview((prev) =>
            prev ? { ...prev, safety: { ...prev.safety, blocks: body.blocks } } : prev,
          )
          toast.error(body.error || "Blocked — see the rules below")
        } else {
          toast.error(body.error || "Failed to distribute")
        }
        return
      }
      const result = body as AttachResult
      setDistributeResult(result)
      if (result.raceLost) {
        toast("Another distribution just covered this — refresh to see it")
      } else {
        const totalCreated = result.results.reduce((sum, r) => sum + r.created, 0)
        toast.success(`Distributed ${totalCreated} session${totalCreated === 1 ? "" : "s"}`)
      }
      await refreshBootstrap()
      if (showDelivery) await loadDelivery()
    } catch {
      // Fetch itself rejected -- nothing was written, state preserved.
      toast.error(CONNECTION_ERROR_MESSAGE)
    } finally {
      setDistributing(false)
    }
  }, [
    data?.sequence,
    seasonId,
    weekday,
    distStartDate,
    timeOfDay,
    count,
    refreshBootstrap,
    showDelivery,
    loadDelivery,
  ])

  // teamId -> groupLabel, resolved from the last preview -- the attach
  // POST's results only carry teamId (see attach.ts), never a raw uuid is
  // shown, so results render with this label or a generic fallback.
  const groupLabelById = useMemo(() => {
    const m = new Map<string, string>()
    preview?.groups.forEach((g) => m.set(g.teamId, g.groupLabel))
    return m
  }, [preview])

  const arcLength = useMemo(() => {
    if (!data) return MIN_VISUAL_SLOTS
    return Math.max(data.slots.length + 1, MIN_VISUAL_SLOTS)
  }, [data])

  function assignToFirstEmptySlot(templateId: string) {
    if (!data) return
    const currentIds = [...data.slots]
      .sort((a, b) => a.order - b.order)
      .map((s) => s.template.id)
    putEntries([...currentIds, templateId])
  }

  function replaceSlot(index: number, templateId: string) {
    if (!data) return
    const currentIds = [...data.slots].sort((a, b) => a.order - b.order).map((s) => s.template.id)
    currentIds[index] = templateId
    putEntries(currentIds)
  }

  function removeSlot(index: number) {
    if (!data) return
    const currentIds = [...data.slots].sort((a, b) => a.order - b.order).map((s) => s.template.id)
    currentIds.splice(index, 1)
    putEntries(currentIds)
  }

  function moveSlot(index: number, delta: -1 | 1) {
    if (!data) return
    const target = index + delta
    if (target < 0 || target >= data.slots.length) return
    const currentIds = [...data.slots].sort((a, b) => a.order - b.order).map((s) => s.template.id)
    ;[currentIds[index], currentIds[target]] = [currentIds[target], currentIds[index]]
    putEntries(currentIds)
  }

  if (loading) {
    return (
      <div className="space-y-4">
        <LoadingSkeleton variant="card" />
        <LoadingSkeleton rows={4} />
      </div>
    )
  }

  if (error || !data) {
    return (
      <div className="space-y-3">
        <ErrorBanner message={error || "Something went wrong loading the blueprint"} />
        <Button variant="outline" onClick={fetchBootstrap}>
          Retry
        </Button>
      </div>
    )
  }

  const unit = arcUnitLabel(data.program.programType)
  const orderedSlots = [...data.slots].sort((a, b) => a.order - b.order)

  // "Distribute" is enabled once ≥1 slot is filled and a sequence is
  // linked (spec: "Distribution" — "'Distribute' is the arc's primary
  // action once at least one slot is filled"). Disabled states carry an
  // honest `title` explaining why, rather than silently doing nothing.
  const distributeDisabledReason = !data.sequence
    ? "Link a sequence and add at least one session before distributing"
    : data.slots.length === 0
      ? "Add at least one session to the arc before distributing"
      : null

  const filteredTemplates = data.templates.filter((t) => {
    if (search.trim() && !t.title.toLowerCase().includes(search.trim().toLowerCase())) {
      return false
    }
    return true
  })

  return (
    <div className="space-y-6" data-testid="blueprint-workspace">
      {/* Header */}
      <div className="p-4 rounded-xl bg-paper border border-border space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-bold text-ink">{data.season.name}</h1>
            <Badge variant="outline">{programTypeLabel(data.program.programType)}</Badge>
          </div>
          <div className="flex items-center gap-2">
            {data.sequence && (
              <Button
                variant="outline"
                onClick={() => setShowDelivery((v) => !v)}
                className="min-h-11 gap-2"
                data-testid="delivery-toggle"
              >
                <ListChecks className="w-4 h-4" />
                {showDelivery ? "Hide delivery" : "Delivery"}
              </Button>
            )}
            <Button
              onClick={openDistribute}
              disabled={!!distributeDisabledReason}
              title={distributeDisabledReason ?? undefined}
              className="min-h-11"
              data-testid="distribute-button"
            >
              Distribute
            </Button>
          </div>
        </div>
        <p className="text-sm text-ink-muted">
          {data.program.name} · {data.program.sportName} · {formatDate(data.season.startDate)} –{" "}
          {formatDate(data.season.endDate)}
        </p>
        <div className="flex flex-wrap items-center gap-2 pt-1">
          {data.season.band.known ? (
            <Badge>
              Ages {data.season.band.minAge}–{data.season.band.maxAge}
            </Badge>
          ) : (
            <Badge variant="destructive">Age band unknown</Badge>
          )}
          {data.season.stageLabels.map((label) => (
            <Badge key={label} variant="secondary">
              {label}
            </Badge>
          ))}
        </div>
        {!data.season.band.known && (
          <div className="flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
            <AlertTriangle className="size-4 mt-0.5 shrink-0" aria-hidden="true" />
            <p className="flex-1">
              This season has no age band set — safety guardrails can&apos;t be fully
              evaluated until it does, and content requiring an age floor is blocked by
              default until it&apos;s confirmed safe.{" "}
              <a
                href={`/admin/seasons/${seasonId}/edit`}
                className="underline hover:no-underline"
              >
                Set the season&apos;s age range
              </a>
              .
            </p>
          </div>
        )}
      </div>

      {!data.sequence ? (
        <div className="p-4 rounded-xl bg-paper border border-border space-y-4">
          <div>
            <h2 className="text-sm font-medium text-ink">Start this season&apos;s blueprint</h2>
            <p className="text-xs text-ink-muted">
              Pick an existing sequence for {data.program.sportName}, or create a new one for
              this {data.noun} arc.
            </p>
          </div>

          {data.candidateSequences.length > 0 && (
            <div className="flex flex-col sm:flex-row gap-2">
              <select
                className="flex-1 h-11 rounded-md border border-input bg-background px-3 text-sm"
                value={pickCandidateId}
                onChange={(e) => setPickCandidateId(e.target.value)}
                aria-label="Existing sequence"
              >
                <option value="">Choose an existing sequence…</option>
                {data.candidateSequences.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} ({c.stage})
                  </option>
                ))}
              </select>
              <Button
                onClick={handlePickExisting}
                disabled={creatingSequence || !pickCandidateId}
                className="min-h-11"
              >
                Use this sequence
              </Button>
            </div>
          )}

          <div className="flex flex-col sm:flex-row gap-2">
            <Input
              value={newSequenceName}
              onChange={(e) => setNewSequenceName(e.target.value)}
              placeholder="New sequence name"
              className="flex-1 min-h-11"
            />
            <Button
              variant="outline"
              onClick={handleCreateNew}
              disabled={creatingSequence}
              className="min-h-11"
            >
              {creatingSequence ? "Creating…" : "Create new sequence"}
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-col lg:flex-row gap-6">
          {/* Arc grid */}
          <div className="flex-1 min-w-0 space-y-3">
            <h2 className="text-sm font-medium text-ink">
              {data.sequence.name} — {unit.toLowerCase()} arc
            </h2>
            {showDelivery && deliveryError && <ErrorBanner message={deliveryError} />}
            {showDelivery && deliveryLoading && (
              <p className="text-xs text-ink-muted">Loading delivery…</p>
            )}
            {showDelivery && !deliveryLoading && delivery && !delivery.hasDistributed && (
              <p className="text-xs text-ink-muted" data-testid="delivery-empty-state">
                Distribute to see delivery.
              </p>
            )}
            <div className="space-y-3" data-testid="blueprint-arc">
              {Array.from({ length: arcLength }).map((_, i) => {
                const slot = orderedSlots[i]
                if (!slot) {
                  return (
                    <div
                      key={`empty-${i}`}
                      className="p-4 rounded-lg border border-dashed border-border text-sm text-ink-muted"
                      data-testid="blueprint-slot-empty"
                    >
                      {unit} {i + 1} — nothing planned yet. Click a template on the right to
                      add it here.
                    </div>
                  )
                }
                const hasBlocks = slot.guardrails.blocks.length > 0
                const hasWarns = slot.guardrails.warns.length > 0
                return (
                  <div
                    key={slot.entryId}
                    className={`p-4 rounded-lg border space-y-2 ${
                      hasBlocks ? "border-destructive bg-destructive/5" : "border-border"
                    }`}
                    data-testid="blueprint-slot"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <Badge variant="outline" className="mb-1">
                          {unit} {i + 1}
                        </Badge>
                        <p className="font-medium text-ink truncate">{slot.template.title}</p>
                        <p className="text-xs text-ink-muted">
                          {slot.template.durationMinutes} min
                        </p>
                      </div>
                      <div className="flex gap-1 shrink-0">
                        <Button
                          variant="outline"
                          size="icon"
                          aria-label="Move earlier"
                          disabled={mutating || i === 0}
                          onClick={() => moveSlot(i, -1)}
                          className="min-h-11 min-w-11"
                        >
                          <ArrowUp className="w-4 h-4" />
                        </Button>
                        <Button
                          variant="outline"
                          size="icon"
                          aria-label="Move later"
                          disabled={mutating || i === orderedSlots.length - 1}
                          onClick={() => moveSlot(i, 1)}
                          className="min-h-11 min-w-11"
                        >
                          <ArrowDown className="w-4 h-4" />
                        </Button>
                        <Button
                          variant="outline"
                          size="icon"
                          aria-label="Remove"
                          disabled={mutating}
                          onClick={() => removeSlot(i)}
                          className="min-h-11 min-w-11"
                        >
                          <X className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>

                    {slot.template.focusSkillNames.length > 0 && (
                      <div className="flex flex-wrap gap-1">
                        {slot.template.focusSkillNames.map((skill) => (
                          <Badge key={skill} variant="secondary">
                            {skill}
                          </Badge>
                        ))}
                      </div>
                    )}

                    {hasBlocks && (
                      <div className="space-y-1 text-sm text-destructive">
                        {slot.guardrails.blocks.map((b, bi) => (
                          <p key={bi}>
                            <strong>Blocked:</strong> {b.rule} — {b.source}
                          </p>
                        ))}
                        <p className="text-xs">
                          This session can&apos;t be distributed until it&apos;s replaced.
                        </p>
                      </div>
                    )}

                    {hasWarns &&
                      (() => {
                        const isDismissed =
                          slot.guardrails.dismissed ||
                          optimisticallyDismissed.has(slot.template.id)
                        const isExpanded = expandedAcknowledged.has(slot.entryId)
                        const isDismissing = dismissingTemplateId === slot.template.id
                        return (
                          <div
                            className={`rounded-md border p-2 text-xs space-y-1 ${
                              isDismissed
                                ? "border-border text-ink-muted"
                                : "border-amber-300 bg-amber-50 text-amber-900"
                            }`}
                          >
                            {isDismissed ? (
                              <>
                                <button
                                  type="button"
                                  onClick={() =>
                                    setExpandedAcknowledged((prev) => {
                                      const next = new Set(prev)
                                      if (next.has(slot.entryId)) next.delete(slot.entryId)
                                      else next.add(slot.entryId)
                                      return next
                                    })
                                  }
                                  className="flex items-center gap-1.5 min-h-11 -my-1"
                                >
                                  <Check className="size-3.5 shrink-0" aria-hidden="true" />
                                  <span>Stage-fit warning acknowledged</span>
                                </button>
                                {isExpanded && (
                                  <div className="space-y-1 pt-1">
                                    {slot.guardrails.warns.map((w, wi) => (
                                      <p key={wi}>{w.reason}</p>
                                    ))}
                                    {slot.guardrails.dismissedBy && (
                                      <p>
                                        Acknowledged by {slot.guardrails.dismissedBy}
                                        {slot.guardrails.dismissedAt &&
                                          ` on ${formatDate(slot.guardrails.dismissedAt)}`}
                                      </p>
                                    )}
                                  </div>
                                )}
                              </>
                            ) : (
                              <>
                                {slot.guardrails.warns.map((w, wi) => (
                                  <p key={wi}>{w.reason}</p>
                                ))}
                                <Button
                                  variant="outline"
                                  size="sm"
                                  disabled={isDismissing}
                                  onClick={() => dismissWarning(slot.template.id)}
                                  className="min-h-11"
                                >
                                  {isDismissing ? "Acknowledging…" : "Acknowledge"}
                                </Button>
                              </>
                            )}
                          </div>
                        )
                      })()}

                    <div className="flex flex-wrap gap-2 pt-1">
                      <RailAssignSelect
                        templates={filteredTemplates}
                        label="Replace"
                        disabled={mutating}
                        onSelect={(templateId) => replaceSlot(i, templateId)}
                      />
                    </div>

                    {showDelivery && delivery?.hasDistributed && (
                      <DeliveryStrip
                        deliverySlot={delivery.slots.find((s) => s.entryId === slot.entryId) ?? null}
                        unit={unit}
                        order={i + 1}
                        noun={data.noun}
                      />
                    )}
                  </div>
                )
              })}
            </div>
          </div>

          {/* Template rail */}
          <div className="lg:w-80 shrink-0 space-y-3">
            <div className="p-4 rounded-xl bg-paper border border-border space-y-3 sticky top-4">
              <h2 className="text-sm font-medium text-ink">Templates</h2>
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search templates…"
                className="min-h-11"
              />
              <label className="flex items-center gap-2 text-xs text-ink-muted">
                <Checkbox
                  checked={showAllStages}
                  onCheckedChange={(v) => setShowAllStages(v === true)}
                />
                Show all stages
              </label>
              <div className="space-y-2 max-h-[28rem] overflow-y-auto">
                {stageFilteredTemplates(
                  filteredTemplates,
                  data.season.stageSlugs,
                  showAllStages,
                ).map((t) => {
                  const inBand =
                    data.season.stageSlugs.length === 0 ||
                    data.season.stageSlugs.includes(t.stageSlug)
                  return (
                    <button
                      key={t.id}
                      type="button"
                      disabled={mutating}
                      onClick={() => assignToFirstEmptySlot(t.id)}
                      className="w-full text-left p-3 rounded-lg border border-border hover:border-primary/40 transition-colors min-h-11 disabled:opacity-60"
                      data-testid="blueprint-template-card"
                    >
                      <p className="font-medium text-ink text-sm truncate">{t.title}</p>
                      <div className="flex items-center gap-1 mt-1">
                        <Badge variant="outline" className="text-[10px]">
                          {t.durationMinutes} min
                        </Badge>
                        <Badge
                          variant={inBand ? "secondary" : "destructive"}
                          className="text-[10px]"
                        >
                          {t.stageSlug}
                        </Badge>
                      </div>
                    </button>
                  )
                })}
                {stageFilteredTemplates(filteredTemplates, data.season.stageSlugs, showAllStages)
                  .length === 0 && (
                  <EmptyState
                    title="No templates match"
                    description="Try widening the search or toggling 'show all stages'."
                  />
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Distribute pane (Task 8) — settings -> preview -> confirm. Mirrors
          the shadcn Dialog convention used elsewhere in admin (e.g.
          skill-editor.tsx): centered modal, `max-w-2xl bg-paper
          border-border`, scrollable body, DialogFooter actions. */}
      <Dialog
        open={distributeOpen}
        onOpenChange={(open) => {
          if (!distributing) setDistributeOpen(open)
        }}
      >
        <DialogContent className="max-w-2xl bg-paper border-border">
          <DialogHeader>
            <DialogTitle className="text-ink">
              {distributeResult
                ? "Distribution results"
                : preview
                  ? "Review before distributing"
                  : `Distribute to your ${pluralizeNoun(data.noun, 2)}`}
            </DialogTitle>
            <DialogDescription>
              {distributeResult
                ? `Sessions generated from ${data.sequence?.name ?? "this sequence"}.`
                : `Generates sessions for every coached ${data.noun} in ${data.season.name}, from ${
                    data.sequence?.name ?? "the linked sequence"
                  }.`}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2 max-h-[65vh] overflow-y-auto">
            {distributeResult ? (
              <DistributeResultsView
                result={distributeResult}
                groupLabelById={groupLabelById}
                noun={data.noun}
              />
            ) : preview ? (
              <DistributePreviewView preview={preview} noun={data.noun} />
            ) : (
              <DistributeSettingsForm
                weekday={weekday}
                onWeekdayChange={setWeekday}
                startDate={distStartDate}
                onStartDateChange={setDistStartDate}
                timeOfDay={timeOfDay}
                onTimeOfDayChange={setTimeOfDay}
                count={count}
                onCountChange={setCount}
                maxCount={Math.max(data.slots.length, 1)}
              />
            )}
            {previewError && !distributeResult && <ErrorBanner message={previewError} />}
          </div>

          <DialogFooter>
            {distributeResult ? (
              <Button
                onClick={() => setDistributeOpen(false)}
                className="min-h-11"
                data-testid="distribute-done"
              >
                Done
              </Button>
            ) : preview ? (
              <>
                <Button
                  variant="outline"
                  onClick={() => setPreview(null)}
                  disabled={distributing}
                  className="min-h-11"
                >
                  Edit settings
                </Button>
                <Button
                  onClick={runDistribute}
                  disabled={
                    distributing ||
                    preview.safety.blocks.length > 0 ||
                    preview.summary.groupCount === 0
                  }
                  title={
                    preview.safety.blocks.length > 0
                      ? "Resolve the blocked rules above before distributing"
                      : preview.summary.groupCount === 0
                        ? "No coached groups to distribute to yet"
                        : undefined
                  }
                  className="min-h-11"
                  data-testid="distribute-confirm"
                >
                  {distributing
                    ? "Distributing…"
                    : `Distribute to ${preview.summary.groupCount} ${pluralizeNoun(
                        data.noun,
                        preview.summary.groupCount,
                      )}`}
                </Button>
              </>
            ) : (
              <Button
                onClick={runPreview}
                disabled={previewLoading}
                className="min-h-11"
                data-testid="distribute-preview"
              >
                {previewLoading ? "Previewing…" : "Preview"}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function DistributeSettingsForm({
  weekday,
  onWeekdayChange,
  startDate,
  onStartDateChange,
  timeOfDay,
  onTimeOfDayChange,
  count,
  onCountChange,
  maxCount,
}: {
  weekday: number
  onWeekdayChange: (v: number) => void
  startDate: string
  onStartDateChange: (v: string) => void
  timeOfDay: string
  onTimeOfDayChange: (v: string) => void
  count: number
  onCountChange: (v: number) => void
  maxCount: number
}) {
  const weekdayLabels = [
    "Sunday",
    "Monday",
    "Tuesday",
    "Wednesday",
    "Thursday",
    "Friday",
    "Saturday",
  ]
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <div className="space-y-1.5">
        <Label htmlFor="distribute-weekday">Day of the week</Label>
        <select
          id="distribute-weekday"
          className="w-full h-11 rounded-md border border-input bg-background px-3 text-sm"
          value={weekday}
          onChange={(e) => onWeekdayChange(Number(e.target.value))}
        >
          {weekdayLabels.map((label, i) => (
            <option key={label} value={i}>
              {label}
            </option>
          ))}
        </select>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="distribute-start-date">Start date</Label>
        <Input
          id="distribute-start-date"
          type="date"
          value={startDate}
          onChange={(e) => onStartDateChange(e.target.value)}
          className="h-11"
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="distribute-time">Time</Label>
        <Input
          id="distribute-time"
          type="time"
          value={timeOfDay}
          onChange={(e) => onTimeOfDayChange(e.target.value)}
          className="h-11"
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="distribute-count">Number of sessions</Label>
        <Input
          id="distribute-count"
          type="number"
          min={1}
          max={maxCount}
          value={count}
          onChange={(e) => {
            const next = Number(e.target.value)
            if (Number.isNaN(next)) return
            onCountChange(Math.min(Math.max(next, 1), maxCount))
          }}
          className="h-11"
        />
        <p className="text-xs text-ink-muted">Up to {maxCount} planned in the arc.</p>
      </div>
    </div>
  )
}

function DistributePreviewView({ preview, noun }: { preview: AttachPreview; noun: string }) {
  const { summary, safety, groups, truncatedBySeasonEnd } = preview
  return (
    <div className="space-y-4">
      <p className="text-sm font-medium text-ink" data-testid="distribute-summary">
        {summary.groupCount} {pluralizeNoun(noun, summary.groupCount)} · {summary.sessionCount}{" "}
        session{summary.sessionCount === 1 ? "" : "s"} · {summary.conflictCount} conflict
        {summary.conflictCount === 1 ? "" : "s"}
      </p>

      {!safety.bandKnown && (
        <div className="flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
          <AlertTriangle className="size-4 mt-0.5 shrink-0" aria-hidden="true" />
          <p>
            This season has no age band set — content that needs a confirmed age floor is
            blocked until it does.
          </p>
        </div>
      )}

      {safety.blocks.length > 0 && (
        <div className="space-y-1.5 rounded-md border border-destructive bg-destructive/5 p-3 text-sm text-destructive">
          <p className="font-medium">Blocked — can&apos;t distribute yet:</p>
          {safety.blocks.map((b, i) => (
            <p key={i}>
              {b.rule} — {b.source}
            </p>
          ))}
        </div>
      )}

      {safety.warns.length > 0 && (
        <div className="space-y-1.5 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
          <p className="font-medium">Worth a look (won&apos;t block distributing):</p>
          {safety.warns.map((w, i) => (
            <p key={i}>{w.reason}</p>
          ))}
        </div>
      )}

      {truncatedBySeasonEnd && (
        <p className="text-xs text-ink-muted">
          The season ends before this arc completes — later sessions won&apos;t be generated.
        </p>
      )}

      <div className="space-y-2">
        {groups.length === 0 && (
          <EmptyState
            title="No coached groups yet"
            description={`Assign a coach to at least one ${noun} in this season before distributing.`}
          />
        )}
        {groups.map((g) => {
          const fresh = Math.max(g.dates.length - g.alreadyDistributed, 0)
          return (
            <div
              key={g.teamId}
              className="rounded-lg border border-border p-3 space-y-1.5"
              data-testid="distribute-group-row"
            >
              <div className="flex items-center justify-between gap-2">
                <p className="font-medium text-ink truncate">{g.groupLabel}</p>
                <Badge variant="secondary" className="shrink-0">
                  {g.noun}
                </Badge>
              </div>
              <p className="text-xs text-ink-muted">
                {g.dates.length} session{g.dates.length === 1 ? "" : "s"}
                {g.alreadyDistributed > 0 && fresh > 0 && (
                  <>
                    {" "}
                    · {g.alreadyDistributed} already distributed, {fresh} new
                  </>
                )}
                {g.alreadyDistributed > 0 && fresh === 0 && (
                  <> · {g.alreadyDistributed} already distributed</>
                )}
              </p>
              {g.conflicts.length > 0 && (
                <p className="text-xs text-amber-900 bg-amber-50 border border-amber-300 rounded-md px-2 py-1">
                  {g.conflicts.length === 1
                    ? `Already has a session on ${formatDate(g.conflicts[0])}`
                    : `Already has a session on ${g.conflicts.length} of these days`}
                </p>
              )}
              {g.truncated && (
                <p className="text-xs text-ink-muted">
                  Season ends before this arc completes for this {noun}.
                </p>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

function DistributeResultsView({
  result,
  groupLabelById,
  noun,
}: {
  result: AttachResult
  groupLabelById: Map<string, string>
  noun: string
}) {
  const totalCreated = result.results.reduce((sum, r) => sum + r.created, 0)
  const groupsTouched = result.results.filter((r) => r.created > 0).length
  return (
    <div className="space-y-3">
      {result.raceLost && (
        <div className="flex items-start gap-2 rounded-md border border-blue-300 bg-blue-50 p-3 text-sm text-blue-900">
          <p>Another distribution just covered this — refresh to see it.</p>
        </div>
      )}
      {!result.raceLost && (
        <p className="text-sm text-ink">
          {totalCreated} session{totalCreated === 1 ? "" : "s"} created across {groupsTouched}{" "}
          {pluralizeNoun(noun, groupsTouched)}.
        </p>
      )}
      <div className="space-y-2">
        {/* Per-group rows add nothing when a concurrent distribution already
            covered everything — the banner above tells the whole story. */}
        {!result.raceLost && result.results.map((r) => (
          <div
            key={r.teamId}
            className="flex items-center justify-between gap-2 text-sm rounded-md border border-border px-3 py-2"
          >
            <span className="text-ink truncate">
              {groupLabelById.get(r.teamId) ?? `This ${noun}`}
            </span>
            {r.error ? (
              <span className="text-destructive shrink-0">{r.error}</span>
            ) : (
              <span className="text-ink-muted shrink-0">
                {r.created} created
                {r.skippedExisting ? `, ${r.skippedExisting} already there` : ""}
              </span>
            )}
          </div>
        ))}
      </div>
      {result.teamsWithoutCoach.length > 0 && (
        <p className="text-xs text-ink-muted">
          {result.teamsWithoutCoach.length} {pluralizeNoun(noun, result.teamsWithoutCoach.length)}{" "}
          without a coach yet — no sessions were created for{" "}
          {result.teamsWithoutCoach.length === 1 ? "it" : "them"}.
        </p>
      )}
      {result.truncatedBySeasonEnd && (
        <p className="text-xs text-ink-muted">
          Season ends before this arc completes — later sessions weren&apos;t generated.
        </p>
      )}
    </div>
  )
}

// Per-slot delivery coverage strip (Task 10). Read-only — framed as
// curriculum coverage, not coach surveillance (spec: "Week 3 delivered to
// 2 of 3 classes", not a scorecard). `deliverySlot` is null when this slot
// (sequence entry) has no matching delivery data yet — e.g. it was added
// to the arc after the last distribution and has never itself gone out;
// rendered as a quiet "not yet distributed" note rather than fabricating
// per-group markers with nothing to back them.
function DeliveryStrip({
  deliverySlot,
  unit,
  order,
  noun,
}: {
  deliverySlot: DeliverySlot | null
  unit: string
  order: number
  noun: string
}) {
  if (!deliverySlot || deliverySlot.totalGroups === 0) {
    return (
      <p className="text-xs text-ink-muted pt-1" data-testid="delivery-strip-empty">
        {unit} {order} hasn&apos;t been distributed yet.
      </p>
    )
  }
  return (
    <div className="pt-1 space-y-1" data-testid="delivery-strip">
      <p className="text-xs text-ink-muted">
        {unit} {order} delivered to {deliverySlot.deliveredCount} of {deliverySlot.totalGroups}{" "}
        {pluralizeNoun(noun, deliverySlot.totalGroups)}
      </p>
      <div className="flex flex-wrap gap-1.5">
        {deliverySlot.groups.map((g) => {
          const marker = DELIVERY_MARKER[g.status]
          return (
            <span
              key={g.teamId}
              title={marker.describe(g.groupLabel)}
              className={`inline-flex items-center justify-center w-6 h-6 rounded-full border border-border text-xs font-medium ${marker.className}`}
              data-testid="delivery-marker"
              data-status={g.status}
            >
              {marker.symbol}
            </span>
          )
        })}
      </div>
    </div>
  )
}

function RailAssignSelect({
  templates,
  label,
  disabled,
  onSelect,
}: {
  templates: RailTemplate[]
  label: string
  disabled: boolean
  onSelect: (templateId: string) => void
}) {
  const [value, setValue] = useState("")
  return (
    <div className="flex gap-2 flex-1">
      <select
        className="flex-1 h-11 rounded-md border border-input bg-background px-2 text-xs"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        aria-label={`${label} this session`}
        disabled={disabled}
      >
        <option value="">{label} with…</option>
        {templates.map((t) => (
          <option key={t.id} value={t.id}>
            {t.title}
          </option>
        ))}
      </select>
      <Button
        variant="outline"
        size="sm"
        className="min-h-11"
        disabled={disabled || !value}
        onClick={() => {
          if (value) onSelect(value)
          setValue("")
        }}
      >
        <Plus className="w-4 h-4" />
      </Button>
    </div>
  )
}

function stageFilteredTemplates(
  templates: RailTemplate[],
  stageSlugs: string[],
  showAll: boolean,
): RailTemplate[] {
  if (showAll || stageSlugs.length === 0) return templates
  return templates.filter((t) => stageSlugs.includes(t.stageSlug))
}

function toSequenceProgramType(programType: string): "league" | "class" | "camp" | "clinic" {
  switch (programType) {
    case "league":
      return "league"
    case "camp":
      return "camp"
    case "clinic":
      return "clinic"
    case "training":
      return "class"
    default:
      return "league"
  }
}
