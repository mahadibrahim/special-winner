"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { toast } from "sonner"

type Props = {
  teamId: string
  currentStatus: string
  groupName: string
  onPromoted?: () => void
}

export function PromoteTeamGroupForm({ teamId, currentStatus, groupName, onPromoted }: Props) {
  const [chatId, setChatId] = useState("")
  const [submitting, setSubmitting] = useState(false)

  if (currentStatus === "active") {
    return (
      <div className="rounded-lg border border-green-200 bg-green-50 p-4 text-sm text-green-800">
        Team group <strong>{groupName}</strong> is already active.
      </div>
    )
  }

  async function handlePromote() {
    const trimmed = chatId.trim()
    if (!trimmed) return
    setSubmitting(true)
    try {
      const res = await fetch(`/api/admin/teams/${teamId}/group/promote`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ telegramChatId: trimmed }),
      })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error ?? "Promotion failed")
      }
      toast.success(`Group "${groupName}" promoted to active.`)
      setChatId("")
      onPromoted?.()
    } catch (err) {
      toast.error(String(err))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="space-y-4 rounded-lg border p-4">
      <div>
        <p className="mb-3 text-sm text-gray-600">
          Group <strong>{groupName}</strong> is in <code>{currentStatus}</code> state. Paste the
          Telegram chat ID below to link it and promote to active.
        </p>
        <Label htmlFor="telegram-chat-id">Telegram Chat ID</Label>
        <Input
          id="telegram-chat-id"
          value={chatId}
          onChange={(e) => setChatId(e.target.value)}
          placeholder="-1001234567890"
          disabled={submitting}
          className="mt-1"
        />
        <p className="mt-1 text-xs text-gray-500">
          Forward any message from the group to @userinfobot to get the chat ID.
        </p>
      </div>

      <Button onClick={handlePromote} disabled={submitting || !chatId.trim()}>
        {submitting ? "Promoting…" : "Promote to active"}
      </Button>
    </div>
  )
}
