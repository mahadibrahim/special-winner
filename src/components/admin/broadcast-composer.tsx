"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Checkbox } from "@/components/ui/checkbox"
import { Label } from "@/components/ui/label"
import { toast } from "sonner"

type Props = {
  teamId: string
  teamName: string
  coachFirstName?: string
  onSent?: () => void
}

export function BroadcastComposer({ teamId, teamName, coachFirstName, onSent }: Props) {
  const [body, setBody] = useState("")
  const [isUrgent, setIsUrgent] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  const preview = coachFirstName ? `From Coach ${coachFirstName}:\n${body}` : body
  const charCount = body.length

  async function submit() {
    if (!body.trim()) return
    setSubmitting(true)
    const nonce = `compose-${teamId}-${Date.now()}-${Math.random().toString(36).slice(2)}`
    try {
      const res = await fetch("/api/admin/broadcasts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          targetType: "team_group",
          teamIds: [teamId],
          messageType: isUrgent ? "coach_urgent_override" : "team_broadcast_general",
          body,
          isUrgent,
          nonce,
        }),
      })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error ?? "Send failed")
      }
      const result = await res.json()
      toast.success(
        `Sent: ${result.telegramGroupPosts} group post, ${result.smsSent} SMS, ${result.emailSent} email${
          result.errors.length > 0 ? ` (${result.errors.length} errors)` : ""
        }`,
      )
      setBody("")
      setIsUrgent(false)
      onSent?.()
    } catch (err) {
      toast.error(String(err))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="space-y-4 rounded-lg border p-4">
      <div>
        <Label htmlFor="broadcast-body">Message to {teamName} parents</Label>
        <Textarea
          id="broadcast-body"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          maxLength={4000}
          rows={5}
          placeholder="Write your announcement…"
          disabled={submitting}
        />
        <div className="mt-1 text-xs text-gray-500">{charCount} / 4000</div>
      </div>

      <div className="flex items-center gap-2">
        <Checkbox
          id="urgent"
          checked={isUrgent}
          onCheckedChange={(v) => setIsUrgent(v === true)}
          disabled={submitting}
        />
        <Label htmlFor="urgent" className="text-sm">
          Mark as urgent (forces SMS to all parents)
        </Label>
      </div>

      {body && (
        <div className="rounded bg-gray-50 p-3 text-sm">
          <div className="mb-1 text-xs font-medium text-gray-500">Preview</div>
          <pre className="whitespace-pre-wrap font-sans">{preview}</pre>
        </div>
      )}

      <Button onClick={submit} disabled={submitting || !body.trim()}>
        {submitting ? "Sending…" : "Send announcement"}
      </Button>
    </div>
  )
}
