"use client"

import { useCallback, useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { ErrorBanner } from "@/components/ui/error-banner"
import { EmptyState } from "@/components/ui/empty-state"
import { LoadingSkeleton } from "@/components/ui/loading-skeleton"
import { toast } from "sonner"
import { useHydrationBeacon } from "@/lib/hooks/use-hydration-beacon"
import { ArrowDown, ArrowUp, ChevronLeft, Plus, Trash2 } from "lucide-react"

interface RefItem {
  id: string
  name: string
}

interface StageRef extends RefItem {
  slug: string
}

interface SequenceListItem {
  id: string
  organizationId: string | null
  sportId: string
  developmentStageId: string
  programType: "league" | "class" | "camp" | "clinic"
  name: string
  description: string | null
  entryCount: number
  sport: RefItem
  stage: StageRef
}

// Editor-local entry shape: objectives edited as one-per-line text.
interface EditorEntry {
  templateId: string
  templateName: string
  objectives: string
  notes: string
}

interface SeasonOption {
  id: string
  name: string
  startDate: string
  endDate: string
}

const PROGRAM_TYPES = ["league", "class", "camp", "clinic"] as const
const WEEKDAYS = [
  { value: "0", label: "Sunday" },
  { value: "1", label: "Monday" },
  { value: "2", label: "Tuesday" },
  { value: "3", label: "Wednesday" },
  { value: "4", label: "Thursday" },
  { value: "5", label: "Friday" },
  { value: "6", label: "Saturday" },
]

export function SequenceEditor() {
  useHydrationBeacon()

  const [sequences, setSequences] = useState<SequenceListItem[]>([])
  const [sports, setSports] = useState<RefItem[]>([])
  const [stages, setStages] = useState<StageRef[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Create form
  const [showCreate, setShowCreate] = useState(false)
  const [createName, setCreateName] = useState("")
  const [createSportId, setCreateSportId] = useState("")
  const [createStageId, setCreateStageId] = useState("")
  const [createProgramType, setCreateProgramType] = useState<string>("league")
  const [createDescription, setCreateDescription] = useState("")

  // Detail / entry editing
  const [selected, setSelected] = useState<SequenceListItem | null>(null)
  const [entries, setEntries] = useState<EditorEntry[]>([])
  const [templates, setTemplates] = useState<RefItem[]>([])
  const [addTemplateId, setAddTemplateId] = useState("")
  const [savingEntries, setSavingEntries] = useState(false)

  // Attach form
  const [seasons, setSeasons] = useState<SeasonOption[]>([])
  const [attachSeasonId, setAttachSeasonId] = useState("")
  const [attachWeekday, setAttachWeekday] = useState("6")
  const [attachStartDate, setAttachStartDate] = useState("")
  const [attachTime, setAttachTime] = useState("09:00")
  const [attaching, setAttaching] = useState(false)

  const fetchSequences = useCallback(async () => {
    try {
      setLoading(true)
      const res = await fetch("/api/admin/curriculum/sequences")
      if (!res.ok) throw new Error("Failed to load sequences")
      const data = await res.json()
      setSequences(data.sequences || [])
      setSports(data.sports || [])
      setStages(data.stages || [])
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load sequences")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchSequences()
  }, [fetchSequences])

  async function openSequence(seq: SequenceListItem) {
    setSelected(seq)
    setAttachSeasonId("")
    const [detailRes, templatesRes, seasonsRes] = await Promise.all([
      fetch(`/api/admin/curriculum/sequences/${seq.id}`),
      fetch(`/api/admin/curriculum/templates?sportId=${seq.sportId}`),
      fetch("/api/admin/seasons"),
    ])
    if (!detailRes.ok) {
      toast.error("Failed to load sequence detail")
      setSelected(null)
      return
    }
    const detail = await detailRes.json()
    setEntries(
      (detail.entries || []).map((e: any) => ({
        templateId: e.templateId,
        templateName: e.template.name,
        objectives: (e.objectives || []).join("\n"),
        notes: e.notes || "",
      })),
    )
    if (templatesRes.ok) {
      const tpl = await templatesRes.json()
      setTemplates((tpl.templates || []).map((t: any) => ({ id: t.id, name: t.name })))
    }
    if (seasonsRes.ok) {
      const s = await seasonsRes.json()
      setSeasons(
        (s.seasons || []).map((row: any) => ({
          id: row.id,
          name: row.name,
          startDate: row.startDate,
          endDate: row.endDate,
        })),
      )
    }
  }

  async function handleCreate() {
    if (!createName || !createSportId || !createStageId) {
      toast.error("Name, sport, and stage are required")
      return
    }
    const res = await fetch("/api/admin/curriculum/sequences", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: createName,
        sportId: createSportId,
        developmentStageId: createStageId,
        programType: createProgramType,
        description: createDescription || undefined,
      }),
    })
    if (!res.ok) {
      const body = await res.json().catch(() => ({}))
      toast.error(body.error || "Failed to create sequence")
      return
    }
    toast.success("Sequence created")
    setShowCreate(false)
    setCreateName("")
    setCreateDescription("")
    await fetchSequences()
  }

  function moveEntry(index: number, delta: -1 | 1) {
    const target = index + delta
    if (target < 0 || target >= entries.length) return
    const next = [...entries]
    ;[next[index], next[target]] = [next[target], next[index]]
    setEntries(next)
  }

  function removeEntry(index: number) {
    setEntries(entries.filter((_, i) => i !== index))
  }

  function addEntry() {
    const template = templates.find((t) => t.id === addTemplateId)
    if (!template) return
    setEntries([
      ...entries,
      { templateId: template.id, templateName: template.name, objectives: "", notes: "" },
    ])
    setAddTemplateId("")
  }

  async function saveEntries() {
    if (!selected) return
    setSavingEntries(true)
    try {
      const res = await fetch(`/api/admin/curriculum/sequences/${selected.id}/entries`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          entries: entries.map((e) => ({
            templateId: e.templateId,
            objectives: e.objectives
              .split("\n")
              .map((line) => line.trim())
              .filter(Boolean),
            notes: e.notes || undefined,
          })),
        }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        toast.error(body.error || "Failed to save entries")
        return
      }
      toast.success("Entries saved")
      await fetchSequences()
    } finally {
      setSavingEntries(false)
    }
  }

  async function handleAttach() {
    if (!selected || !attachSeasonId || !attachStartDate) {
      toast.error("Season and start date are required")
      return
    }
    if (entries.length === 0) {
      toast.error("Add entries (and save them) before attaching")
      return
    }
    setAttaching(true)
    try {
      const res = await fetch(`/api/admin/curriculum/sequences/${selected.id}/attach`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          seasonId: attachSeasonId,
          weekday: Number(attachWeekday),
          startDate: attachStartDate,
          timeOfDay: attachTime,
          count: entries.length,
        }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) {
        toast.error(body.error || "Failed to attach sequence")
        return
      }
      const created = (body.results || []).reduce(
        (sum: number, r: any) => sum + r.created,
        0,
      )
      // Generated sessions arrive "planned" (prescribed), not "draft" —
      // T4 upgraded the distribution engine's session status. Full
      // distribution-preview UI is a later task; this is a minimal wording
      // fix so the toast doesn't lie about what was just created.
      let message = `Attached — ${created} planned plan${created === 1 ? "" : "s"} generated`
      if (body.teamsWithoutCoach?.length) {
        message += `; ${body.teamsWithoutCoach.length} team(s) skipped (no coach assigned)`
      }
      if (body.truncatedBySeasonEnd) {
        message += "; some weeks fell past the season end and were dropped"
      }
      toast.success(message)
    } finally {
      setAttaching(false)
    }
  }

  async function handleDetach() {
    if (!selected || !attachSeasonId) {
      toast.error("Pick the season to detach from")
      return
    }
    const res = await fetch(`/api/admin/curriculum/sequences/${selected.id}/detach`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ seasonId: attachSeasonId }),
    })
    const body = await res.json().catch(() => ({}))
    if (!res.ok) {
      toast.error(body.error || "Failed to detach sequence")
      return
    }
    toast.success("Detached — existing draft plans were left with their coaches")
  }

  async function handleDelete() {
    if (!selected) return
    if (!window.confirm(`Delete "${selected.name}"? Generated draft plans are kept.`)) return
    const res = await fetch(`/api/admin/curriculum/sequences/${selected.id}`, {
      method: "DELETE",
    })
    if (!res.ok) {
      const body = await res.json().catch(() => ({}))
      toast.error(body.error || "Failed to delete sequence")
      return
    }
    toast.success("Sequence deleted")
    setSelected(null)
    await fetchSequences()
  }

  if (loading) return <LoadingSkeleton rows={6} />
  if (error) return <ErrorBanner message={error} />

  // ---- Detail view -------------------------------------------------------
  if (selected) {
    return (
      <div className="space-y-6" data-testid="sequence-detail">
        <div className="flex items-center justify-between">
          <div>
            <button
              type="button"
              onClick={() => setSelected(null)}
              className="flex items-center gap-1 text-sm text-ink-muted hover:text-ink mb-2"
            >
              <ChevronLeft className="w-4 h-4" /> All sequences
            </button>
            <h1 className="text-2xl font-bold text-ink">{selected.name}</h1>
            <p className="text-sm text-ink-muted">
              {selected.sport.name} · {selected.stage.name} · {selected.programType}
            </p>
          </div>
          <Button variant="destructive" onClick={handleDelete}>
            <Trash2 className="w-4 h-4 mr-2" /> Delete
          </Button>
        </div>

        {/* Ordered entries */}
        <section className="p-4 rounded-xl bg-paper border border-border space-y-3">
          <h2 className="text-sm font-medium text-ink">Weekly entries (in order)</h2>
          {entries.length === 0 && (
            <EmptyState
              title="No entries yet"
              description="Add practice templates below — entry 1 becomes week 1, entry 2 week 2, and so on."
            />
          )}
          {entries.map((entry, index) => (
            <div
              key={`${entry.templateId}-${index}`}
              className="flex items-start gap-3 p-3 rounded-lg border border-border"
              data-testid="sequence-entry-row"
            >
              <Badge variant="outline" className="shrink-0 mt-1">
                Week {index + 1}
              </Badge>
              <div className="flex-1 min-w-0 space-y-2">
                <p className="font-medium text-ink truncate">{entry.templateName}</p>
                <Textarea
                  placeholder="Objectives, one per line"
                  value={entry.objectives}
                  onChange={(e) => {
                    const next = [...entries]
                    next[index] = { ...entry, objectives: e.target.value }
                    setEntries(next)
                  }}
                  rows={2}
                />
                <Input
                  placeholder="Coach notes for this week"
                  value={entry.notes}
                  onChange={(e) => {
                    const next = [...entries]
                    next[index] = { ...entry, notes: e.target.value }
                    setEntries(next)
                  }}
                />
              </div>
              <div className="flex flex-col gap-1 shrink-0">
                <Button
                  variant="outline"
                  size="icon"
                  aria-label="Move up"
                  disabled={index === 0}
                  onClick={() => moveEntry(index, -1)}
                >
                  <ArrowUp className="w-4 h-4" />
                </Button>
                <Button
                  variant="outline"
                  size="icon"
                  aria-label="Move down"
                  disabled={index === entries.length - 1}
                  onClick={() => moveEntry(index, 1)}
                >
                  <ArrowDown className="w-4 h-4" />
                </Button>
                <Button
                  variant="outline"
                  size="icon"
                  aria-label="Remove entry"
                  onClick={() => removeEntry(index)}
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>
            </div>
          ))}

          <div className="flex gap-2">
            <Select value={addTemplateId} onValueChange={setAddTemplateId}>
              <SelectTrigger className="flex-1">
                <SelectValue placeholder="Add a practice template…" />
              </SelectTrigger>
              <SelectContent>
                {templates.map((t) => (
                  <SelectItem key={t.id} value={t.id}>
                    {t.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button variant="outline" onClick={addEntry} disabled={!addTemplateId}>
              <Plus className="w-4 h-4 mr-1" /> Add
            </Button>
          </div>
          <Button onClick={saveEntries} disabled={savingEntries}>
            {savingEntries ? "Saving…" : "Save entries"}
          </Button>
        </section>

        {/* Attach to season */}
        <section className="p-4 rounded-xl bg-paper border border-border space-y-3">
          <h2 className="text-sm font-medium text-ink">Attach to a season</h2>
          <p className="text-xs text-ink-muted">
            Generates one dated draft plan per entry for every coached team in the
            season (weekday + start date + weekly repeat). Coaches can edit or delete
            the drafts freely. Re-attaching is safe — existing drafts are skipped.
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            <Select value={attachSeasonId} onValueChange={setAttachSeasonId}>
              <SelectTrigger>
                <SelectValue placeholder="Season…" />
              </SelectTrigger>
              <SelectContent>
                {seasons.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.name} ({s.startDate} → {s.endDate})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={attachWeekday} onValueChange={setAttachWeekday}>
              <SelectTrigger>
                <SelectValue placeholder="Weekday…" />
              </SelectTrigger>
              <SelectContent>
                {WEEKDAYS.map((w) => (
                  <SelectItem key={w.value} value={w.value}>
                    {w.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input
              type="date"
              aria-label="First practice date"
              value={attachStartDate}
              onChange={(e) => setAttachStartDate(e.target.value)}
            />
            <Input
              type="time"
              aria-label="Practice time"
              value={attachTime}
              onChange={(e) => setAttachTime(e.target.value)}
            />
          </div>
          <div className="flex gap-2">
            <Button onClick={handleAttach} disabled={attaching}>
              {attaching ? "Generating…" : `Attach & generate ${entries.length} weeks`}
            </Button>
            <Button variant="outline" onClick={handleDetach}>
              Detach
            </Button>
          </div>
        </section>
      </div>
    )
  }

  // ---- List view ---------------------------------------------------------
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-ink mb-1">Curriculum Sequences</h1>
          <p className="text-sm text-ink-muted">
            Order practice templates into a season-long arc, then attach it to a
            season to push dated draft plans to every coach.
          </p>
        </div>
        <Button onClick={() => setShowCreate((v) => !v)}>
          <Plus className="w-4 h-4 mr-2" /> New sequence
        </Button>
      </div>

      {showCreate && (
        <section className="p-4 rounded-xl bg-paper border border-border space-y-3" data-testid="sequence-create-form">
          <Input
            placeholder="Sequence name (e.g. Soccer Fundamentals — 6-Week League Block)"
            value={createName}
            onChange={(e) => setCreateName(e.target.value)}
          />
          <div className="grid gap-3 sm:grid-cols-3">
            <Select value={createSportId} onValueChange={setCreateSportId}>
              <SelectTrigger>
                <SelectValue placeholder="Sport…" />
              </SelectTrigger>
              <SelectContent>
                {sports.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={createStageId} onValueChange={setCreateStageId}>
              <SelectTrigger>
                <SelectValue placeholder="Stage…" />
              </SelectTrigger>
              <SelectContent>
                {stages.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={createProgramType} onValueChange={setCreateProgramType}>
              <SelectTrigger>
                <SelectValue placeholder="Program type…" />
              </SelectTrigger>
              <SelectContent>
                {PROGRAM_TYPES.map((t) => (
                  <SelectItem key={t} value={t}>
                    {t}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Textarea
            placeholder="Description (optional)"
            value={createDescription}
            onChange={(e) => setCreateDescription(e.target.value)}
            rows={2}
          />
          <Button onClick={handleCreate}>Create</Button>
        </section>
      )}

      {sequences.length === 0 ? (
        <EmptyState
          title="No sequences yet"
          description="Create a sequence to order practice templates into a season plan."
        />
      ) : (
        <div className="space-y-2">
          {sequences.map((seq) => (
            <button
              key={seq.id}
              type="button"
              onClick={() => openSequence(seq)}
              className="w-full text-left p-4 rounded-xl bg-paper border border-border hover:border-primary/40 transition-colors"
              data-testid="sequence-card"
            >
              <div className="flex items-center justify-between gap-4">
                <div className="min-w-0">
                  <p className="font-medium text-ink truncate">{seq.name}</p>
                  <p className="text-xs text-ink-muted">
                    {seq.sport.name} · {seq.stage.name} · {seq.programType}
                    {seq.organizationId === null && " · global"}
                  </p>
                </div>
                <Badge variant="outline" className="shrink-0">
                  {seq.entryCount} week{seq.entryCount === 1 ? "" : "s"}
                </Badge>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
