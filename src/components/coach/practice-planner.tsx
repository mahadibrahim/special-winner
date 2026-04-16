"use client"

import { useState, useEffect } from "react"
import { cn } from "@/lib/utils"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog"
import SessionTimeline, { type SessionSegment } from "./session-timeline"
import ActivityCard from "./activity-card"
import {
  Calendar,
  Clock,
  Search,
  Filter,
  Loader2,
  AlertCircle,
  Save,
  Play,
  FileText,
  Target,
  Zap,
  Lightbulb,
  Gamepad2,
  CheckCircle,
  X,
  ChevronRight,
} from "lucide-react"

interface Team {
  id: string
  name: string
  sport: {
    id: string
    name: string
  }
  season?: {
    id: string
    name: string
  } | null
}

interface Activity {
  id: string
  sportId: string
  name: string
  slug: string
  description: string | null
  activityType: "warmup" | "technical" | "tactical" | "game" | "scrimmage" | "conditioning" | "cooldown" | "fun"
  difficulty: "beginner" | "intermediate" | "advanced"
  minPlayers: number
  maxPlayers: number | null
  durationMinutes: number
  setupInstructions: string | null
  howToPlay: string
  coachingPoints: string[] | null
  questionsToAsk: string[] | null
  commonMistakes: string[] | null
  variations: { name: string; description: string; difficulty: string }[] | null
  makeEasier: string | null
  makeHarder: string | null
  equipmentNeeded: string[] | null
  spaceRequired: string | null
  indoorSuitable: boolean
  tags: string[] | null
  featured: boolean
  usageCount: number
  averageRating: number | null
}

interface PracticeTemplate {
  id: string
  name: string
  description: string | null
  totalDurationMinutes: number
  structure: {
    name: string
    type: string
    durationMinutes: number
    description?: string
    activitySuggestions?: string[]
  }[] | null
  equipmentNeeded: string[] | null
  coachingNotes: string | null
  sport: {
    id: string
    name: string
  }
  stage: {
    id: string
    name: string
    slug: string
  }
}

interface Stage {
  id: string
  name: string
  slug: string
  ageMin: number | null
  ageMax: number | null
}

interface PracticePlannerProps {
  teamId?: string
  onSuccess?: (sessionId: string) => void
}

export default function PracticePlanner({ teamId, onSuccess }: PracticePlannerProps) {
  // Data state
  const [teams, setTeams] = useState<Team[]>([])
  const [templates, setTemplates] = useState<PracticeTemplate[]>([])
  const [activities, setActivities] = useState<Activity[]>([])
  const [stages, setStages] = useState<Stage[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Form state
  const [selectedTeam, setSelectedTeam] = useState<string>(teamId || "")
  const [selectedTemplate, setSelectedTemplate] = useState<PracticeTemplate | null>(null)
  const [title, setTitle] = useState("")
  const [scheduledDate, setScheduledDate] = useState("")
  const [scheduledTime, setScheduledTime] = useState("16:00")
  const [durationMinutes, setDurationMinutes] = useState(60)
  const [segments, setSegments] = useState<SessionSegment[]>([])
  const [objectives, setObjectives] = useState<string[]>([])
  const [equipmentNeeded, setEquipmentNeeded] = useState<string[]>([])
  const [preSessionNotes, setPreSessionNotes] = useState("")

  // UI state
  const [step, setStep] = useState<"setup" | "build" | "review">("setup")
  const [activitySearchQuery, setActivitySearchQuery] = useState("")
  const [activityTypeFilter, setActivityTypeFilter] = useState<string>("all")
  const [showActivityBrowser, setShowActivityBrowser] = useState(false)
  const [successModalOpen, setSuccessModalOpen] = useState(false)
  const [createdSessionId, setCreatedSessionId] = useState<string | null>(null)

  // Fetch initial data
  useEffect(() => {
    async function fetchData() {
      try {
        setLoading(true)

        // Fetch teams, templates, and activities in parallel
        const [teamsRes, templatesRes, activitiesRes] = await Promise.all([
          fetch("/api/coach/teams"),
          fetch("/api/coach/templates"),
          fetch("/api/coach/activities?limit=100"),
        ])

        if (!teamsRes.ok) throw new Error("Failed to fetch teams")
        if (!templatesRes.ok) throw new Error("Failed to fetch templates")
        if (!activitiesRes.ok) throw new Error("Failed to fetch activities")

        const teamsData = await teamsRes.json()
        const templatesData = await templatesRes.json()
        const activitiesData = await activitiesRes.json()

        setTeams(teamsData.teams || [])
        setTemplates(templatesData.templates || [])
        setStages(templatesData.stages || [])
        setActivities(activitiesData.activities || [])

        // Set default team if provided
        if (teamId && teamsData.teams?.some((t: Team) => t.id === teamId)) {
          setSelectedTeam(teamId)
        }
      } catch (err) {
        console.error("Error fetching data:", err)
        setError(err instanceof Error ? err.message : "Failed to load data")
      } finally {
        setLoading(false)
      }
    }

    fetchData()
  }, [teamId])

  // Filter activities for current team's sport
  const selectedTeamData = teams.find((t) => t.id === selectedTeam)
  const sportId = selectedTeamData?.sport.id

  const filteredActivities = activities.filter((a) => {
    // Filter by sport
    if (sportId && a.sportId !== sportId) return false

    // Filter by search query
    if (activitySearchQuery) {
      const query = activitySearchQuery.toLowerCase()
      if (!a.name.toLowerCase().includes(query) && !a.description?.toLowerCase().includes(query)) {
        return false
      }
    }

    // Filter by type
    if (activityTypeFilter !== "all" && a.activityType !== activityTypeFilter) {
      return false
    }

    return true
  })

  // Filter templates for current team's sport
  const filteredTemplates = templates.filter((t) => {
    if (sportId && t.sport.id !== sportId) return false
    return true
  })

  // Apply template
  const applyTemplate = (template: PracticeTemplate) => {
    setSelectedTemplate(template)
    setDurationMinutes(template.totalDurationMinutes)
    setEquipmentNeeded(template.equipmentNeeded || [])

    if (template.structure) {
      const newSegments: SessionSegment[] = template.structure.map((s, index) => ({
        order: index,
        name: s.name,
        type: s.type,
        durationMinutes: s.durationMinutes,
        notes: s.description,
      }))
      setSegments(newSegments)
    }
  }

  // Add activity to a segment
  const addActivityToSession = (activity: Activity) => {
    const newSegment: SessionSegment = {
      order: segments.length,
      name: activity.name,
      type: activity.activityType,
      durationMinutes: activity.durationMinutes,
      activityId: activity.id,
      activityName: activity.name,
    }
    setSegments([...segments, newSegment])
    setShowActivityBrowser(false)
  }

  // Save session
  const handleSave = async (status: "draft" | "planned" = "draft") => {
    if (!selectedTeam || !title || !scheduledDate) {
      setError("Please fill in all required fields")
      return
    }

    try {
      setSaving(true)
      setError(null)

      const scheduledDateTime = new Date(`${scheduledDate}T${scheduledTime}:00`)

      const res = await fetch("/api/coach/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          teamId: selectedTeam,
          templateId: selectedTemplate?.id,
          title,
          scheduledDate: scheduledDateTime.toISOString(),
          durationMinutes,
          segments,
          objectives: objectives.filter(Boolean),
          equipmentNeeded: equipmentNeeded.filter(Boolean),
          preSessionNotes: preSessionNotes || undefined,
        }),
      })

      if (!res.ok) {
        const errorData = await res.json()
        throw new Error(errorData.error || "Failed to save session")
      }

      const data = await res.json()
      setCreatedSessionId(data.session.id)
      setSuccessModalOpen(true)

      if (onSuccess) {
        onSuccess(data.session.id)
      }
    } catch (err) {
      console.error("Error saving session:", err)
      setError(err instanceof Error ? err.message : "Failed to save session")
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

  if (error && !teams.length) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <AlertCircle className="w-12 h-12 text-red-400 mb-4" />
        <h3 className="text-lg font-medium text-ink mb-2">Something went wrong</h3>
        <p className="text-sm text-ink-muted">{error}</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Progress Steps */}
      <div className="flex items-center justify-center gap-4">
        {["setup", "build", "review"].map((s, index) => (
          <button
            key={s}
            onClick={() => setStep(s as typeof step)}
            className={cn(
              "flex items-center gap-2 px-4 py-2 rounded-lg transition-all",
              step === s
                ? "bg-primary text-ink"
                : "bg-paper text-ink-muted hover:text-ink hover:bg-cream-2"
            )}
          >
            <span className={cn(
              "w-6 h-6 rounded-full flex items-center justify-center text-sm font-medium",
              step === s ? "bg-white/20" : "bg-cream-3"
            )}>
              {index + 1}
            </span>
            <span className="capitalize">{s}</span>
          </button>
        ))}
      </div>

      {/* Step 1: Setup */}
      {step === "setup" && (
        <div className="space-y-6">
          <div className="grid gap-6 lg:grid-cols-2">
            {/* Left Column - Basic Info */}
            <div className="space-y-4">
              <h2 className="text-lg font-semibold text-ink">Session Details</h2>

              {/* Team Selection */}
              <div>
                <label className="text-sm text-ink-muted mb-1.5 block">Team *</label>
                <Select value={selectedTeam} onValueChange={setSelectedTeam}>
                  <SelectTrigger className="bg-paper border-border">
                    <SelectValue placeholder="Select team" />
                  </SelectTrigger>
                  <SelectContent>
                    {teams.map((team) => (
                      <SelectItem key={team.id} value={team.id}>
                        {team.name} - {team.sport.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Title */}
              <div>
                <label className="text-sm text-ink-muted mb-1.5 block">Session Title *</label>
                <Input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="e.g., Week 3 - Dribbling Focus"
                  className="bg-paper border-border"
                />
              </div>

              {/* Date & Time */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm text-ink-muted mb-1.5 block">Date *</label>
                  <Input
                    type="date"
                    value={scheduledDate}
                    onChange={(e) => setScheduledDate(e.target.value)}
                    className="bg-paper border-border"
                  />
                </div>
                <div>
                  <label className="text-sm text-ink-muted mb-1.5 block">Time</label>
                  <Input
                    type="time"
                    value={scheduledTime}
                    onChange={(e) => setScheduledTime(e.target.value)}
                    className="bg-paper border-border"
                  />
                </div>
              </div>

              {/* Duration */}
              <div>
                <label className="text-sm text-ink-muted mb-1.5 block">Duration (minutes)</label>
                <Input
                  type="number"
                  value={durationMinutes}
                  onChange={(e) => setDurationMinutes(parseInt(e.target.value) || 60)}
                  min={15}
                  max={180}
                  className="bg-paper border-border"
                />
              </div>
            </div>

            {/* Right Column - Template Selection */}
            <div className="space-y-4">
              <h2 className="text-lg font-semibold text-ink">Start from Template</h2>
              <p className="text-sm text-ink-muted">
                Choose a template to pre-populate your session structure, or build from scratch.
              </p>

              {selectedTeam ? (
                <div className="space-y-3 max-h-[400px] overflow-y-auto pr-2">
                  {filteredTemplates.length === 0 ? (
                    <div className="text-center py-8 border border-dashed border-border rounded-xl">
                      <FileText className="w-8 h-8 text-ink-faint mx-auto mb-2" />
                      <p className="text-sm text-ink-muted">No templates available for this sport</p>
                    </div>
                  ) : (
                    filteredTemplates.map((template) => (
                      <button
                        key={template.id}
                        onClick={() => applyTemplate(template)}
                        className={cn(
                          "w-full p-4 rounded-xl border text-left transition-all",
                          selectedTemplate?.id === template.id
                            ? "bg-primary/10 border-primary/30"
                            : "bg-paper border-border hover:border-border"
                        )}
                      >
                        <div className="flex items-start justify-between gap-4">
                          <div>
                            <h4 className="font-medium text-ink mb-1">{template.name}</h4>
                            <p className="text-sm text-ink-muted line-clamp-2">{template.description}</p>
                            <div className="flex items-center gap-3 mt-2 text-xs text-ink-muted">
                              <span className="flex items-center gap-1">
                                <Clock className="w-3 h-3" />
                                {template.totalDurationMinutes} min
                              </span>
                              <Badge variant="outline" className="text-[10px]">
                                {template.stage.name}
                              </Badge>
                            </div>
                          </div>
                          {selectedTemplate?.id === template.id && (
                            <CheckCircle className="w-5 h-5 text-primary shrink-0" />
                          )}
                        </div>
                      </button>
                    ))
                  )}
                </div>
              ) : (
                <div className="text-center py-8 border border-dashed border-border rounded-xl">
                  <Target className="w-8 h-8 text-ink-faint mx-auto mb-2" />
                  <p className="text-sm text-ink-muted">Select a team to see available templates</p>
                </div>
              )}
            </div>
          </div>

          {/* Continue Button */}
          <div className="flex justify-end">
            <Button
              onClick={() => setStep("build")}
              disabled={!selectedTeam || !title || !scheduledDate}
              className="gap-2"
            >
              Continue to Build
              <ChevronRight className="w-4 h-4" />
            </Button>
          </div>
        </div>
      )}

      {/* Step 2: Build */}
      {step === "build" && (
        <div className="space-y-6">
          <div className="grid gap-6 lg:grid-cols-3">
            {/* Left - Timeline */}
            <div className="lg:col-span-2 space-y-4">
              <SessionTimeline
                segments={segments}
                onChange={setSegments}
                totalDuration={durationMinutes}
              />

              <Button
                variant="outline"
                className="w-full border-dashed"
                onClick={() => setShowActivityBrowser(true)}
              >
                <Search className="w-4 h-4 mr-2" />
                Browse Activity Library
              </Button>
            </div>

            {/* Right - Quick Add Activities */}
            <div className="space-y-4">
              <h3 className="text-sm font-medium text-ink-muted">Quick Add Activities</h3>

              {/* Search */}
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-muted" />
                <Input
                  placeholder="Search activities..."
                  value={activitySearchQuery}
                  onChange={(e) => setActivitySearchQuery(e.target.value)}
                  className="pl-9 bg-paper border-border"
                />
              </div>

              {/* Type Filter */}
              <Select value={activityTypeFilter} onValueChange={setActivityTypeFilter}>
                <SelectTrigger className="bg-paper border-border">
                  <SelectValue placeholder="All types" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Types</SelectItem>
                  <SelectItem value="warmup">Warmup</SelectItem>
                  <SelectItem value="technical">Technical</SelectItem>
                  <SelectItem value="tactical">Tactical</SelectItem>
                  <SelectItem value="game">Game</SelectItem>
                  <SelectItem value="scrimmage">Scrimmage</SelectItem>
                  <SelectItem value="conditioning">Conditioning</SelectItem>
                  <SelectItem value="cooldown">Cooldown</SelectItem>
                  <SelectItem value="fun">Fun</SelectItem>
                </SelectContent>
              </Select>

              {/* Activity List */}
              <div className="space-y-2 max-h-[500px] overflow-y-auto pr-1">
                {filteredActivities.slice(0, 10).map((activity) => (
                  <ActivityCard
                    key={activity.id}
                    activity={activity}
                    onAdd={addActivityToSession}
                    compact
                  />
                ))}

                {filteredActivities.length > 10 && (
                  <Button
                    variant="ghost"
                    className="w-full text-sm text-ink-muted"
                    onClick={() => setShowActivityBrowser(true)}
                  >
                    View all {filteredActivities.length} activities
                  </Button>
                )}

                {filteredActivities.length === 0 && (
                  <div className="text-center py-8">
                    <Target className="w-8 h-8 text-ink-faint mx-auto mb-2" />
                    <p className="text-sm text-ink-muted">No activities found</p>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Navigation */}
          <div className="flex justify-between">
            <Button variant="ghost" onClick={() => setStep("setup")}>
              Back
            </Button>
            <Button onClick={() => setStep("review")} className="gap-2">
              Review Session
              <ChevronRight className="w-4 h-4" />
            </Button>
          </div>
        </div>
      )}

      {/* Step 3: Review */}
      {step === "review" && (
        <div className="space-y-6">
          <div className="grid gap-6 lg:grid-cols-3">
            {/* Left - Session Summary */}
            <div className="lg:col-span-2 space-y-6">
              {/* Summary Card */}
              <div className="p-6 rounded-xl bg-paper border border-border">
                <h2 className="text-xl font-semibold text-ink mb-4">{title}</h2>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <span className="text-ink-muted">Team:</span>
                    <span className="text-ink ml-2">{selectedTeamData?.name}</span>
                  </div>
                  <div>
                    <span className="text-ink-muted">Sport:</span>
                    <span className="text-ink ml-2">{selectedTeamData?.sport.name}</span>
                  </div>
                  <div>
                    <span className="text-ink-muted">Date:</span>
                    <span className="text-ink ml-2">
                      {scheduledDate && new Date(scheduledDate).toLocaleDateString()}
                    </span>
                  </div>
                  <div>
                    <span className="text-ink-muted">Time:</span>
                    <span className="text-ink ml-2">{scheduledTime}</span>
                  </div>
                  <div>
                    <span className="text-ink-muted">Duration:</span>
                    <span className="text-ink ml-2">{durationMinutes} minutes</span>
                  </div>
                  {selectedTemplate && (
                    <div>
                      <span className="text-ink-muted">Template:</span>
                      <span className="text-ink ml-2">{selectedTemplate.name}</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Timeline Preview */}
              <div>
                <h3 className="text-sm font-medium text-ink-muted mb-3">Session Plan</h3>
                <SessionTimeline segments={segments} onChange={setSegments} readOnly />
              </div>
            </div>

            {/* Right - Notes & Actions */}
            <div className="space-y-4">
              {/* Pre-session Notes */}
              <div>
                <label className="text-sm text-ink-muted mb-1.5 block">Pre-Session Notes</label>
                <Textarea
                  value={preSessionNotes}
                  onChange={(e) => setPreSessionNotes(e.target.value)}
                  placeholder="Any notes to review before the session..."
                  className="min-h-[120px] bg-paper border-border"
                />
              </div>

              {/* Equipment */}
              {equipmentNeeded.length > 0 && (
                <div>
                  <label className="text-sm text-ink-muted mb-1.5 block">Equipment Needed</label>
                  <div className="flex flex-wrap gap-2">
                    {equipmentNeeded.map((item, i) => (
                      <Badge key={i} variant="outline" className="bg-paper border-border">
                        {item}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}

              {/* Error Display */}
              {error && (
                <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-sm text-red-400">
                  {error}
                </div>
              )}

              {/* Save Actions */}
              <div className="space-y-2 pt-4">
                <Button
                  onClick={() => handleSave("planned")}
                  disabled={saving}
                  className="w-full gap-2"
                >
                  {saving ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Save className="w-4 h-4" />
                  )}
                  Save Session Plan
                </Button>
                <Button
                  variant="outline"
                  onClick={() => handleSave("draft")}
                  disabled={saving}
                  className="w-full"
                >
                  Save as Draft
                </Button>
              </div>
            </div>
          </div>

          {/* Navigation */}
          <div className="flex justify-start">
            <Button variant="ghost" onClick={() => setStep("build")}>
              Back to Build
            </Button>
          </div>
        </div>
      )}

      {/* Activity Browser Dialog */}
      <Dialog open={showActivityBrowser} onOpenChange={setShowActivityBrowser}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden bg-cream border-border">
          <DialogHeader>
            <DialogTitle>Activity Library</DialogTitle>
            <DialogDescription>
              Browse and add activities to your session
            </DialogDescription>
          </DialogHeader>

          <div className="flex gap-4 mt-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-muted" />
              <Input
                placeholder="Search activities..."
                value={activitySearchQuery}
                onChange={(e) => setActivitySearchQuery(e.target.value)}
                className="pl-9 bg-paper border-border"
              />
            </div>
            <Select value={activityTypeFilter} onValueChange={setActivityTypeFilter}>
              <SelectTrigger className="w-40 bg-paper border-border">
                <SelectValue placeholder="All types" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Types</SelectItem>
                <SelectItem value="warmup">Warmup</SelectItem>
                <SelectItem value="technical">Technical</SelectItem>
                <SelectItem value="tactical">Tactical</SelectItem>
                <SelectItem value="game">Game</SelectItem>
                <SelectItem value="scrimmage">Scrimmage</SelectItem>
                <SelectItem value="conditioning">Conditioning</SelectItem>
                <SelectItem value="cooldown">Cooldown</SelectItem>
                <SelectItem value="fun">Fun</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 mt-4 max-h-[60vh] overflow-y-auto pr-2">
            {filteredActivities.map((activity) => (
              <ActivityCard
                key={activity.id}
                activity={activity}
                onAdd={(a) => {
                  addActivityToSession(a)
                }}
              />
            ))}

            {filteredActivities.length === 0 && (
              <div className="col-span-2 text-center py-12">
                <Target className="w-12 h-12 text-ink-faint mx-auto mb-3" />
                <p className="text-ink-muted">No activities found</p>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Success Modal */}
      <Dialog open={successModalOpen} onOpenChange={setSuccessModalOpen}>
        <DialogContent className="bg-cream border-border">
          <div className="text-center py-6">
            <div className="w-16 h-16 rounded-full bg-green-500/20 flex items-center justify-center mx-auto mb-4">
              <CheckCircle className="w-8 h-8 text-green-400" />
            </div>
            <DialogTitle className="text-xl mb-2">Session Created!</DialogTitle>
            <DialogDescription>
              Your practice session has been saved successfully.
            </DialogDescription>

            <div className="flex gap-3 justify-center mt-6">
              <Button
                variant="outline"
                onClick={() => {
                  setSuccessModalOpen(false)
                  // Reset form
                  setTitle("")
                  setScheduledDate("")
                  setSegments([])
                  setSelectedTemplate(null)
                  setStep("setup")
                }}
              >
                Create Another
              </Button>
              <Button
                onClick={() => {
                  window.location.href = `/coach/practices/${createdSessionId}`
                }}
              >
                View Session
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
