"use client"

import { useState, useEffect } from "react"
import { cn } from "@/lib/utils"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog"
import SessionTimeline, { type SessionSegment } from "./session-timeline"
import {
  Calendar,
  Clock,
  Loader2,
  AlertCircle,
  Save,
  Play,
  Edit3,
  CheckCircle,
  Users,
  Target,
  FileText,
  Trash2,
  ArrowLeft,
  Package,
  MessageSquare,
  Star,
  Lightbulb,
  TrendingUp,
} from "lucide-react"

interface SessionPlan {
  id: string
  teamId: string
  templateId: string | null
  coachUserId: string
  title: string
  scheduledDate: string
  durationMinutes: number
  status: "draft" | "planned" | "in_progress" | "completed" | "cancelled"
  segments: SessionSegment[] | null
  focusSkillIds: string[] | null
  objectives: string[] | null
  equipmentNeeded: string[] | null
  preSessionNotes: string | null
  postSessionReflection: string | null
  whatWorkedWell: string | null
  whatToImprove: string | null
  playerObservations: string | null
  completedAt: string | null
  createdAt: string
  updatedAt: string
  team: {
    id: string
    name: string
  }
  sport: {
    id: string
    name: string
  }
}

interface SessionDetailProps {
  sessionId: string
}

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string; icon: typeof Play }> = {
  draft: { label: "Draft", color: "text-gray-400", bg: "bg-gray-500/20", icon: FileText },
  planned: { label: "Planned", color: "text-blue-400", bg: "bg-blue-500/20", icon: Calendar },
  in_progress: { label: "In Progress", color: "text-amber-400", bg: "bg-amber-500/20", icon: Play },
  completed: { label: "Completed", color: "text-green-400", bg: "bg-green-500/20", icon: CheckCircle },
  cancelled: { label: "Cancelled", color: "text-red-400", bg: "bg-red-500/20", icon: AlertCircle },
}

function formatDateTime(dateStr: string): string {
  const date = new Date(dateStr)
  return date.toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  })
}

export default function SessionDetail({ sessionId }: SessionDetailProps) {
  const [session, setSession] = useState<SessionPlan | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Edit states
  const [isEditing, setIsEditing] = useState(false)
  const [editedSegments, setEditedSegments] = useState<SessionSegment[]>([])

  // Reflection states
  const [showReflectionModal, setShowReflectionModal] = useState(false)
  const [reflection, setReflection] = useState({
    postSessionReflection: "",
    whatWorkedWell: "",
    whatToImprove: "",
    playerObservations: "",
  })

  // Delete confirmation
  const [showDeleteModal, setShowDeleteModal] = useState(false)

  useEffect(() => {
    async function fetchSession() {
      try {
        setLoading(true)
        const res = await fetch(`/api/coach/sessions/${sessionId}`)

        if (!res.ok) {
          if (res.status === 404) throw new Error("Session not found")
          if (res.status === 403) throw new Error("Access denied")
          throw new Error("Failed to fetch session")
        }

        const data = await res.json()
        setSession(data.session)
        setEditedSegments(data.session.segments || [])
        setReflection({
          postSessionReflection: data.session.postSessionReflection || "",
          whatWorkedWell: data.session.whatWorkedWell || "",
          whatToImprove: data.session.whatToImprove || "",
          playerObservations: data.session.playerObservations || "",
        })
      } catch (err) {
        console.error("Error fetching session:", err)
        setError(err instanceof Error ? err.message : "Failed to load session")
      } finally {
        setLoading(false)
      }
    }

    fetchSession()
  }, [sessionId])

  const handleSaveSegments = async () => {
    if (!session) return

    try {
      setSaving(true)
      const res = await fetch(`/api/coach/sessions/${sessionId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ segments: editedSegments }),
      })

      if (!res.ok) throw new Error("Failed to save session")

      const data = await res.json()
      setSession(data.session)
      setIsEditing(false)
    } catch (err) {
      console.error("Error saving session:", err)
      setError(err instanceof Error ? err.message : "Failed to save session")
    } finally {
      setSaving(false)
    }
  }

  const handleStatusChange = async (newStatus: string) => {
    if (!session) return

    try {
      setSaving(true)
      const res = await fetch(`/api/coach/sessions/${sessionId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      })

      if (!res.ok) throw new Error("Failed to update status")

      const data = await res.json()
      setSession(data.session)

      if (newStatus === "completed") {
        setShowReflectionModal(true)
      }
    } catch (err) {
      console.error("Error updating status:", err)
      setError(err instanceof Error ? err.message : "Failed to update status")
    } finally {
      setSaving(false)
    }
  }

  const handleSaveReflection = async () => {
    if (!session) return

    try {
      setSaving(true)
      const res = await fetch(`/api/coach/sessions/${sessionId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(reflection),
      })

      if (!res.ok) throw new Error("Failed to save reflection")

      const data = await res.json()
      setSession(data.session)
      setShowReflectionModal(false)
    } catch (err) {
      console.error("Error saving reflection:", err)
      setError(err instanceof Error ? err.message : "Failed to save reflection")
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    try {
      setSaving(true)
      const res = await fetch(`/api/coach/sessions/${sessionId}`, {
        method: "DELETE",
      })

      if (!res.ok) throw new Error("Failed to delete session")

      window.location.href = "/coach/practices"
    } catch (err) {
      console.error("Error deleting session:", err)
      setError(err instanceof Error ? err.message : "Failed to delete session")
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-8 h-8 text-primary animate-spin" />
      </div>
    )
  }

  if (error || !session) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <AlertCircle className="w-12 h-12 text-red-400 mb-4" />
        <h3 className="text-lg font-medium text-white mb-2">
          {error || "Session not found"}
        </h3>
        <Button asChild variant="outline" className="mt-4">
          <a href="/coach/practices">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Practices
          </a>
        </Button>
      </div>
    )
  }

  const statusConfig = STATUS_CONFIG[session.status] || STATUS_CONFIG.draft
  const StatusIcon = statusConfig.icon
  const isPast = new Date(session.scheduledDate) < new Date()
  const canStart = session.status === "planned" && !isPast
  const canComplete = session.status === "in_progress" || session.status === "planned"

  return (
    <div className="space-y-6">
      {/* Header Card */}
      <div className="p-6 rounded-2xl bg-white/[0.02] border border-white/[0.06]">
        <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-6">
          <div>
            <div className="flex items-center gap-3 mb-3">
              <Badge variant="outline" className={cn("gap-1", statusConfig.color)}>
                <StatusIcon className="w-3 h-3" />
                {statusConfig.label}
              </Badge>
              <Badge variant="outline" className="bg-white/[0.02] border-white/[0.06]">
                {session.sport.name}
              </Badge>
            </div>

            <h1 className="text-2xl font-bold text-white mb-2">{session.title}</h1>

            <div className="flex flex-wrap items-center gap-4 text-sm text-gray-500">
              <span className="flex items-center gap-1.5">
                <Users className="w-4 h-4" />
                {session.team.name}
              </span>
              <span className="flex items-center gap-1.5">
                <Calendar className="w-4 h-4" />
                {formatDateTime(session.scheduledDate)}
              </span>
              <span className="flex items-center gap-1.5">
                <Clock className="w-4 h-4" />
                {session.durationMinutes} minutes
              </span>
            </div>
          </div>

          {/* Actions */}
          <div className="flex flex-wrap gap-2">
            {canStart && (
              <Button
                onClick={() => handleStatusChange("in_progress")}
                disabled={saving}
                className="gap-2"
              >
                <Play className="w-4 h-4" />
                Start Session
              </Button>
            )}

            {canComplete && (
              <Button
                onClick={() => handleStatusChange("completed")}
                disabled={saving}
                variant={session.status === "in_progress" ? "default" : "outline"}
                className="gap-2"
              >
                <CheckCircle className="w-4 h-4" />
                Mark Complete
              </Button>
            )}

            {session.status === "completed" && (
              <Button
                onClick={() => setShowReflectionModal(true)}
                variant="outline"
                className="gap-2"
              >
                <MessageSquare className="w-4 h-4" />
                {reflection.postSessionReflection ? "Edit Reflection" : "Add Reflection"}
              </Button>
            )}

            <Button
              variant="ghost"
              className="text-red-400 hover:text-red-300 hover:bg-red-500/10"
              onClick={() => setShowDeleteModal(true)}
            >
              <Trash2 className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </div>

      {/* Main Content Grid */}
      <div className="grid gap-6 lg:grid-cols-3">
        {/* Left Column - Timeline */}
        <div className="lg:col-span-2 space-y-6">
          {/* Session Timeline */}
          <div className="p-6 rounded-2xl bg-white/[0.02] border border-white/[0.06]">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-white">Session Plan</h2>
              {!isEditing && session.status !== "completed" && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setIsEditing(true)}
                  className="gap-2"
                >
                  <Edit3 className="w-4 h-4" />
                  Edit
                </Button>
              )}
            </div>

            <SessionTimeline
              segments={isEditing ? editedSegments : (session.segments || [])}
              onChange={setEditedSegments}
              readOnly={!isEditing}
              totalDuration={session.durationMinutes}
            />

            {isEditing && (
              <div className="flex justify-end gap-2 mt-4 pt-4 border-t border-white/[0.06]">
                <Button
                  variant="ghost"
                  onClick={() => {
                    setEditedSegments(session.segments || [])
                    setIsEditing(false)
                  }}
                >
                  Cancel
                </Button>
                <Button onClick={handleSaveSegments} disabled={saving}>
                  {saving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Save className="w-4 h-4 mr-2" />}
                  Save Changes
                </Button>
              </div>
            )}
          </div>

          {/* Post-Session Reflection */}
          {session.status === "completed" && (reflection.postSessionReflection || reflection.whatWorkedWell || reflection.whatToImprove) && (
            <div className="p-6 rounded-2xl bg-white/[0.02] border border-white/[0.06]">
              <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                <MessageSquare className="w-5 h-5 text-primary" />
                Session Reflection
              </h2>

              <div className="space-y-4">
                {reflection.postSessionReflection && (
                  <div>
                    <h3 className="text-sm font-medium text-gray-400 mb-2">Overall Reflection</h3>
                    <p className="text-gray-300">{reflection.postSessionReflection}</p>
                  </div>
                )}

                <div className="grid gap-4 sm:grid-cols-2">
                  {reflection.whatWorkedWell && (
                    <div className="p-4 rounded-xl bg-green-500/10 border border-green-500/20">
                      <h3 className="text-sm font-medium text-green-400 mb-2 flex items-center gap-2">
                        <Star className="w-4 h-4" />
                        What Worked Well
                      </h3>
                      <p className="text-sm text-gray-300">{reflection.whatWorkedWell}</p>
                    </div>
                  )}

                  {reflection.whatToImprove && (
                    <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/20">
                      <h3 className="text-sm font-medium text-amber-400 mb-2 flex items-center gap-2">
                        <TrendingUp className="w-4 h-4" />
                        What to Improve
                      </h3>
                      <p className="text-sm text-gray-300">{reflection.whatToImprove}</p>
                    </div>
                  )}
                </div>

                {reflection.playerObservations && (
                  <div>
                    <h3 className="text-sm font-medium text-gray-400 mb-2 flex items-center gap-2">
                      <Lightbulb className="w-4 h-4" />
                      Player Observations
                    </h3>
                    <p className="text-gray-300">{reflection.playerObservations}</p>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Right Column - Details */}
        <div className="space-y-4">
          {/* Pre-Session Notes */}
          {session.preSessionNotes && (
            <div className="p-4 rounded-xl bg-white/[0.02] border border-white/[0.06]">
              <h3 className="text-sm font-medium text-gray-400 mb-2">Pre-Session Notes</h3>
              <p className="text-sm text-gray-300">{session.preSessionNotes}</p>
            </div>
          )}

          {/* Objectives */}
          {session.objectives && session.objectives.length > 0 && (
            <div className="p-4 rounded-xl bg-white/[0.02] border border-white/[0.06]">
              <h3 className="text-sm font-medium text-gray-400 mb-2 flex items-center gap-2">
                <Target className="w-4 h-4" />
                Objectives
              </h3>
              <ul className="space-y-1.5">
                {session.objectives.map((obj, i) => (
                  <li key={i} className="text-sm text-gray-300 flex items-start gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-primary mt-1.5 shrink-0" />
                    {obj}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Equipment */}
          {session.equipmentNeeded && session.equipmentNeeded.length > 0 && (
            <div className="p-4 rounded-xl bg-white/[0.02] border border-white/[0.06]">
              <h3 className="text-sm font-medium text-gray-400 mb-2 flex items-center gap-2">
                <Package className="w-4 h-4" />
                Equipment Needed
              </h3>
              <div className="flex flex-wrap gap-2">
                {session.equipmentNeeded.map((item, i) => (
                  <Badge key={i} variant="outline" className="bg-white/[0.02] border-white/[0.06]">
                    {item}
                  </Badge>
                ))}
              </div>
            </div>
          )}

          {/* Quick Stats */}
          <div className="p-4 rounded-xl bg-white/[0.02] border border-white/[0.06]">
            <h3 className="text-sm font-medium text-gray-400 mb-3">Session Info</h3>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-500">Segments</span>
                <span className="text-white">{session.segments?.length || 0}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Total Duration</span>
                <span className="text-white">{session.durationMinutes} min</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Created</span>
                <span className="text-white">
                  {new Date(session.createdAt).toLocaleDateString()}
                </span>
              </div>
              {session.completedAt && (
                <div className="flex justify-between">
                  <span className="text-gray-500">Completed</span>
                  <span className="text-white">
                    {new Date(session.completedAt).toLocaleDateString()}
                  </span>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Reflection Modal */}
      <Dialog open={showReflectionModal} onOpenChange={setShowReflectionModal}>
        <DialogContent className="max-w-2xl bg-[#0a0a0f] border-white/10">
          <DialogHeader>
            <DialogTitle>Session Reflection</DialogTitle>
            <DialogDescription>
              Reflect on what went well and what can be improved for next time.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 mt-4">
            <div>
              <label className="text-sm text-gray-400 mb-1.5 block">Overall Reflection</label>
              <Textarea
                value={reflection.postSessionReflection}
                onChange={(e) => setReflection({ ...reflection, postSessionReflection: e.target.value })}
                placeholder="How did the session go overall?"
                className="min-h-[80px] bg-white/[0.02] border-white/[0.06]"
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="text-sm text-gray-400 mb-1.5 block">What Worked Well</label>
                <Textarea
                  value={reflection.whatWorkedWell}
                  onChange={(e) => setReflection({ ...reflection, whatWorkedWell: e.target.value })}
                  placeholder="Activities, approaches that were effective..."
                  className="min-h-[100px] bg-white/[0.02] border-white/[0.06]"
                />
              </div>
              <div>
                <label className="text-sm text-gray-400 mb-1.5 block">What to Improve</label>
                <Textarea
                  value={reflection.whatToImprove}
                  onChange={(e) => setReflection({ ...reflection, whatToImprove: e.target.value })}
                  placeholder="Areas to focus on next time..."
                  className="min-h-[100px] bg-white/[0.02] border-white/[0.06]"
                />
              </div>
            </div>

            <div>
              <label className="text-sm text-gray-400 mb-1.5 block">Player Observations</label>
              <Textarea
                value={reflection.playerObservations}
                onChange={(e) => setReflection({ ...reflection, playerObservations: e.target.value })}
                placeholder="Notable player progress, challenges, or observations..."
                className="min-h-[80px] bg-white/[0.02] border-white/[0.06]"
              />
            </div>

            <div className="flex justify-end gap-2 pt-4">
              <Button variant="ghost" onClick={() => setShowReflectionModal(false)}>
                Cancel
              </Button>
              <Button onClick={handleSaveReflection} disabled={saving}>
                {saving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Save className="w-4 h-4 mr-2" />}
                Save Reflection
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Modal */}
      <Dialog open={showDeleteModal} onOpenChange={setShowDeleteModal}>
        <DialogContent className="bg-[#0a0a0f] border-white/10">
          <DialogHeader>
            <DialogTitle>Delete Session</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete this session? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>

          <div className="flex justify-end gap-2 mt-4">
            <Button variant="ghost" onClick={() => setShowDeleteModal(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleDelete}
              disabled={saving}
              className="bg-red-500/20 text-red-400 hover:bg-red-500/30"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Trash2 className="w-4 h-4 mr-2" />}
              Delete Session
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
