"use client"

import { useEffect, useState } from "react"
import { MessageSquare, Sparkles, Target, Star, Calendar } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { ErrorBanner } from "@/components/ui/error-banner"
import { EmptyState } from "@/components/ui/empty-state"
import { LoadingSkeleton } from "@/components/ui/loading-skeleton"
import { cn } from "@/lib/utils"

type NoteCategory = "achievement" | "encouragement" | "focus" | "progress" | "general"

interface CoachNoteSession {
  id: string
  title: string
  scheduledDate: string
}

interface CoachNote {
  id: string
  familyMemberId: string
  playerFirstName: string | null
  category: NoteCategory
  title: string
  content: string
  createdAt: string
  coachName: string
  session: CoachNoteSession | null
}

// "focus" rows are grows ("Working on ..." phrasing, per the Glows & Grows
// design spec §5). Everything else — achievement/encouragement (glows),
// plus the older progress/general categories — reads as celebratory.
function isGrow(category: NoteCategory): boolean {
  return category === "focus"
}

function formatTimeAgo(dateStr: string): string {
  const date = new Date(dateStr)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60))
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))

  if (diffHours < 1) return "Just now"
  if (diffHours < 24) return `${diffHours}h ago`
  if (diffDays === 1) return "Yesterday"
  if (diffDays < 7) return `${diffDays}d ago`
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" })
}

function formatSessionDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("en-US", { month: "short", day: "numeric" })
}

function NoteCard({ note }: { note: CoachNote }) {
  const grow = isGrow(note.category)

  return (
    <div
      className={cn(
        "rounded-xl border p-4",
        grow ? "bg-amber-500/5 border-amber-500/20" : "bg-primary/5 border-primary/20"
      )}
    >
      <div className="flex items-start gap-3">
        <div
          className={cn(
            "flex-shrink-0 w-9 h-9 rounded-lg border flex items-center justify-center",
            grow ? "bg-amber-500/10 border-amber-500/20" : "bg-primary/10 border-primary/20"
          )}
        >
          {grow ? (
            <Target className="w-4 h-4 text-ochre" />
          ) : (
            <Sparkles className="w-4 h-4 text-primary" />
          )}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            {note.playerFirstName && (
              <Badge variant="outline" className="border-border text-ink-muted text-[10px] px-1.5 py-0 ph-mask">
                {note.playerFirstName}
              </Badge>
            )}
            {grow && (
              <span className="text-[10px] font-medium uppercase tracking-wider text-ochre">
                What we're working on
              </span>
            )}
            <span className="text-xs text-ink-faint ml-auto flex-shrink-0">
              {formatTimeAgo(note.createdAt)}
            </span>
          </div>
          <p className="text-sm text-ink mt-1.5 leading-relaxed whitespace-pre-line ph-mask">{note.content}</p>
          <p className="text-xs text-ink-muted mt-2">— {note.coachName}</p>
        </div>
      </div>
    </div>
  )
}

export default function CoachNotes() {
  const [notes, setNotes] = useState<CoachNote[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    fetch("/api/family/coach-notes")
      .then(async (r) => {
        if (!r.ok) throw new Error("Failed to load coach notes")
        return r.json()
      })
      .then((data) => {
        if (cancelled) return
        setNotes(data.notes ?? [])
        setError(null)
      })
      .catch(() => {
        if (cancelled) return
        setNotes(null)
        setError("Unable to load coach notes right now.")
      })
    return () => {
      cancelled = true
    }
  }, [])

  // Group visually by session, preserving the feed's newest-first order —
  // each session's group sits at the position of its most recent note.
  const groups: { session: CoachNoteSession | null; notes: CoachNote[] }[] = []
  if (notes) {
    const indexBySessionKey = new Map<string, number>()
    for (const note of notes) {
      const key = note.session?.id ?? "__none__"
      let idx = indexBySessionKey.get(key)
      if (idx === undefined) {
        idx = groups.length
        indexBySessionKey.set(key, idx)
        groups.push({ session: note.session, notes: [] })
      }
      groups[idx].notes.push(note)
    }
  }

  return (
    <div className="space-y-5">
      {/* Section Header */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-cream-3 border border-border flex items-center justify-center">
          <MessageSquare className="w-5 h-5 text-ink-muted" />
        </div>
        <div>
          <h2 className="text-xl font-semibold text-ink">Coach Notes</h2>
          <p className="text-sm text-ink-muted">Development updates from your coaches</p>
        </div>
      </div>

      {notes === null && !error && <LoadingSkeleton rows={3} />}

      <ErrorBanner message={error} />

      {notes !== null && notes.length === 0 && !error && (
        <EmptyState
          icon={<MessageSquare className="w-10 h-10" />}
          title="No coach notes yet"
          description="Notes from coaches will appear here after sessions."
        />
      )}

      {notes !== null && notes.length > 0 && (
        <div className="space-y-5">
          {groups.map((group) => (
            <div key={group.session?.id ?? "general"} className="space-y-2">
              {group.session && (
                <div className="flex items-center gap-2 text-xs text-ink-muted">
                  <Calendar className="w-3.5 h-3.5" />
                  <span className="font-medium text-ink-2">{group.session.title}</span>
                  <span>· {formatSessionDate(group.session.scheduledDate)}</span>
                </div>
              )}
              <div className="grid gap-3 sm:grid-cols-2">
                {group.notes.map((note) => (
                  <NoteCard key={note.id} note={note} />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Development Philosophy */}
      <div className="rounded-xl bg-cream-2 border border-border p-5">
        <div className="flex items-start gap-4">
          <div className="w-10 h-10 rounded-lg bg-cream-3 border border-border flex items-center justify-center flex-shrink-0">
            <Star className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h4 className="font-medium text-ink mb-1">Development-First Approach</h4>
            <p className="text-sm text-ink-muted leading-relaxed">
              At Aspire, we focus on each child's individual growth. Our coaches provide regular
              feedback to help you understand and support your child's athletic journey.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
