"use client"

import { useState, useMemo } from "react"
import {
  MessageSquare,
  Search,
  Filter,
  Calendar,
  Star,
  StarOff,
  ChevronDown,
  ChevronRight,
  TrendingUp,
  Award,
  AlertCircle,
  Heart,
  User,
  Clock,
  Download,
  Printer,
  X,
  Check
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"

type NoteCategory = "progress" | "achievement" | "focus" | "encouragement"
type ViewMode = "timeline" | "by-child" | "by-date"

interface CoachNote {
  id: string
  childId: string
  childName: string
  childAvatar?: string
  coachName: string
  coachRole: string
  date: Date
  category: NoteCategory
  title: string
  content: string
  program: string
  sport: string
  isRead: boolean
  isFavorite: boolean
}

const categoryConfig: Record<NoteCategory, {
  icon: typeof TrendingUp
  label: string
  color: string
  bgColor: string
  borderColor: string
}> = {
  progress: {
    icon: TrendingUp,
    label: "Progress Update",
    color: "text-emerald-400",
    bgColor: "bg-emerald-500/10",
    borderColor: "border-emerald-500/30",
  },
  achievement: {
    icon: Award,
    label: "Achievement",
    color: "text-amber-400",
    bgColor: "bg-amber-500/10",
    borderColor: "border-amber-500/30",
  },
  focus: {
    icon: AlertCircle,
    label: "Focus Area",
    color: "text-primary",
    bgColor: "bg-blue-500/10",
    borderColor: "border-primary/20",
  },
  encouragement: {
    icon: Heart,
    label: "Encouragement",
    color: "text-pink-400",
    bgColor: "bg-pink-500/10",
    borderColor: "border-pink-500/30",
  },
}

// Mock data
const mockNotes: CoachNote[] = [
  {
    id: "1",
    childId: "emma",
    childName: "Emma",
    coachName: "Coach Martinez",
    coachRole: "Head Coach",
    date: new Date(Date.now() - 1000 * 60 * 60 * 2),
    category: "progress",
    title: "Great improvement in ball control",
    content: "Emma has shown remarkable improvement in her ball control over the past few weeks. During today's practice, she successfully completed all dribbling drills with significantly fewer touches lost. I've noticed she's more confident when receiving passes under pressure. Her dedication to practicing the techniques we've discussed is really paying off. Keep encouraging her to work on her weak foot as well - she's ready for that challenge!",
    program: "U10 Lightning",
    sport: "Soccer",
    isRead: false,
    isFavorite: false,
  },
  {
    id: "2",
    childId: "emma",
    childName: "Emma",
    coachName: "Coach Thompson",
    coachRole: "Assistant Coach",
    date: new Date(Date.now() - 1000 * 60 * 60 * 24 * 2),
    category: "achievement",
    title: "Team Player of the Week",
    content: "Congratulations! Emma has been selected as our Team Player of the Week. She demonstrated exceptional sportsmanship during Saturday's game, helping a teammate who was struggling and always being the first to encourage others. This kind of positive attitude is exactly what makes great teams. She'll receive her certificate at the next practice.",
    program: "U10 Lightning",
    sport: "Soccer",
    isRead: true,
    isFavorite: true,
  },
  {
    id: "3",
    childId: "liam",
    childName: "Liam",
    coachName: "Coach Johnson",
    coachRole: "Skills Coach",
    date: new Date(Date.now() - 1000 * 60 * 60 * 24 * 3),
    category: "focus",
    title: "Defensive positioning needs work",
    content: "During our last few sessions, I've noticed Liam tends to commit too early when defending, which leaves him out of position. This is very common at his age and easily correctable. We're going to spend some extra time on defensive drills over the next few practices. Some video examples might help - I'll send some age-appropriate clips that demonstrate proper positioning. Please reinforce patience when he's playing defense.",
    program: "U8 Thunder",
    sport: "Soccer",
    isRead: true,
    isFavorite: false,
  },
  {
    id: "4",
    childId: "liam",
    childName: "Liam",
    coachName: "Coach Martinez",
    coachRole: "Head Coach",
    date: new Date(Date.now() - 1000 * 60 * 60 * 24 * 5),
    category: "encouragement",
    title: "Keep up the positive attitude!",
    content: "Just wanted to share how impressed I am with Liam's attitude at practice. Even when drills are challenging, he keeps trying and maintains a great spirit. This resilience is one of the most important traits in sports and in life. He's a pleasure to coach and his enthusiasm is contagious for the whole team!",
    program: "U8 Thunder",
    sport: "Soccer",
    isRead: true,
    isFavorite: true,
  },
  {
    id: "5",
    childId: "emma",
    childName: "Emma",
    coachName: "Coach Williams",
    coachRole: "Basketball Coach",
    date: new Date(Date.now() - 1000 * 60 * 60 * 24 * 7),
    category: "progress",
    title: "Shooting form improvement",
    content: "Emma's shooting form has improved significantly since we adjusted her hand positioning. Her free throw percentage in practice has gone from about 30% to nearly 50%. We'll continue working on follow-through and arc. She's picking up basketball fundamentals quickly despite this being her first season!",
    program: "Youth Basketball",
    sport: "Basketball",
    isRead: true,
    isFavorite: false,
  },
  {
    id: "6",
    childId: "emma",
    childName: "Emma",
    coachName: "Coach Martinez",
    coachRole: "Head Coach",
    date: new Date(Date.now() - 1000 * 60 * 60 * 24 * 14),
    category: "achievement",
    title: "First competitive goal!",
    content: "What a moment! Emma scored her first competitive goal in yesterday's match. It was a well-placed shot from just inside the box after a great team build-up. You should have seen her face - pure joy! This is a milestone moment and I hope you can celebrate it at home too. She's been working hard and it's wonderful to see it pay off.",
    program: "U10 Lightning",
    sport: "Soccer",
    isRead: true,
    isFavorite: true,
  },
]

const mockChildren = [
  { id: "emma", name: "Emma" },
  { id: "liam", name: "Liam" },
]

function NoteCard({
  note,
  expanded,
  onToggleExpand,
  onToggleFavorite,
  onMarkRead,
}: {
  note: CoachNote
  expanded: boolean
  onToggleExpand: () => void
  onToggleFavorite: () => void
  onMarkRead: () => void
}) {
  const config = categoryConfig[note.category]
  const Icon = config.icon

  const formatDate = (date: Date) => {
    const now = new Date()
    const diffMs = now.getTime() - date.getTime()
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60))
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))

    if (diffHours < 1) return "Just now"
    if (diffHours < 24) return `${diffHours}h ago`
    if (diffDays < 7) return `${diffDays}d ago`
    return date.toLocaleDateString("en-US", { month: "short", day: "numeric" })
  }

  return (
    <div
      className={cn(
        "group relative overflow-hidden rounded-2xl border transition-all duration-300",
        expanded ? "bg-cream-2" : "bg-paper hover:bg-paper",
        config.borderColor,
        !note.isRead && "ring-1 ring-primary/30"
      )}
    >
      {/* Unread indicator */}
      {!note.isRead && (
        <div className="absolute top-4 left-4 w-2 h-2 rounded-full bg-primary animate-pulse" />
      )}

      <div className="p-5">
        {/* Header */}
        <div className="flex items-start gap-4">
          {/* Category Icon */}
          <div className={cn(
            "w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0",
            config.bgColor
          )}>
            <Icon className={cn("w-5 h-5", config.color)} />
          </div>

          {/* Content */}
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-3 mb-1">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <Badge className={cn("text-[10px]", config.bgColor, config.color, "border-0")}>
                    {config.label}
                  </Badge>
                  <span className="text-xs text-ink-faint">
                    {formatDate(note.date)}
                  </span>
                </div>
                <h3 className="font-semibold text-ink text-sm leading-tight">
                  {note.title}
                </h3>
              </div>

              {/* Actions */}
              <div className="flex items-center gap-1">
                <button
                  onClick={(e) => { e.stopPropagation(); onToggleFavorite(); }}
                  className="p-1.5 rounded-lg hover:bg-cream-3 transition-colors"
                >
                  {note.isFavorite ? (
                    <Star className="w-4 h-4 text-amber-400 fill-amber-400" />
                  ) : (
                    <StarOff className="w-4 h-4 text-ink-faint hover:text-ink-muted" />
                  )}
                </button>
                {!note.isRead && (
                  <button
                    onClick={(e) => { e.stopPropagation(); onMarkRead(); }}
                    className="p-1.5 rounded-lg hover:bg-cream-3 transition-colors"
                    title="Mark as read"
                  >
                    <Check className="w-4 h-4 text-ink-faint hover:text-emerald-400" />
                  </button>
                )}
              </div>
            </div>

            {/* Meta info */}
            <div className="flex items-center gap-3 text-xs text-ink-muted mb-3">
              <span className="flex items-center gap-1">
                <User className="w-3 h-3" />
                {note.childName}
              </span>
              <span>{note.coachName}</span>
              <span>{note.program}</span>
            </div>

            {/* Preview or full content */}
            <p className={cn(
              "text-sm text-ink-muted leading-relaxed",
              !expanded && "line-clamp-2"
            )}>
              {note.content}
            </p>

            {/* Expand button */}
            <button
              onClick={onToggleExpand}
              className="mt-3 flex items-center gap-1 text-xs text-ink-muted hover:text-ink transition-colors"
            >
              {expanded ? (
                <>
                  <ChevronDown className="w-3.5 h-3.5" />
                  Show less
                </>
              ) : (
                <>
                  <ChevronRight className="w-3.5 h-3.5" />
                  Read more
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

function GroupedByChild({
  notes,
  expandedId,
  onToggleExpand,
  onToggleFavorite,
  onMarkRead,
}: {
  notes: CoachNote[]
  expandedId: string | null
  onToggleExpand: (id: string) => void
  onToggleFavorite: (id: string) => void
  onMarkRead: (id: string) => void
}) {
  const grouped = useMemo(() => {
    const groups: Record<string, CoachNote[]> = {}
    notes.forEach(note => {
      if (!groups[note.childId]) {
        groups[note.childId] = []
      }
      groups[note.childId].push(note)
    })
    return groups
  }, [notes])

  return (
    <div className="space-y-8">
      {Object.entries(grouped).map(([childId, childNotes]) => (
        <div key={childId}>
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary to-orange-500 flex items-center justify-center">
              <span className="text-sm font-bold text-white">
                {childNotes[0].childName[0]}
              </span>
            </div>
            <div>
              <h3 className="font-semibold text-ink">{childNotes[0].childName}</h3>
              <p className="text-xs text-ink-muted">{childNotes.length} notes</p>
            </div>
          </div>
          <div className="space-y-3 pl-[52px]">
            {childNotes.map(note => (
              <NoteCard
                key={note.id}
                note={note}
                expanded={expandedId === note.id}
                onToggleExpand={() => onToggleExpand(note.id)}
                onToggleFavorite={() => onToggleFavorite(note.id)}
                onMarkRead={() => onMarkRead(note.id)}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

function GroupedByDate({
  notes,
  expandedId,
  onToggleExpand,
  onToggleFavorite,
  onMarkRead,
}: {
  notes: CoachNote[]
  expandedId: string | null
  onToggleExpand: (id: string) => void
  onToggleFavorite: (id: string) => void
  onMarkRead: (id: string) => void
}) {
  const grouped = useMemo(() => {
    const groups: { label: string; notes: CoachNote[] }[] = []
    const now = new Date()
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    const thisWeek = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000)
    const thisMonth = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000)

    const todayNotes = notes.filter(n => n.date >= today)
    const weekNotes = notes.filter(n => n.date >= thisWeek && n.date < today)
    const monthNotes = notes.filter(n => n.date >= thisMonth && n.date < thisWeek)
    const olderNotes = notes.filter(n => n.date < thisMonth)

    if (todayNotes.length) groups.push({ label: "Today", notes: todayNotes })
    if (weekNotes.length) groups.push({ label: "This Week", notes: weekNotes })
    if (monthNotes.length) groups.push({ label: "This Month", notes: monthNotes })
    if (olderNotes.length) groups.push({ label: "Earlier", notes: olderNotes })

    return groups
  }, [notes])

  return (
    <div className="space-y-8">
      {grouped.map(group => (
        <div key={group.label}>
          <h3 className="font-semibold text-ink mb-4 flex items-center gap-2">
            <Calendar className="w-4 h-4 text-ink-muted" />
            {group.label}
            <span className="text-xs text-ink-faint font-normal">
              ({group.notes.length})
            </span>
          </h3>
          <div className="space-y-3">
            {group.notes.map(note => (
              <NoteCard
                key={note.id}
                note={note}
                expanded={expandedId === note.id}
                onToggleExpand={() => onToggleExpand(note.id)}
                onToggleFavorite={() => onToggleFavorite(note.id)}
                onMarkRead={() => onMarkRead(note.id)}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

export default function CoachNotesFull() {
  const [notes, setNotes] = useState(mockNotes)
  const [viewMode, setViewMode] = useState<ViewMode>("timeline")
  const [selectedCategory, setSelectedCategory] = useState<NoteCategory | "all">("all")
  const [selectedChild, setSelectedChild] = useState<string | "all">("all")
  const [searchQuery, setSearchQuery] = useState("")
  const [showFavoritesOnly, setShowFavoritesOnly] = useState(false)
  const [expandedId, setExpandedId] = useState<string | null>(null)

  const filteredNotes = useMemo(() => {
    return notes.filter(note => {
      if (selectedCategory !== "all" && note.category !== selectedCategory) return false
      if (selectedChild !== "all" && note.childId !== selectedChild) return false
      if (showFavoritesOnly && !note.isFavorite) return false
      if (searchQuery) {
        const query = searchQuery.toLowerCase()
        return (
          note.title.toLowerCase().includes(query) ||
          note.content.toLowerCase().includes(query) ||
          note.coachName.toLowerCase().includes(query)
        )
      }
      return true
    })
  }, [notes, selectedCategory, selectedChild, showFavoritesOnly, searchQuery])

  const unreadCount = notes.filter(n => !n.isRead).length

  const handleToggleFavorite = (id: string) => {
    setNotes(prev => prev.map(n =>
      n.id === id ? { ...n, isFavorite: !n.isFavorite } : n
    ))
  }

  const handleMarkRead = (id: string) => {
    setNotes(prev => prev.map(n =>
      n.id === id ? { ...n, isRead: true } : n
    ))
  }

  const handleMarkAllRead = () => {
    setNotes(prev => prev.map(n => ({ ...n, isRead: true })))
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-ink flex items-center gap-3">
            <MessageSquare className="w-7 h-7 text-primary" />
            Coach Notes
            {unreadCount > 0 && (
              <Badge className="bg-primary text-white">
                {unreadCount} new
              </Badge>
            )}
          </h1>
          <p className="text-sm text-ink-muted mt-1">
            Feedback and updates from coaches across all programs
          </p>
        </div>

        <div className="flex items-center gap-2">
          {unreadCount > 0 && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleMarkAllRead}
              className="border-border text-ink-muted hover:text-ink"
            >
              <Check className="w-4 h-4 mr-1" />
              Mark all read
            </Button>
          )}
          <Button
            variant="outline"
            size="sm"
            className="border-border text-ink-muted hover:text-ink"
          >
            <Printer className="w-4 h-4 mr-1" />
            Print
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="border-border text-ink-muted hover:text-ink"
          >
            <Download className="w-4 h-4 mr-1" />
            Export
          </Button>
        </div>
      </div>

      {/* Filters Bar */}
      <div className="p-4 rounded-2xl bg-paper border border-border space-y-4">
        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-muted" />
          <input
            type="text"
            placeholder="Search notes..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-paper border border-border text-ink placeholder:text-ink-faint text-sm focus:outline-none focus:border-primary/50 transition-colors"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery("")}
              className="absolute right-3 top-1/2 -translate-y-1/2 p-1 rounded hover:bg-cream-3"
            >
              <X className="w-3.5 h-3.5 text-ink-muted" />
            </button>
          )}
        </div>

        {/* Filter Row */}
        <div className="flex flex-wrap items-center gap-3">
          {/* View Mode */}
          <div className="flex items-center gap-1 p-1 rounded-xl bg-paper">
            {[
              { key: "timeline", label: "Timeline" },
              { key: "by-child", label: "By Child" },
              { key: "by-date", label: "By Date" },
            ].map(({ key, label }) => (
              <button
                key={key}
                onClick={() => setViewMode(key as ViewMode)}
                className={cn(
                  "px-3 py-1.5 rounded-lg text-xs font-medium transition-all",
                  viewMode === key
                    ? "bg-cream-3 text-ink"
                    : "text-ink-muted hover:text-ink-2"
                )}
              >
                {label}
              </button>
            ))}
          </div>

          {/* Child Filter */}
          <select
            value={selectedChild}
            onChange={(e) => setSelectedChild(e.target.value)}
            className="px-3 py-2 rounded-xl bg-paper border border-border text-sm text-ink-2 focus:outline-none focus:border-primary/50"
          >
            <option value="all">All Children</option>
            {mockChildren.map(child => (
              <option key={child.id} value={child.id}>{child.name}</option>
            ))}
          </select>

          {/* Category Filter */}
          <select
            value={selectedCategory}
            onChange={(e) => setSelectedCategory(e.target.value as NoteCategory | "all")}
            className="px-3 py-2 rounded-xl bg-paper border border-border text-sm text-ink-2 focus:outline-none focus:border-primary/50"
          >
            <option value="all">All Categories</option>
            {Object.entries(categoryConfig).map(([key, config]) => (
              <option key={key} value={key}>{config.label}</option>
            ))}
          </select>

          {/* Favorites Toggle */}
          <button
            onClick={() => setShowFavoritesOnly(!showFavoritesOnly)}
            className={cn(
              "flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium transition-all",
              showFavoritesOnly
                ? "bg-amber-500/20 text-amber-400 border border-amber-500/30"
                : "bg-paper text-ink-muted border border-border hover:text-ink-2"
            )}
          >
            <Star className={cn("w-3.5 h-3.5", showFavoritesOnly && "fill-amber-400")} />
            Favorites
          </button>
        </div>
      </div>

      {/* Results count */}
      <p className="text-sm text-ink-muted">
        Showing {filteredNotes.length} of {notes.length} notes
      </p>

      {/* Notes Display */}
      {filteredNotes.length === 0 ? (
        <div className="text-center py-16 px-6 rounded-2xl bg-paper border border-border">
          <MessageSquare className="w-12 h-12 text-ink-faint mx-auto mb-3" />
          <h3 className="text-ink font-medium mb-1">No notes found</h3>
          <p className="text-sm text-ink-muted">
            {searchQuery
              ? "Try adjusting your search or filters"
              : "Coach notes will appear here as they're added"}
          </p>
        </div>
      ) : viewMode === "timeline" ? (
        <div className="space-y-3">
          {filteredNotes.map(note => (
            <NoteCard
              key={note.id}
              note={note}
              expanded={expandedId === note.id}
              onToggleExpand={() => setExpandedId(expandedId === note.id ? null : note.id)}
              onToggleFavorite={() => handleToggleFavorite(note.id)}
              onMarkRead={() => handleMarkRead(note.id)}
            />
          ))}
        </div>
      ) : viewMode === "by-child" ? (
        <GroupedByChild
          notes={filteredNotes}
          expandedId={expandedId}
          onToggleExpand={(id) => setExpandedId(expandedId === id ? null : id)}
          onToggleFavorite={handleToggleFavorite}
          onMarkRead={handleMarkRead}
        />
      ) : (
        <GroupedByDate
          notes={filteredNotes}
          expandedId={expandedId}
          onToggleExpand={(id) => setExpandedId(expandedId === id ? null : id)}
          onToggleFavorite={handleToggleFavorite}
          onMarkRead={handleMarkRead}
        />
      )}
    </div>
  )
}
