"use client"

import { useEffect, useState } from "react"
import { Badge } from "@/components/ui/badge"

type BroadcastRow = {
  id: string
  initiatorType: string
  targetType: string
  messageType: string
  body: string
  isUrgent: boolean
  sentAt: string | null
  createdAt: string
  deliverySummary: {
    telegramGroupPosts?: number
    smsSent?: number
    emailSent?: number
    errors?: number
  }
}

export function SentAnnouncementsList() {
  const [rows, setRows] = useState<BroadcastRow[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch("/api/admin/broadcasts?limit=50")
      .then((r) => r.json())
      .then((json) => {
        setRows(json.broadcasts ?? [])
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [])

  if (loading) return <div className="text-sm text-gray-500">Loading…</div>
  if (rows.length === 0) return <div className="text-sm text-gray-500">No broadcasts sent yet.</div>

  return (
    <div className="space-y-3">
      {rows.map((row) => (
        <div key={row.id} className="rounded-lg border p-3">
          <div className="mb-1 flex items-center gap-2 text-xs text-gray-500">
            <span>{new Date(row.sentAt ?? row.createdAt).toLocaleString()}</span>
            <Badge variant="outline">{row.initiatorType}</Badge>
            <Badge variant="outline">{row.messageType}</Badge>
            {row.isUrgent && <Badge variant="destructive">urgent</Badge>}
          </div>
          <div className="mb-2 whitespace-pre-wrap text-sm">{row.body}</div>
          <div className="text-xs text-gray-500">
            {row.deliverySummary.telegramGroupPosts ?? 0} group ·{" "}
            {row.deliverySummary.smsSent ?? 0} SMS ·{" "}
            {row.deliverySummary.emailSent ?? 0} email
            {row.deliverySummary.errors ? ` · ${row.deliverySummary.errors} errors` : ""}
          </div>
        </div>
      ))}
    </div>
  )
}
