"use client"

import { useEffect, useState } from "react"
import { useHydrationBeacon } from "@/lib/hooks/use-hydration-beacon"
import { LoadingSkeleton } from "@/components/ui/loading-skeleton"
import { ErrorBanner } from "@/components/ui/error-banner"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { ArrowLeft, PartyPopper, Loader2 } from "lucide-react"
import { toast } from "sonner"

// Glows & Grows capture flow — the phone-first screen a coach uses at the
// field right after a session, one player per screen, nothing written
// until the coach taps "Share with parents" on the final review screen.
// See docs/superpowers/specs/2026-07-09-glows-and-grows-design.md ("2.
// Capture page").

interface RosterPlayer {
  familyMemberId: string
  firstName: string
  lastName: string
  attendanceStatus: string | null
}

interface ExistingNote {
  id: string
  familyMemberId: string
  category: "achievement" | "encouragement" | "focus" | "progress" | "general"
  title: string
  content: string
  createdAt: string
}

interface BootstrapData {
  session: {
    id: string
    title: string
    scheduledDate: string
    status: "draft" | "planned" | "in_progress" | "completed" | "cancelled"
    team: { id: string; name: string }
  }
  roster: RosterPlayer[]
  chips: { glows: string[]; grows: string[] }
  existingNotes: ExistingNote[]
}

interface PlayerEntry {
  glows: string[]
  grow: string | null
  note: string
  skipped: boolean
}

type Mode = "loading" | "error" | "summary" | "capture" | "review" | "success"

const MAX_GLOWS = 3
const MAX_NOTE_LENGTH = 280

function initials(firstName: string, lastName: string): string {
  return `${firstName[0] ?? ""}${lastName[0] ?? ""}`.toUpperCase()
}

// Coach notes store the joined chip line and an optional freeform note as
// "chip · chip\nnote" (see POST handler in glows.ts). Split it back apart
// for the read-only summary.
function parseNoteContent(content: string): { chips: string[]; note: string | null } {
  const [chipLine, ...rest] = content.split("\n")
  return {
    chips: chipLine.split(" · ").map((c) => c.trim()).filter(Boolean),
    note: rest.length > 0 ? rest.join("\n").trim() || null : null,
  }
}

// Absent players sort to the end and start pre-marked skipped, so a coach
// isn't forced to make a call on someone who wasn't there.
function sortForCapture(roster: RosterPlayer[]): RosterPlayer[] {
  const present = roster.filter((p) => p.attendanceStatus !== "absent")
  const absent = roster.filter((p) => p.attendanceStatus === "absent")
  return [...present, ...absent]
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto w-full max-w-md px-4 py-6">
      {children}
    </div>
  )
}

export default function GlowsGrowsFlow({ sessionId }: { sessionId: string }) {
  useHydrationBeacon()

  const [mode, setMode] = useState<Mode>("loading")
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [data, setData] = useState<BootstrapData | null>(null)

  const [flowRoster, setFlowRoster] = useState<RosterPlayer[]>([])
  const [entries, setEntries] = useState<Record<string, PlayerEntry>>({})
  const [currentIndex, setCurrentIndex] = useState(0)
  // When true, the coach jumped into capture from the review screen to edit
  // one player — the next Next/Skip should drop straight back into review
  // instead of marching through the rest of the roster again.
  const [returnToReview, setReturnToReview] = useState(false)

  const [submitting, setSubmitting] = useState(false)
  const [sharedCount, setSharedCount] = useState(0)

  function startCapture(players: RosterPlayer[]) {
    const sorted = sortForCapture(players)
    const nextEntries: Record<string, PlayerEntry> = {}
    for (const p of sorted) {
      nextEntries[p.familyMemberId] = {
        glows: [],
        grow: null,
        note: "",
        skipped: p.attendanceStatus === "absent",
      }
    }
    setFlowRoster(sorted)
    setEntries(nextEntries)
    setCurrentIndex(0)
    setReturnToReview(false)
    setMode("capture")
  }

  function editPlayer(familyMemberId: string) {
    const idx = flowRoster.findIndex((p) => p.familyMemberId === familyMemberId)
    if (idx === -1) return
    setCurrentIndex(idx)
    setReturnToReview(true)
    setMode("capture")
  }

  async function load() {
    setMode("loading")
    setErrorMsg(null)
    try {
      const res = await fetch(`/api/coach/sessions/${sessionId}/glows`)
      if (!res.ok) {
        if (res.status === 403) throw new Error("You don't have access to this session.")
        if (res.status === 404) throw new Error("We couldn't find this session.")
        throw new Error("Couldn't load this session. Please try again.")
      }
      const bootstrap = (await res.json()) as BootstrapData
      setData(bootstrap)
      if (bootstrap.existingNotes.length > 0) {
        setMode("summary")
      } else {
        startCapture(bootstrap.roster)
      }
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Something went wrong loading this session.")
      setMode("error")
    }
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId])

  function handleAddMore() {
    if (!data) return
    const alreadyNoted = new Set(data.existingNotes.map((n) => n.familyMemberId))
    const remaining = data.roster.filter((p) => !alreadyNoted.has(p.familyMemberId))
    if (remaining.length === 0) return
    startCapture(remaining)
  }

  function updateEntry(familyMemberId: string, patch: Partial<PlayerEntry>) {
    setEntries((prev) => ({
      ...prev,
      [familyMemberId]: { ...prev[familyMemberId], ...patch },
    }))
  }

  function toggleGlow(familyMemberId: string, chip: string) {
    const entry = entries[familyMemberId]
    if (!entry) return
    const has = entry.glows.includes(chip)
    if (has) {
      updateEntry(familyMemberId, { glows: entry.glows.filter((g) => g !== chip) })
    } else if (entry.glows.length < MAX_GLOWS) {
      updateEntry(familyMemberId, { glows: [...entry.glows, chip] })
    }
  }

  function toggleGrow(familyMemberId: string, chip: string) {
    const entry = entries[familyMemberId]
    if (!entry) return
    updateEntry(familyMemberId, { grow: entry.grow === chip ? null : chip })
  }

  function advance() {
    if (returnToReview) {
      setReturnToReview(false)
      setMode("review")
      return
    }
    if (currentIndex >= flowRoster.length - 1) {
      setMode("review")
    } else {
      setCurrentIndex((i) => i + 1)
    }
  }

  function handleSkip(familyMemberId: string) {
    updateEntry(familyMemberId, { skipped: true })
    advance()
  }

  function handleNext() {
    advance()
  }

  function handleBack() {
    setCurrentIndex((i) => Math.max(0, i - 1))
  }

  async function handleShare() {
    if (!data) return
    const submittable = flowRoster
      .map((p) => ({ player: p, entry: entries[p.familyMemberId] }))
      .filter(({ entry }) => entry && !entry.skipped && (entry.glows.length > 0 || !!entry.grow))

    if (submittable.length === 0) return

    setSubmitting(true)
    try {
      const res = await fetch(`/api/coach/sessions/${sessionId}/glows`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          entries: submittable.map(({ player, entry }) => ({
            familyMemberId: player.familyMemberId,
            glows: entry.glows,
            grow: entry.grow ?? undefined,
            note: entry.note.trim() ? entry.note.trim() : undefined,
          })),
        }),
      })

      if (!res.ok) {
        const body = await res.json().catch(() => ({}) as { error?: string })
        throw new Error(body.error || "Couldn't share these with parents. Please try again.")
      }

      const body = (await res.json()) as { created: { familyMemberId: string }[] }
      setSharedCount(Array.isArray(body.created) ? body.created.length : submittable.length)
      setMode("success")
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't share these with parents. Please try again.")
    } finally {
      setSubmitting(false)
    }
  }

  // ---- Loading / error ----

  if (mode === "loading") {
    return (
      <Shell>
        <LoadingSkeleton variant="card" rows={5} />
      </Shell>
    )
  }

  if (mode === "error" || !data) {
    return (
      <Shell>
        <div className="space-y-4">
          <ErrorBanner message={errorMsg ?? "Something went wrong."} />
          <Button onClick={load} variant="outline" className="w-full min-h-11">
            Retry
          </Button>
        </div>
      </Shell>
    )
  }

  // ---- Read-only summary (double-entry guard) ----

  if (mode === "summary") {
    const notesByPlayer = new Map<string, ExistingNote[]>()
    for (const n of data.existingNotes) {
      const arr = notesByPlayer.get(n.familyMemberId) ?? []
      arr.push(n)
      notesByPlayer.set(n.familyMemberId, arr)
    }
    const notedPlayers = data.roster.filter((p) => notesByPlayer.has(p.familyMemberId))
    const remainingCount = data.roster.length - notedPlayers.length

    return (
      <Shell>
        <div className="space-y-6">
          <div>
            <h1 className="text-xl font-semibold text-ink">Glows & Grows shared</h1>
            <p className="text-sm text-ink-muted mt-1">
              {data.session.title} · {data.session.team.name}
            </p>
          </div>

          <div className="space-y-3">
            {notedPlayers.map((player) => {
              const notes = notesByPlayer.get(player.familyMemberId) ?? []
              const glowNote = notes.find((n) => n.category !== "focus")
              const growNote = notes.find((n) => n.category === "focus")
              const glowParsed = glowNote ? parseNoteContent(glowNote.content) : null
              const growParsed = growNote ? parseNoteContent(growNote.content) : null
              const freeNote = glowParsed?.note ?? growParsed?.note ?? null

              return (
                <div
                  key={player.familyMemberId}
                  className="p-4 rounded-xl bg-paper border border-border space-y-2"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                      <span className="text-xs font-semibold text-primary">
                        {initials(player.firstName, player.lastName)}
                      </span>
                    </div>
                    <p className="font-medium text-ink">
                      {player.firstName} {player.lastName}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-1.5 pl-12">
                    {glowParsed?.chips.map((chip) => (
                      <span
                        key={chip}
                        className="px-2.5 py-1 rounded-full text-xs font-medium bg-primary/10 text-primary"
                      >
                        {chip}
                      </span>
                    ))}
                    {growParsed?.chips.map((chip) => (
                      <span
                        key={chip}
                        className="px-2.5 py-1 rounded-full text-xs font-medium bg-ochre/20 text-ochre"
                      >
                        {chip}
                      </span>
                    ))}
                  </div>
                  {freeNote && <p className="text-sm text-ink-2 pl-12">"{freeNote}"</p>}
                </div>
              )
            })}
          </div>

          {remainingCount > 0 && (
            <Button onClick={handleAddMore} className="w-full min-h-11">
              Add more · {remainingCount} left
            </Button>
          )}

          <a
            href={`/coach/practices/${sessionId}`}
            className="flex items-center justify-center gap-2 text-sm font-medium text-ink-muted hover:text-ink min-h-11"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to session
          </a>
        </div>
      </Shell>
    )
  }

  // ---- No roster to capture for ----

  if (flowRoster.length === 0) {
    return (
      <Shell>
        <div className="text-center py-12 space-y-3">
          <p className="text-ink font-medium">No players to give glows to.</p>
          <p className="text-sm text-ink-muted">This team's roster is empty right now.</p>
          <a
            href={`/coach/practices/${sessionId}`}
            className="inline-flex items-center gap-2 text-sm font-medium text-primary hover:underline"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to session
          </a>
        </div>
      </Shell>
    )
  }

  // ---- Capture: one player per screen ----

  if (mode === "capture") {
    const player = flowRoster[currentIndex]
    const entry = entries[player.familyMemberId]
    const canAdvance = entry.glows.length > 0 || !!entry.grow

    return (
      <Shell>
        <div className="space-y-6">
          {/* Progress */}
          <div className="space-y-2">
            <div className="flex items-center justify-center gap-1.5">
              {flowRoster.map((p, i) => (
                <span
                  key={p.familyMemberId}
                  className={cn(
                    "h-2 w-2 rounded-full",
                    i < currentIndex && "bg-primary",
                    i === currentIndex && "ring-2 ring-primary ring-offset-1",
                    i > currentIndex && "bg-cream-3"
                  )}
                />
              ))}
            </div>
            <p className="text-center text-xs text-ink-muted">
              {currentIndex + 1} of {flowRoster.length}
            </p>
          </div>

          {/* Player identity */}
          <div className="text-center space-y-3">
            <div className="w-20 h-20 mx-auto rounded-full bg-primary/10 flex items-center justify-center">
              <span className="text-2xl font-semibold text-primary">
                {initials(player.firstName, player.lastName)}
              </span>
            </div>
            <h1 className="text-2xl font-bold text-ink">
              {player.firstName} {player.lastName}
            </h1>
          </div>

          {entry.skipped ? (
            <div className="p-4 rounded-xl bg-cream-2 border border-border text-center space-y-3">
              <p className="text-sm text-ink-muted">
                {player.attendanceStatus === "absent" ? "Marked absent — skipped" : "Skipped"}
              </p>
              <Button
                variant="outline"
                className="min-h-11"
                onClick={() => updateEntry(player.familyMemberId, { skipped: false })}
              >
                Give chips anyway
              </Button>
            </div>
          ) : (
            <div className="space-y-5">
              <div>
                <h2 className="text-sm font-semibold text-ink-muted uppercase tracking-wide mb-2">
                  Glows
                </h2>
                <div className="flex flex-wrap gap-2">
                  {data.chips.glows.map((chip) => {
                    const selected = entry.glows.includes(chip)
                    const disabled = !selected && entry.glows.length >= MAX_GLOWS
                    return (
                      <button
                        key={chip}
                        type="button"
                        disabled={disabled}
                        onClick={() => toggleGlow(player.familyMemberId, chip)}
                        className={cn(
                          "min-h-11 px-4 py-2 rounded-full text-sm font-medium border transition-colors",
                          selected
                            ? "bg-primary text-white border-primary"
                            : "bg-cream-2 text-ink-muted border-border hover:bg-cream-3",
                          disabled && "opacity-40"
                        )}
                      >
                        {chip}
                      </button>
                    )
                  })}
                </div>
                <p className="text-xs text-ink-muted mt-2">{entry.glows.length} of {MAX_GLOWS} selected</p>
              </div>

              {data.chips.grows.length > 0 && (
                <div>
                  <h2 className="text-sm font-semibold text-ink-muted uppercase tracking-wide mb-2">
                    Growing
                  </h2>
                  <div className="flex flex-wrap gap-2">
                    {data.chips.grows.map((chip) => {
                      const selected = entry.grow === chip
                      return (
                        <button
                          key={chip}
                          type="button"
                          onClick={() => toggleGrow(player.familyMemberId, chip)}
                          className={cn(
                            "min-h-11 px-4 py-2 rounded-full text-sm font-medium border transition-colors",
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
                </div>
              )}

              <div>
                <input
                  type="text"
                  value={entry.note}
                  maxLength={MAX_NOTE_LENGTH}
                  onChange={(e) => updateEntry(player.familyMemberId, { note: e.target.value })}
                  placeholder="Add a note for the family (optional)"
                  className="w-full min-h-11 px-3 py-2 bg-cream-2 border border-border rounded-lg text-ink placeholder:text-ink-muted text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                />
              </div>
            </div>
          )}

          {/* Navigation */}
          <div className="flex items-center gap-2 pt-2">
            {currentIndex > 0 && (
              <Button variant="ghost" className="min-h-11" onClick={handleBack} aria-label="Back">
                <ArrowLeft className="w-4 h-4" />
              </Button>
            )}
            {!entry.skipped && (
              <Button
                variant="ghost"
                className="min-h-11 flex-1"
                onClick={() => handleSkip(player.familyMemberId)}
              >
                Skip
              </Button>
            )}
            <Button
              className="min-h-11 flex-[2]"
              disabled={!entry.skipped && !canAdvance}
              onClick={handleNext}
            >
              {currentIndex >= flowRoster.length - 1 ? "Review" : "Next"}
            </Button>
          </div>
        </div>
      </Shell>
    )
  }

  // ---- Review before the single batch POST ----

  if (mode === "review") {
    const rows = flowRoster.map((p) => ({ player: p, entry: entries[p.familyMemberId] }))
    const submittableCount = rows.filter(
      ({ entry }) => !entry.skipped && (entry.glows.length > 0 || !!entry.grow)
    ).length
    const sessionLocked = data.session.status === "draft" || data.session.status === "cancelled"

    return (
      <Shell>
        <div className="space-y-6">
          <div>
            <h1 className="text-xl font-semibold text-ink">Ready to share</h1>
            <p className="text-sm text-ink-muted mt-1">Review before it goes to families.</p>
          </div>

          {sessionLocked && (
            <ErrorBanner message="This session is no longer open for glows — it may have been cancelled or was never scheduled." />
          )}

          <p className="text-xs text-ink-muted">Tap a player to edit</p>

          <div className="space-y-2">
            {rows.map(({ player, entry }) => (
              <button
                key={player.familyMemberId}
                type="button"
                onClick={() => editPlayer(player.familyMemberId)}
                className="w-full min-h-11 p-3 rounded-xl bg-paper border border-border flex items-start justify-between gap-3 text-left hover:bg-cream-2 transition-colors"
              >
                <p className="font-medium text-ink shrink-0">
                  {player.firstName} {player.lastName}
                </p>
                {entry.skipped || (entry.glows.length === 0 && !entry.grow) ? (
                  <span className="text-xs text-ink-muted">
                    {player.attendanceStatus === "absent" ? "Marked absent — skipped" : "Skipped"}
                  </span>
                ) : (
                  <div className="flex flex-wrap gap-1.5 justify-end">
                    {entry.glows.map((chip) => (
                      <span
                        key={chip}
                        className="px-2 py-0.5 rounded-full text-xs font-medium bg-primary/10 text-primary"
                      >
                        {chip}
                      </span>
                    ))}
                    {entry.grow && (
                      <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-ochre/20 text-ochre">
                        {entry.grow}
                      </span>
                    )}
                  </div>
                )}
              </button>
            ))}
          </div>

          <Button
            className="w-full min-h-11"
            disabled={submitting || submittableCount === 0 || sessionLocked}
            onClick={handleShare}
          >
            {submitting ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Sharing...
              </>
            ) : submittableCount === 0 ? (
              "Give at least one player a glow or grow"
            ) : (
              `Share with parents · ${submittableCount}`
            )}
          </Button>
        </div>
      </Shell>
    )
  }

  // ---- Success ----

  return (
    <Shell>
      <div className="text-center py-12 space-y-4">
        <PartyPopper className="w-12 h-12 text-primary mx-auto" />
        <h1 className="text-2xl font-bold text-ink">
          Shared with {sharedCount} {sharedCount === 1 ? "player's" : "players'"} families
        </h1>
        <p className="text-sm text-ink-muted">Parents can see it in their dashboard now.</p>
        <div className="flex flex-col gap-2 pt-4">
          <a
            href={`/coach/practices/${sessionId}`}
            className="min-h-11 flex items-center justify-center rounded-md border border-border bg-paper text-ink font-medium text-sm"
          >
            Back to session
          </a>
          <a
            href="/coach/practices/new"
            className="min-h-11 flex items-center justify-center rounded-md bg-primary text-white font-medium text-sm"
          >
            Plan next practice
          </a>
        </div>
      </div>
    </Shell>
  )
}
