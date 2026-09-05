"use client"

import { useEffect, useState } from "react"
import { LoadingSkeleton } from "@/components/ui/loading-skeleton"
import { ErrorBanner } from "@/components/ui/error-banner"
import { EmptyState } from "@/components/ui/empty-state"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { X, Sparkles } from "lucide-react"
import { toast } from "sonner"

// Glows & Grows capture for a single class session
// (Task 6, 2026-09-05-coach-classes-phase01 plan).
//
// This is deliberately a MINIMAL chip-picker variant, not a reuse of
// glows-grows-flow.tsx's one-player-per-screen wizard: a class session's
// roster is typically small (a handful of booked children per weekly
// slot), so a single scrollable panel where the coach picks chips per
// child and saves once fits the surface better than a multi-step flow —
// and per the brief, composition/refactor of glows-grows-flow.tsx itself
// is out of scope. The chip VOCABULARY is shared (reinforcement.ts, via
// the bootstrap endpoint's `chips` payload) — only the picker shell here
// is new.
//
// Entry point: a "Glows & grows" button per session row in
// class-roster.tsx (testid `class-glows-open`), which mounts this as a
// modal. Saving is a single whole-batch POST, same contract as the team
// flow's /api/coach/sessions/[id]/glows endpoint.

interface RosterChild {
  familyMemberId: string
  firstName: string
  lastName: string
}

interface ExistingNote {
  id: string
  familyMemberId: string
  category: string
  title: string
  content: string
  createdAt: string
}

interface Bootstrap {
  session: { id: string; startsAt: string; status: string }
  roster: RosterChild[]
  chips: { glows: string[]; grows: string[] }
  existingNotes: ExistingNote[]
}

interface EntryState {
  glows: string[]
  grow: string | null
  note: string
}

const MAX_GLOWS = 3
const MAX_NOTE_LENGTH = 280

export default function ClassGlows({
  sessionId,
  onClose,
}: {
  sessionId: string
  onClose: () => void
}) {
  const [data, setData] = useState<Bootstrap | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [entries, setEntries] = useState<Record<string, EntryState>>({})
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    fetch(`/api/coach/class-sessions/${sessionId}/glows`)
      .then(async (res) => {
        if (res.status === 403) throw new Error("You don't have access to this session.")
        if (res.status === 404) throw new Error("We couldn't find this session.")
        if (!res.ok) throw new Error("Couldn't load this session. Please try again.")
        return (await res.json()) as Bootstrap
      })
      .then((bootstrap) => {
        if (cancelled) return
        setData(bootstrap)
        const initial: Record<string, EntryState> = {}
        for (const child of bootstrap.roster) {
          initial[child.familyMemberId] = { glows: [], grow: null, note: "" }
        }
        setEntries(initial)
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Something went wrong.")
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [sessionId])

  function toggleGlow(familyMemberId: string, chip: string) {
    setEntries((prev) => {
      const entry = prev[familyMemberId]
      if (!entry) return prev
      const has = entry.glows.includes(chip)
      const glows = has
        ? entry.glows.filter((g) => g !== chip)
        : entry.glows.length < MAX_GLOWS
          ? [...entry.glows, chip]
          : entry.glows
      return { ...prev, [familyMemberId]: { ...entry, glows } }
    })
  }

  function toggleGrow(familyMemberId: string, chip: string) {
    setEntries((prev) => {
      const entry = prev[familyMemberId]
      if (!entry) return prev
      return { ...prev, [familyMemberId]: { ...entry, grow: entry.grow === chip ? null : chip } }
    })
  }

  function updateNote(familyMemberId: string, note: string) {
    setEntries((prev) => {
      const entry = prev[familyMemberId]
      if (!entry) return prev
      return { ...prev, [familyMemberId]: { ...entry, note } }
    })
  }

  async function handleSave() {
    if (!data) return
    const submittable = data.roster
      .map((child) => ({ child, entry: entries[child.familyMemberId] }))
      .filter(({ entry }) => entry && (entry.glows.length > 0 || !!entry.grow))

    if (submittable.length === 0) {
      toast.error("Give at least one child a glow or grow before saving.")
      return
    }

    setSaving(true)
    try {
      const res = await fetch(`/api/coach/class-sessions/${sessionId}/glows`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          entries: submittable.map(({ child, entry }) => ({
            familyMemberId: child.familyMemberId,
            glows: entry.glows,
            grow: entry.grow ?? undefined,
            note: entry.note.trim() ? entry.note.trim() : undefined,
          })),
        }),
      })

      if (!res.ok) {
        const errBody = await res.json().catch(() => ({}) as { error?: string })
        throw new Error(errBody.error || "Couldn't share these with parents. Please try again.")
      }

      toast.success("Shared with parents")
      setSaved(true)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't share these with parents. Please try again.")
    } finally {
      setSaving(false)
    }
  }

  const alreadyNoted = new Set((data?.existingNotes ?? []).map((n) => n.familyMemberId))

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      role="dialog"
      aria-modal="true"
    >
      <div className="w-full max-w-lg max-h-[85vh] overflow-y-auto rounded-xl bg-paper border border-border p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-ink flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-primary" />
            Glows &amp; grows
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="text-ink-muted hover:text-ink"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {loading && <LoadingSkeleton rows={3} />}
        {!loading && error && <ErrorBanner message={error} />}

        {!loading && !error && data && (
          <>
            {saved ? (
              <div className="text-center py-8 space-y-3">
                <Sparkles className="w-8 h-8 text-primary mx-auto" />
                <p className="text-ink font-medium">Shared with parents.</p>
                <Button onClick={onClose} className="min-h-11">
                  Done
                </Button>
              </div>
            ) : data.roster.length === 0 ? (
              <EmptyState
                title="No children booked"
                description="Children booked into this session will show up here."
              />
            ) : (
              <>
                <div className="space-y-4">
                  {data.roster.map((child) => {
                    const entry = entries[child.familyMemberId]
                    if (!entry) return null
                    const noted = alreadyNoted.has(child.familyMemberId)
                    return (
                      <div
                        key={child.familyMemberId}
                        data-testid="class-glows-child-row"
                        className="rounded-lg border border-border p-3 space-y-2"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <p className="font-medium text-ink ph-mask">
                            {child.firstName} {child.lastName}
                          </p>
                          {noted && (
                            <span className="text-xs text-ink-muted shrink-0">Already noted</span>
                          )}
                        </div>

                        <div className="flex flex-wrap gap-1.5">
                          {data.chips.glows.map((chip) => {
                            const selected = entry.glows.includes(chip)
                            const disabled = !selected && entry.glows.length >= MAX_GLOWS
                            return (
                              <button
                                key={chip}
                                type="button"
                                disabled={disabled}
                                onClick={() => toggleGlow(child.familyMemberId, chip)}
                                className={cn(
                                  "min-h-9 px-3 py-1.5 rounded-full text-xs font-medium border transition-colors",
                                  selected
                                    ? "bg-primary-bright text-primary-foreground border-primary"
                                    : "bg-cream-2 text-ink-muted border-border hover:bg-cream-3",
                                  disabled && "opacity-40"
                                )}
                              >
                                {chip}
                              </button>
                            )
                          })}
                        </div>

                        {data.chips.grows.length > 0 && (
                          <div className="flex flex-wrap gap-1.5">
                            {data.chips.grows.map((chip) => {
                              const selected = entry.grow === chip
                              return (
                                <button
                                  key={chip}
                                  type="button"
                                  onClick={() => toggleGrow(child.familyMemberId, chip)}
                                  className={cn(
                                    "min-h-9 px-3 py-1.5 rounded-full text-xs font-medium border transition-colors",
                                    selected
                                      ? "bg-ochre/20 text-ochre border-ochre/40"
                                      : "bg-cream-2 text-ink-muted border-border hover:bg-cream-3"
                                  )}
                                >
                                  {chip}
                                </button>
                              )
                            })}
                          </div>
                        )}

                        <input
                          type="text"
                          value={entry.note}
                          maxLength={MAX_NOTE_LENGTH}
                          onChange={(e) => updateNote(child.familyMemberId, e.target.value)}
                          placeholder="Add a note for the family (optional)"
                          className="w-full min-h-9 px-2.5 py-1.5 bg-cream-2 border border-border rounded-md text-ink placeholder:text-ink-muted text-xs focus:outline-none focus:ring-2 focus:ring-primary/50 ph-mask"
                        />
                      </div>
                    )
                  })}
                </div>

                <Button
                  data-testid="class-glows-save"
                  className="w-full min-h-11"
                  disabled={saving}
                  onClick={handleSave}
                >
                  {saving ? "Saving..." : "Share with parents"}
                </Button>
              </>
            )}
          </>
        )}
      </div>
    </div>
  )
}
