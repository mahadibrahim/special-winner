"use client"

import { useState, useEffect } from "react"
import {
  Megaphone,
  Pin,
  Calendar,
  User,
  ChevronRight,
  Bell,
} from "lucide-react"
import { Badge } from "@/components/ui/badge"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { cn } from "@/lib/utils"

interface Announcement {
  id: string
  title: string
  content: string
  target: "all" | "parents" | "coaches" | "program" | "team"
  pinned: boolean
  publishedAt: string | null
  expiresAt: string | null
  author: {
    id: string
    firstName: string | null
    lastName: string | null
  } | null
}

export function Announcements() {
  const [announcements, setAnnouncements] = useState<Announcement[]>([])
  // Render the empty state immediately; swap in content once the fetch resolves.
  // Avoids an indefinite SSR-rendered spinner if hydration is slow or the
  // request stalls (cold function, flaky network).
  const [selectedAnnouncement, setSelectedAnnouncement] = useState<Announcement | null>(null)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const response = await fetch("/api/user/announcements")
        if (!cancelled && response.ok) {
          const data = await response.json()
          setAnnouncements(data.announcements || [])
        }
      } catch (err) {
        console.error("Failed to load announcements:", err)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  function formatDate(dateString: string | null) {
    if (!dateString) return ""
    const date = new Date(dateString)
    return date.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    })
  }

  function getTimeAgo(dateString: string | null) {
    if (!dateString) return ""
    const date = new Date(dateString)
    const now = new Date()
    const diffMs = now.getTime() - date.getTime()
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))

    if (diffDays === 0) return "Today"
    if (diffDays === 1) return "Yesterday"
    if (diffDays < 7) return `${diffDays} days ago`
    if (diffDays < 30) return `${Math.floor(diffDays / 7)} weeks ago`
    return formatDate(dateString)
  }

  function getAuthorName(author: Announcement["author"]) {
    if (!author) return "Admin"
    if (author.firstName && author.lastName) {
      return `${author.firstName} ${author.lastName}`
    }
    return author.firstName || "Admin"
  }

  if (announcements.length === 0) {
    return (
      <div className="rounded-2xl bg-paper border border-border py-8 text-center px-6">
        <Bell className="h-10 w-10 text-ink-faint mx-auto mb-3" />
        <p className="text-ink-muted">No announcements at this time</p>
      </div>
    )
  }

  return (
    <>
      <div className="rounded-2xl bg-paper border border-border">
        <div className="px-5 pt-5 pb-3">
          <h2 className="flex items-center gap-2 text-lg font-semibold text-ink">
            <Megaphone className="h-5 w-5 text-ink-muted" />
            Announcements
          </h2>
        </div>
        <div className="px-5 pb-5 space-y-3">
          {announcements.slice(0, 5).map((announcement) => (
            <button
              key={announcement.id}
              onClick={() => setSelectedAnnouncement(announcement)}
              className={cn(
                "w-full text-left p-4 rounded-lg border transition-colors",
                "hover:bg-cream-2 hover:border-border",
                announcement.pinned
                  ? "bg-primary/5 border-primary/20"
                  : "bg-paper border-border"
              )}
            >
              <div className="flex items-start gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    {announcement.pinned && (
                      <Pin className="h-3.5 w-3.5 text-primary flex-shrink-0" />
                    )}
                    <h4 className="font-medium text-ink truncate">{announcement.title}</h4>
                  </div>
                  <p className="text-sm text-ink-muted line-clamp-2">
                    {announcement.content}
                  </p>
                  <div className="flex items-center gap-3 mt-2 text-xs text-ink-muted">
                    <span className="flex items-center gap-1">
                      <User className="h-3 w-3" />
                      {getAuthorName(announcement.author)}
                    </span>
                    <span className="flex items-center gap-1">
                      <Calendar className="h-3 w-3" />
                      {getTimeAgo(announcement.publishedAt)}
                    </span>
                  </div>
                </div>
                <ChevronRight className="h-5 w-5 text-ink-muted flex-shrink-0" />
              </div>
            </button>
          ))}

          {announcements.length > 5 && (
            <p className="text-center text-sm text-ink-muted pt-2">
              +{announcements.length - 5} more announcements
            </p>
          )}
        </div>
      </div>

      {/* Announcement Detail Dialog */}
      <Dialog
        open={!!selectedAnnouncement}
        onOpenChange={(open) => !open && setSelectedAnnouncement(null)}
      >
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {selectedAnnouncement?.pinned && (
                <Badge variant="secondary" className="font-normal">
                  <Pin className="h-3 w-3 mr-1" />
                  Pinned
                </Badge>
              )}
              {selectedAnnouncement?.title}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="flex items-center gap-4 text-sm text-ink-muted">
              <span className="flex items-center gap-1">
                <User className="h-4 w-4" />
                {selectedAnnouncement && getAuthorName(selectedAnnouncement.author)}
              </span>
              <span className="flex items-center gap-1">
                <Calendar className="h-4 w-4" />
                {formatDate(selectedAnnouncement?.publishedAt || null)}
              </span>
            </div>
            <div className="prose prose-sm dark:prose-invert max-w-none">
              <p className="whitespace-pre-wrap">{selectedAnnouncement?.content}</p>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
