"use client"

import { useState } from "react"
import { cn } from "@/lib/utils"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import {
  Clock,
  GripVertical,
  Trash2,
  Edit3,
  Check,
  X,
  Plus,
  Target,
  Zap,
  Lightbulb,
  Gamepad2,
  Swords,
  Dumbbell,
  Snowflake,
  Smile,
} from "lucide-react"

export interface SessionSegment {
  order: number
  name: string
  type: string
  durationMinutes: number
  activityId?: string
  activityName?: string
  notes?: string
}

interface SessionTimelineProps {
  segments: SessionSegment[]
  onChange: (segments: SessionSegment[]) => void
  readOnly?: boolean
  totalDuration?: number
  className?: string
}

const TYPE_CONFIG: Record<string, { icon: typeof Target; color: string; bg: string; label: string }> = {
  warmup: { icon: Zap, color: "text-orange-400", bg: "bg-orange-500/20", label: "Warmup" },
  technical: { icon: Target, color: "text-primary", bg: "bg-primary/10", label: "Technical" },
  tactical: { icon: Lightbulb, color: "text-purple-400", bg: "bg-purple-500/20", label: "Tactical" },
  game: { icon: Gamepad2, color: "text-green-400", bg: "bg-green-500/20", label: "Game" },
  scrimmage: { icon: Swords, color: "text-red-400", bg: "bg-red-500/20", label: "Scrimmage" },
  conditioning: { icon: Dumbbell, color: "text-amber-400", bg: "bg-amber-500/20", label: "Conditioning" },
  cooldown: { icon: Snowflake, color: "text-cyan-400", bg: "bg-cyan-500/20", label: "Cooldown" },
  fun: { icon: Smile, color: "text-pink-400", bg: "bg-pink-500/20", label: "Fun" },
}

function formatTime(minutes: number): string {
  const hrs = Math.floor(minutes / 60)
  const mins = minutes % 60
  if (hrs > 0) {
    return `${hrs}h ${mins}m`
  }
  return `${mins}m`
}

function SegmentRow({
  segment,
  startTime,
  onUpdate,
  onDelete,
  readOnly,
}: {
  segment: SessionSegment
  startTime: number
  onUpdate: (segment: SessionSegment) => void
  onDelete: () => void
  readOnly?: boolean
}) {
  const [isEditing, setIsEditing] = useState(false)
  const [editedSegment, setEditedSegment] = useState(segment)

  const typeConfig = TYPE_CONFIG[segment.type] || TYPE_CONFIG.technical
  const TypeIcon = typeConfig.icon
  const endTime = startTime + segment.durationMinutes

  const handleSave = () => {
    onUpdate(editedSegment)
    setIsEditing(false)
  }

  const handleCancel = () => {
    setEditedSegment(segment)
    setIsEditing(false)
  }

  if (isEditing) {
    return (
      <div className="p-4 rounded-xl border bg-cream-2 border-primary/30">
        <div className="space-y-3">
          <div className="flex items-center gap-3">
            <Input
              value={editedSegment.name}
              onChange={(e) => setEditedSegment({ ...editedSegment, name: e.target.value })}
              placeholder="Segment name"
              className="flex-1 h-9 bg-paper border-border"
            />
            <Input
              type="number"
              value={editedSegment.durationMinutes}
              onChange={(e) => setEditedSegment({ ...editedSegment, durationMinutes: parseInt(e.target.value) || 0 })}
              className="w-20 h-9 bg-paper border-border"
              min={1}
              max={60}
            />
            <span className="text-xs text-ink-muted">min</span>
          </div>

          <Textarea
            value={editedSegment.notes || ""}
            onChange={(e) => setEditedSegment({ ...editedSegment, notes: e.target.value })}
            placeholder="Notes for this segment..."
            className="min-h-[60px] bg-paper border-border"
          />

          <div className="flex items-center justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={handleCancel}>
              <X className="w-4 h-4 mr-1" />
              Cancel
            </Button>
            <Button size="sm" onClick={handleSave}>
              <Check className="w-4 h-4 mr-1" />
              Save
            </Button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="group relative">
      {/* Timeline connector */}
      <div className="absolute left-6 top-12 bottom-0 w-0.5 bg-gradient-to-b from-ink-faint/20 to-transparent group-last:hidden" />

      <div className={cn(
        "relative p-4 rounded-xl border transition-all",
        "bg-paper border-border",
        !readOnly && "hover:border-border"
      )}>
        {/* Timeline dot */}
        <div
          className={cn(
            "absolute left-6 top-6 w-3 h-3 rounded-full border-2 z-10",
            typeConfig.bg
          )}
          style={{ borderColor: "var(--background)" }}
        />

        <div className="pl-8">
          <div className="flex items-start gap-4">
            {/* Drag handle */}
            {!readOnly && (
              <div className="opacity-0 group-hover:opacity-100 transition-opacity cursor-grab">
                <GripVertical className="w-4 h-4 text-ink-muted" />
              </div>
            )}

            {/* Type icon */}
            <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center shrink-0", typeConfig.bg)}>
              <TypeIcon className={cn("w-5 h-5", typeConfig.color)} />
            </div>

            {/* Content */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <h4 className="font-medium text-ink">{segment.name}</h4>
                {segment.activityName && (
                  <Badge variant="outline" className="text-[10px] bg-paper border-border">
                    {segment.activityName}
                  </Badge>
                )}
              </div>

              <div className="flex items-center gap-3 text-xs text-ink-muted">
                <span className="flex items-center gap-1">
                  <Clock className="w-3 h-3" />
                  {formatTime(startTime)} - {formatTime(endTime)}
                </span>
                <span>({segment.durationMinutes} min)</span>
                <Badge variant="outline" className={cn("text-[10px]", typeConfig.color)} style={{ borderColor: `currentColor` }}>
                  {typeConfig.label}
                </Badge>
              </div>

              {segment.notes && (
                <p className="text-sm text-ink-muted mt-2 line-clamp-2">{segment.notes}</p>
              )}
            </div>

            {/* Actions */}
            {!readOnly && (
              <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 w-8 p-0 text-ink-muted hover:text-ink"
                  onClick={() => setIsEditing(true)}
                >
                  <Edit3 className="w-4 h-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 w-8 p-0 text-ink-muted hover:text-red-400"
                  onClick={onDelete}
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

export default function SessionTimeline({
  segments,
  onChange,
  readOnly = false,
  totalDuration,
  className,
}: SessionTimelineProps) {
  const [showAddForm, setShowAddForm] = useState(false)
  const [newSegment, setNewSegment] = useState<Partial<SessionSegment>>({
    name: "",
    type: "technical",
    durationMinutes: 10,
    notes: "",
  })

  // Calculate cumulative times
  const segmentTimes = segments.reduce((acc, segment, index) => {
    const prevTime = index === 0 ? 0 : acc[index - 1].endTime
    acc.push({
      startTime: prevTime,
      endTime: prevTime + segment.durationMinutes,
    })
    return acc
  }, [] as { startTime: number; endTime: number }[])

  const currentTotalDuration = segments.reduce((sum, s) => sum + s.durationMinutes, 0)

  const handleUpdateSegment = (index: number, updatedSegment: SessionSegment) => {
    const newSegments = [...segments]
    newSegments[index] = updatedSegment
    onChange(newSegments)
  }

  const handleDeleteSegment = (index: number) => {
    const newSegments = segments.filter((_, i) => i !== index)
    // Reorder
    onChange(newSegments.map((s, i) => ({ ...s, order: i })))
  }

  const handleAddSegment = () => {
    if (!newSegment.name || !newSegment.type || !newSegment.durationMinutes) return

    const segment: SessionSegment = {
      order: segments.length,
      name: newSegment.name,
      type: newSegment.type,
      durationMinutes: newSegment.durationMinutes,
      notes: newSegment.notes || undefined,
    }

    onChange([...segments, segment])
    setNewSegment({ name: "", type: "technical", durationMinutes: 10, notes: "" })
    setShowAddForm(false)
  }

  return (
    <div className={cn("space-y-4", className)}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h3 className="text-sm font-medium text-ink-muted">Session Timeline</h3>
          <Badge variant="outline" className="bg-paper border-border">
            {segments.length} segments
          </Badge>
        </div>
        <div className="flex items-center gap-2 text-sm">
          <Clock className="w-4 h-4 text-ink-muted" />
          <span className={cn(
            "font-medium",
            totalDuration && currentTotalDuration > totalDuration ? "text-red-400" : "text-ink"
          )}>
            {formatTime(currentTotalDuration)}
          </span>
          {totalDuration && (
            <span className="text-ink-muted">/ {formatTime(totalDuration)}</span>
          )}
        </div>
      </div>

      {/* Timeline */}
      {segments.length === 0 ? (
        <div className="text-center py-8 border border-dashed border-border rounded-xl">
          <Clock className="w-8 h-8 text-ink-faint mx-auto mb-2" />
          <p className="text-sm text-ink-muted">No segments yet</p>
          <p className="text-xs text-ink-faint mt-1">Add segments to build your session</p>
        </div>
      ) : (
        <div className="space-y-2">
          {segments.map((segment, index) => (
            <SegmentRow
              key={`${segment.order}-${index}`}
              segment={segment}
              startTime={segmentTimes[index]?.startTime || 0}
              onUpdate={(updated) => handleUpdateSegment(index, updated)}
              onDelete={() => handleDeleteSegment(index)}
              readOnly={readOnly}
            />
          ))}
        </div>
      )}

      {/* Add segment form */}
      {!readOnly && (
        <>
          {showAddForm ? (
            <div className="p-4 rounded-xl border bg-paper border-border">
              <h4 className="text-sm font-medium text-ink mb-3">Add Segment</h4>
              <div className="space-y-3">
                <div className="flex items-center gap-3">
                  <Input
                    value={newSegment.name}
                    onChange={(e) => setNewSegment({ ...newSegment, name: e.target.value })}
                    placeholder="Segment name (e.g., Warmup, Technical Focus)"
                    className="flex-1 h-9 bg-paper border-border"
                  />
                  <select
                    value={newSegment.type}
                    onChange={(e) => setNewSegment({ ...newSegment, type: e.target.value })}
                    className="h-9 px-3 rounded-md bg-paper border border-border text-sm text-ink"
                  >
                    {Object.entries(TYPE_CONFIG).map(([key, config]) => (
                      <option key={key} value={key}>{config.label}</option>
                    ))}
                  </select>
                  <Input
                    type="number"
                    value={newSegment.durationMinutes}
                    onChange={(e) => setNewSegment({ ...newSegment, durationMinutes: parseInt(e.target.value) || 0 })}
                    className="w-20 h-9 bg-paper border-border"
                    min={1}
                    max={60}
                  />
                  <span className="text-xs text-ink-muted">min</span>
                </div>

                <Textarea
                  value={newSegment.notes || ""}
                  onChange={(e) => setNewSegment({ ...newSegment, notes: e.target.value })}
                  placeholder="Notes (optional)"
                  className="min-h-[60px] bg-paper border-border"
                />

                <div className="flex items-center justify-end gap-2">
                  <Button variant="ghost" size="sm" onClick={() => setShowAddForm(false)}>
                    Cancel
                  </Button>
                  <Button size="sm" onClick={handleAddSegment} disabled={!newSegment.name}>
                    <Plus className="w-4 h-4 mr-1" />
                    Add Segment
                  </Button>
                </div>
              </div>
            </div>
          ) : (
            <Button
              variant="outline"
              className="w-full border-dashed border-border hover:border-ink-faint/20 hover:bg-paper"
              onClick={() => setShowAddForm(true)}
            >
              <Plus className="w-4 h-4 mr-2" />
              Add Segment
            </Button>
          )}
        </>
      )}
    </div>
  )
}
