"use client"

import { useState } from "react"
import {
  MessageSquare,
  ChevronRight,
  Star,
  TrendingUp,
  Target,
  Heart,
  Award,
  Clock,
  User
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"

type NoteCategory = "progress" | "achievement" | "focus" | "encouragement"

interface CoachNote {
  id: string
  childName: string
  childId: string
  coachName: string
  coachRole: string
  coachAvatar?: string
  date: Date
  category: NoteCategory
  title: string
  content: string
  program: string
  isNew?: boolean
}

// Mock data
const mockNotes: CoachNote[] = [
  {
    id: "1",
    childName: "Emma",
    childId: "c1",
    coachName: "Coach Mike",
    coachRole: "Head Coach",
    date: new Date(Date.now() - 1000 * 60 * 60 * 2), // 2 hours ago
    category: "progress",
    title: "Great improvement in ball control!",
    content: "Emma has been working really hard on her dribbling drills. Today she completed the cone exercise with much better control than last week. Keep encouraging her to practice at home!",
    program: "U10 Lightning - Soccer",
    isNew: true,
  },
  {
    id: "2",
    childName: "Jake",
    childId: "c2",
    coachName: "Coach Sarah",
    coachRole: "Assistant Coach",
    date: new Date(Date.now() - 1000 * 60 * 60 * 24), // 1 day ago
    category: "achievement",
    title: "Outstanding defensive play!",
    content: "Jake showed excellent hustle and court awareness during today's scrimmage. He made 3 great defensive stops that helped his team win. His leadership is really starting to show!",
    program: "U12 Hawks - Basketball",
  },
  {
    id: "3",
    childName: "Emma",
    childId: "c1",
    coachName: "Coach Mike",
    coachRole: "Head Coach",
    date: new Date(Date.now() - 1000 * 60 * 60 * 72), // 3 days ago
    category: "focus",
    title: "Area to work on: Passing accuracy",
    content: "We're going to focus on passing drills this week. Emma has great vision but sometimes rushes her passes. A few minutes of wall passes at home would really help!",
    program: "U10 Lightning - Soccer",
  },
  {
    id: "4",
    childName: "Jake",
    childId: "c2",
    coachName: "Coach Sarah",
    coachRole: "Assistant Coach",
    date: new Date(Date.now() - 1000 * 60 * 60 * 96), // 4 days ago
    category: "encouragement",
    title: "Keep up the positive attitude!",
    content: "Jake has been such a great teammate lately. He's always encouraging others and staying positive even when things get tough. This attitude will take him far!",
    program: "U12 Hawks - Basketball",
  },
]

const categoryConfig: Record<NoteCategory, {
  icon: typeof Star
  color: string
  bg: string
  label: string
}> = {
  progress: {
    icon: TrendingUp,
    color: "text-emerald-400",
    bg: "bg-emerald-500/10 border-emerald-500/20",
    label: "Progress Update"
  },
  achievement: {
    icon: Award,
    color: "text-amber-400",
    bg: "bg-amber-500/10 border-amber-500/20",
    label: "Achievement"
  },
  focus: {
    icon: Target,
    color: "text-primary",
    bg: "bg-blue-500/10 border-blue-500/20",
    label: "Area of Focus"
  },
  encouragement: {
    icon: Heart,
    color: "text-pink-400",
    bg: "bg-pink-500/10 border-pink-500/20",
    label: "Encouragement"
  },
}

function formatTimeAgo(date: Date): string {
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

function NoteCard({ note, featured = false }: { note: CoachNote; featured?: boolean }) {
  const config = categoryConfig[note.category]
  const Icon = config.icon

  return (
    <div
      className={cn(
        "group relative rounded-xl border transition-all cursor-pointer",
        featured
          ? "bg-gradient-to-br from-white/[0.04] to-transparent border-border p-5"
          : "bg-paper border-border hover:border-border p-4"
      )}
    >
      {/* New indicator */}
      {note.isNew && (
        <div className="absolute -top-1 -right-1 w-3 h-3 bg-primary rounded-full animate-pulse" />
      )}

      {/* Header */}
      <div className="flex items-start gap-3 mb-3">
        {/* Category Icon */}
        <div className={cn(
          "flex-shrink-0 w-9 h-9 rounded-lg border flex items-center justify-center",
          config.bg
        )}>
          <Icon className={cn("w-4 h-4", config.color)} />
        </div>

        {/* Title & Meta */}
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <h4 className={cn(
              "font-medium text-ink group-hover:text-primary transition-colors line-clamp-1",
              featured ? "text-base" : "text-sm"
            )}>
              {note.title}
            </h4>
            <span className="text-xs text-ink-muted flex-shrink-0">
              {formatTimeAgo(note.date)}
            </span>
          </div>
          <div className="flex items-center gap-2 mt-0.5">
            <Badge variant="outline" className="border-border text-ink-muted text-[10px] px-1.5 py-0">
              {note.childName}
            </Badge>
            <span className="text-xs text-ink-faint">•</span>
            <span className="text-xs text-ink-muted truncate">{note.program}</span>
          </div>
        </div>
      </div>

      {/* Content */}
      <p className={cn(
        "text-ink-muted leading-relaxed",
        featured ? "text-sm line-clamp-3" : "text-xs line-clamp-2"
      )}>
        {note.content}
      </p>

      {/* Coach Attribution */}
      <div className="flex items-center justify-between mt-3 pt-3 border-t border-border">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-full bg-cream-3 flex items-center justify-center">
            <User className="w-3 h-3 text-ink-muted" />
          </div>
          <div>
            <span className="text-xs font-medium text-ink-2">{note.coachName}</span>
            <span className="text-xs text-ink-faint ml-1">• {note.coachRole}</span>
          </div>
        </div>
        <ChevronRight className="w-4 h-4 text-ink-faint group-hover:text-ink-muted group-hover:translate-x-0.5 transition-all" />
      </div>
    </div>
  )
}

export default function CoachNotes() {
  const [selectedChild, setSelectedChild] = useState<string | "all">("all")
  const newNotesCount = mockNotes.filter(n => n.isNew).length

  const filteredNotes = selectedChild === "all"
    ? mockNotes
    : mockNotes.filter(n => n.childId === selectedChild)

  const uniqueChildren = Array.from(new Set(mockNotes.map(n => ({ id: n.childId, name: n.childName }))))
    .filter((v, i, a) => a.findIndex(t => t.id === v.id) === i)

  const featuredNote = filteredNotes[0]
  const otherNotes = filteredNotes.slice(1)

  return (
    <div className="space-y-5">
      {/* Section Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-violet-500/20 to-purple-500/20 border border-violet-500/20 flex items-center justify-center">
            <MessageSquare className="w-5 h-5 text-violet-400" />
          </div>
          <div>
            <h2 className="text-xl font-semibold text-ink flex items-center gap-2">
              Coach Notes
              {newNotesCount > 0 && (
                <span className="text-xs bg-primary text-white px-2 py-0.5 rounded-full font-medium">
                  {newNotesCount} new
                </span>
              )}
            </h2>
            <p className="text-sm text-ink-muted">
              Development updates from your coaches
            </p>
          </div>
        </div>
        <Button variant="ghost" size="sm" className="text-ink-muted hover:text-ink gap-1">
          View All
          <ChevronRight className="w-4 h-4" />
        </Button>
      </div>

      {/* Child Filter Pills */}
      {uniqueChildren.length > 1 && (
        <div className="flex gap-2 overflow-x-auto pb-1">
          <button
            onClick={() => setSelectedChild("all")}
            className={cn(
              "px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-all",
              selectedChild === "all"
                ? "bg-cream-3 text-ink border border-border"
                : "text-ink-muted hover:text-ink-2 hover:bg-cream-2"
            )}
          >
            All Children
          </button>
          {uniqueChildren.map((child) => (
            <button
              key={child.id}
              onClick={() => setSelectedChild(child.id)}
              className={cn(
                "px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-all",
                selectedChild === child.id
                  ? "bg-cream-3 text-ink border border-border"
                  : "text-ink-muted hover:text-ink-2 hover:bg-cream-2"
              )}
            >
              {child.name}
            </button>
          ))}
        </div>
      )}

      {/* Notes Display */}
      {filteredNotes.length > 0 ? (
        <div className="space-y-4">
          {/* Featured Note */}
          {featuredNote && <NoteCard note={featuredNote} featured />}

          {/* Other Notes Grid */}
          {otherNotes.length > 0 && (
            <div className="grid gap-3 sm:grid-cols-2">
              {otherNotes.slice(0, 4).map((note) => (
                <NoteCard key={note.id} note={note} />
              ))}
            </div>
          )}
        </div>
      ) : (
        <div className="text-center py-10 px-6 rounded-xl bg-paper border border-border">
          <MessageSquare className="w-10 h-10 text-ink-faint mx-auto mb-3" />
          <h3 className="text-ink font-medium mb-1">No coach notes yet</h3>
          <p className="text-sm text-ink-muted">
            Notes from coaches will appear here as your children participate in programs.
          </p>
        </div>
      )}

      {/* Development Philosophy */}
      <div className="relative overflow-hidden rounded-xl bg-gradient-to-br from-violet-500/10 via-purple-500/5 to-transparent border border-violet-500/20 p-5">
        <div className="absolute top-0 right-0 w-32 h-32 bg-violet-500/10 rounded-full blur-2xl -translate-y-1/2 translate-x-1/2" />
        <div className="relative flex items-start gap-4">
          <div className="w-10 h-10 rounded-lg bg-violet-500/20 flex items-center justify-center flex-shrink-0">
            <Star className="w-5 h-5 text-violet-400" />
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
