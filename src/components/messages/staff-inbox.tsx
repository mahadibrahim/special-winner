"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import {
  MessageSquare,
  Phone,
  Mail,
  Send,
  User,
  AlertCircle,
  Bot,
  Archive,
  Loader2,
  RefreshCw,
  Users,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { EmptyState } from "@/components/ui/empty-state"
import { ErrorBanner } from "@/components/ui/error-banner"
import { cn } from "@/lib/utils"

interface ConversationSummary {
  id: string
  parentName: string
  parentUserId: string
  parentEmail: string
  parentPhone: string | null
  assignmentRole: "bot" | "coach" | "admin" | null
  assignedStaffId: string | null
  lastMessageAt: string
  snippet: string
  lastChannel: "sms" | "email" | "telegram" | "web" | null
  lastDirection: "inbound" | "outbound" | null
  unreadInbound: boolean
}

interface Message {
  id: string
  direction: "inbound" | "outbound"
  channel: "sms" | "email" | "telegram" | "web"
  senderType: "parent" | "bot" | "coach" | "admin" | "system"
  body: string
  intentClassification: {
    intent?: string
    confidence?: number
    reasoning?: string
  } | null
  createdAt: string
  deliveredAt: string | null
}

interface ParentProfile {
  id: string
  name: string
  email: string
  phone: string | null
  phoneVerified: boolean
  primaryChannel: string | null
  fallbackChannel: string | null
}

interface KidSummary {
  id: string
  name: string
  age: number | null
}

interface ConversationDetail {
  conversation: {
    id: string
    status: string
    assignmentRole: string | null
    assignedStaffId: string | null
    pendingConfirmation: {
      actionName: string
      confirmationBody: string
    } | null
    lastMessageAt: string
    createdAt: string
  }
  parent: ParentProfile | null
  kids: KidSummary[]
  messages: Message[]
  botActions: Array<{
    id: string
    actionType: string
    success: boolean
    reversible: boolean
    reversedAt: string | null
    createdAt: string
    errorMessage: string | null
  }>
}

type FilterMode = "mine" | "unassigned" | "all"
type AssignmentFilter = "" | "bot" | "coach" | "admin"

interface StaffInboxProps {
  currentUserId: string
  isAdmin: boolean
}

export function StaffInbox({ currentUserId, isAdmin }: StaffInboxProps) {
  const [conversations, setConversations] = useState<ConversationSummary[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [detail, setDetail] = useState<ConversationDetail | null>(null)
  const [loadingList, setLoadingList] = useState(true)
  const [loadingDetail, setLoadingDetail] = useState(false)
  const [filterMode, setFilterMode] = useState<FilterMode>("all")
  const [assignmentFilter, setAssignmentFilter] = useState<AssignmentFilter>("")
  const [replyBody, setReplyBody] = useState("")
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetchConversations = useCallback(async () => {
    setLoadingList(true)
    setError(null)
    try {
      const params = new URLSearchParams({ filter: filterMode })
      if (assignmentFilter) params.set("assignment", assignmentFilter)

      const res = await fetch(`/api/messaging/conversations?${params}`)
      if (!res.ok) throw new Error(`Failed to load conversations (${res.status})`)
      const data = await res.json()
      setConversations(data.conversations || [])
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load conversations")
    } finally {
      setLoadingList(false)
    }
  }, [filterMode, assignmentFilter])

  const fetchDetail = useCallback(async (conversationId: string) => {
    setLoadingDetail(true)
    setError(null)
    try {
      const res = await fetch(`/api/messaging/conversations/${conversationId}`)
      if (!res.ok) throw new Error(`Failed to load conversation (${res.status})`)
      const data = await res.json()
      setDetail(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load conversation")
    } finally {
      setLoadingDetail(false)
    }
  }, [])

  useEffect(() => {
    fetchConversations()
  }, [fetchConversations])

  useEffect(() => {
    if (selectedId) {
      fetchDetail(selectedId)
    } else {
      setDetail(null)
    }
  }, [selectedId, fetchDetail])

  // Poll every 10 seconds for new messages while a conversation is open
  useEffect(() => {
    if (!selectedId) return
    const interval = setInterval(() => {
      fetchDetail(selectedId)
    }, 10_000)
    return () => clearInterval(interval)
  }, [selectedId, fetchDetail])

  // Poll the list every 20 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      fetchConversations()
    }, 20_000)
    return () => clearInterval(interval)
  }, [fetchConversations])

  const handleSendReply = useCallback(async () => {
    if (!selectedId || !replyBody.trim()) return
    setSending(true)
    setError(null)
    try {
      const res = await fetch(
        `/api/messaging/conversations/${selectedId}/reply`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ body: replyBody.trim() }),
        },
      )
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || `Send failed (${res.status})`)
      }
      setReplyBody("")
      await fetchDetail(selectedId)
      await fetchConversations()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to send reply")
    } finally {
      setSending(false)
    }
  }, [selectedId, replyBody, fetchDetail, fetchConversations])

  const handleArchive = useCallback(async () => {
    if (!selectedId) return
    if (!confirm("Archive this conversation? It won't appear in the default inbox.")) return
    try {
      await fetch(`/api/messaging/conversations/${selectedId}/archive`, {
        method: "POST",
      })
      setSelectedId(null)
      await fetchConversations()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Archive failed")
    }
  }, [selectedId, fetchConversations])

  const handleReassign = useCallback(
    async (role: "admin" | "coach" | "bot", staffId: string | null) => {
      if (!selectedId) return
      try {
        await fetch(`/api/messaging/conversations/${selectedId}/assign`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ role, staffId }),
        })
        await fetchDetail(selectedId)
        await fetchConversations()
      } catch (err) {
        setError(err instanceof Error ? err.message : "Reassign failed")
      }
    },
    [selectedId, fetchDetail, fetchConversations],
  )

  const handleReverseBotAction = useCallback(
    async (actionId: string) => {
      if (!confirm("Reverse this bot action?")) return
      try {
        const res = await fetch(
          `/api/messaging/bot-actions/${actionId}/reverse`,
          { method: "POST" },
        )
        if (!res.ok) {
          const data = await res.json().catch(() => ({}))
          throw new Error(data.error || "Reversal failed")
        }
        if (selectedId) await fetchDetail(selectedId)
      } catch (err) {
        setError(err instanceof Error ? err.message : "Reversal failed")
      }
    },
    [selectedId, fetchDetail],
  )

  const sortedMessages = useMemo(
    () => detail?.messages ?? [],
    [detail?.messages],
  )

  return (
    <div className="h-[calc(100vh-12rem)] min-h-[480px] flex gap-4">
      {/* Left pane — conversation list */}
      <aside className="w-[340px] flex-shrink-0 flex flex-col rounded-2xl bg-white border border-border overflow-hidden">
        <div className="p-4 border-b border-border">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-lg font-semibold text-ink flex items-center gap-2">
              <MessageSquare className="w-5 h-5 text-navy" />
              Messages
            </h2>
            <Button
              variant="ghost"
              size="sm"
              onClick={fetchConversations}
              className="h-8 w-8 p-0 text-ink-faint hover:text-ink"
              title="Refresh"
            >
              <RefreshCw className={cn("w-4 h-4", loadingList && "animate-spin")} />
            </Button>
          </div>

          <div className="flex gap-1 text-xs">
            {(["all", "mine", "unassigned"] as FilterMode[]).map((mode) => (
              <button
                key={mode}
                onClick={() => setFilterMode(mode)}
                className={cn(
                  "px-3 py-1.5 rounded-md transition-colors",
                  filterMode === mode
                    ? "bg-navy text-cream"
                    : "text-ink-muted hover:text-ink hover:bg-cream-2",
                )}
              >
                {mode === "all" ? "All" : mode === "mine" ? "Mine" : "Unassigned"}
              </button>
            ))}
          </div>

          <select
            value={assignmentFilter}
            onChange={(e) => setAssignmentFilter(e.target.value as AssignmentFilter)}
            className="mt-2 w-full px-2 py-1.5 rounded-md bg-white border border-border text-xs text-ink focus:outline-none focus:border-navy/50"
          >
            <option value="">All roles</option>
            <option value="bot">Bot-handled</option>
            <option value="coach">Routed to coach</option>
            <option value="admin">Routed to admin</option>
          </select>
        </div>

        <div className="flex-1 overflow-y-auto">
          {loadingList && conversations.length === 0 ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-5 h-5 animate-spin text-ink-faint" />
            </div>
          ) : conversations.length === 0 ? (
            <EmptyState
              title="No conversations"
              description="Nothing matches this filter yet. Parent messages that need a human land here."
              icon={<MessageSquare className="w-8 h-8" />}
            />
          ) : (
            <ul>
              {conversations.map((conv) => (
                <li key={conv.id}>
                  <button
                    onClick={() => setSelectedId(conv.id)}
                    className={cn(
                      "w-full text-left p-4 border-b border-border/60 hover:bg-cream transition-colors relative",
                      selectedId === conv.id && "bg-navy/5 border-l-2 border-l-navy",
                    )}
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="font-medium text-ink text-sm truncate flex-1">
                        {conv.parentName}
                      </h3>
                      {conv.unreadInbound && (
                        <span className="w-2 h-2 rounded-full bg-blue-500 flex-shrink-0" />
                      )}
                      <ChannelIcon channel={conv.lastChannel} />
                    </div>
                    <p className="text-xs text-ink-muted truncate">
                      {conv.lastDirection === "outbound" && (
                        <span className="text-ink-faint">You: </span>
                      )}
                      {conv.snippet || <em>No messages yet</em>}
                    </p>
                    <div className="flex items-center gap-2 mt-2 text-[10px] text-ink-faint">
                      <AssignmentBadge role={conv.assignmentRole} />
                      <span>{formatRelativeTime(conv.lastMessageAt)}</span>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </aside>

      {/* Middle pane — conversation thread */}
      <section className="flex-1 flex flex-col rounded-2xl bg-white border border-border overflow-hidden min-w-0">
        {!selectedId ? (
          <div className="flex-1 flex items-center justify-center">
            <EmptyState
              title="No conversation selected"
              description="Select a conversation from the list to view the thread."
              icon={<MessageSquare className="w-12 h-12" />}
            />
          </div>
        ) : loadingDetail && !detail ? (
          <div className="flex-1 flex items-center justify-center">
            <Loader2 className="w-6 h-6 animate-spin text-ink-faint" />
          </div>
        ) : detail ? (
          <>
            {/* Header */}
            <header className="p-4 border-b border-border flex items-center justify-between">
              <div>
                <h2 className="font-semibold text-ink">{detail.parent?.name || "Unknown parent"}</h2>
                <p className="text-xs text-ink-muted flex items-center gap-3 mt-1">
                  {detail.parent?.phone && (
                    <span className="flex items-center gap-1">
                      <Phone className="w-3 h-3" /> {detail.parent.phone}
                    </span>
                  )}
                  {detail.parent?.email && (
                    <span className="flex items-center gap-1">
                      <Mail className="w-3 h-3" /> {detail.parent.email}
                    </span>
                  )}
                </p>
              </div>
              <div className="flex items-center gap-2">
                {isAdmin && (
                  <select
                    value={detail.conversation.assignmentRole || "bot"}
                    onChange={(e) =>
                      handleReassign(
                        e.target.value as "admin" | "coach" | "bot",
                        detail.conversation.assignedStaffId,
                      )
                    }
                    className="text-xs px-2 py-1.5 rounded-md bg-white border border-border text-ink focus:outline-none focus:border-navy/50"
                  >
                    <option value="bot">Bot-handled</option>
                    <option value="coach">Coach</option>
                    <option value="admin">Admin</option>
                  </select>
                )}
                <Button
                  onClick={handleArchive}
                  variant="ghost"
                  size="sm"
                  className="h-8 text-ink-faint hover:text-ink"
                  title="Archive"
                >
                  <Archive className="w-4 h-4" />
                </Button>
              </div>
            </header>

            {/* Pending confirmation banner */}
            {detail.conversation.pendingConfirmation && (
              <div className="p-3 bg-amber-50 border-b border-amber-200 text-xs text-amber-800 flex items-center gap-2">
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                <span>
                  Awaiting parent confirmation: <strong>{detail.conversation.pendingConfirmation.actionName}</strong> —
                  &ldquo;{detail.conversation.pendingConfirmation.confirmationBody}&rdquo;
                </span>
              </div>
            )}

            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-6 space-y-4">
              {sortedMessages.map((msg) => (
                <MessageBubble key={msg.id} message={msg} />
              ))}
            </div>

            {/* Bot actions log */}
            {detail.botActions.length > 0 && isAdmin && (
              <div className="px-4 py-2 border-t border-border text-xs">
                <details className="text-ink-muted">
                  <summary className="cursor-pointer hover:text-ink select-none">
                    Bot actions ({detail.botActions.length})
                  </summary>
                  <ul className="mt-2 space-y-1">
                    {detail.botActions.map((a) => (
                      <li key={a.id} className="flex items-center gap-2">
                        <Bot className="w-3 h-3" />
                        <span className={a.success ? "text-ink" : "text-red-600"}>
                          {a.actionType}
                        </span>
                        {a.reversedAt ? (
                          <span className="text-ink-faint">(reversed)</span>
                        ) : a.reversible ? (
                          <button
                            onClick={() => handleReverseBotAction(a.id)}
                            className="text-navy hover:text-navy/80 underline text-[10px]"
                          >
                            Reverse
                          </button>
                        ) : null}
                        <span className="text-ink-faint ml-auto">
                          {formatRelativeTime(a.createdAt)}
                        </span>
                      </li>
                    ))}
                  </ul>
                </details>
              </div>
            )}

            {/* Reply composer */}
            <div className="p-4 border-t border-border">
              <ErrorBanner message={error} className="mb-2" />
              <div className="flex gap-2">
                <textarea
                  value={replyBody}
                  onChange={(e) => setReplyBody(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                      handleSendReply()
                    }
                  }}
                  placeholder={`Reply to ${detail.parent?.name || "parent"}... (⌘↵ to send)`}
                  rows={2}
                  className="flex-1 px-3 py-2 rounded-lg bg-white border border-border text-sm text-ink placeholder:text-ink-faint focus:outline-none focus:border-navy/50 resize-none"
                />
                <Button
                  onClick={handleSendReply}
                  disabled={sending || !replyBody.trim()}
                  className="self-end"
                >
                  {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                </Button>
              </div>
              <p className="mt-1.5 text-[10px] text-ink-faint">
                Reply will be delivered via{" "}
                <strong className="text-ink-muted">
                  {detail.parent?.primaryChannel || (detail.parent?.phone ? "sms" : "email")}
                </strong>
                {detail.parent?.primaryChannel === "sms" && " (keep under 160 chars when possible)"}
              </p>
            </div>
          </>
        ) : null}
      </section>

      {/* Right pane — parent context */}
      <aside className="w-[260px] flex-shrink-0 hidden xl:flex flex-col rounded-2xl bg-white border border-border overflow-hidden">
        <div className="p-4 border-b border-border">
          <h3 className="text-sm font-semibold text-ink flex items-center gap-2">
            <User className="w-4 h-4 text-navy" />
            Parent context
          </h3>
        </div>
        <div className="flex-1 overflow-y-auto p-4 text-xs space-y-4">
          {detail?.parent ? (
            <>
              <div>
                <p className="text-ink-faint mb-1">Contact</p>
                <p className="text-ink">{detail.parent.name}</p>
                {detail.parent.phone && (
                  <p className="text-ink-muted">{detail.parent.phone}{detail.parent.phoneVerified && " ✓"}</p>
                )}
                <p className="text-ink-muted">{detail.parent.email}</p>
              </div>
              <div>
                <p className="text-ink-faint mb-1">Preferred channel</p>
                <p className="text-ink capitalize">
                  {detail.parent.primaryChannel || "not set"}
                  {detail.parent.fallbackChannel && (
                    <span className="text-ink-faint"> → {detail.parent.fallbackChannel}</span>
                  )}
                </p>
              </div>
              <div>
                <p className="text-ink-faint mb-1 flex items-center gap-1">
                  <Users className="w-3 h-3" /> Kids ({detail.kids.length})
                </p>
                {detail.kids.length === 0 ? (
                  <p className="text-ink-faint italic">None on file</p>
                ) : (
                  <ul className="space-y-1">
                    {detail.kids.map((k) => (
                      <li key={k.id} className="text-ink">
                        {k.name}
                        {k.age !== null && <span className="text-ink-faint"> · {k.age}y</span>}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </>
          ) : (
            <p className="text-ink-muted">Select a conversation to see context.</p>
          )}
        </div>
      </aside>
    </div>
  )
}

// ------------------------------------------------------------
// Subcomponents
// ------------------------------------------------------------

function MessageBubble({ message }: { message: Message }) {
  const isInbound = message.direction === "inbound"
  const isBot = message.senderType === "bot"
  const isStaff = message.senderType === "admin" || message.senderType === "coach"

  return (
    <div className={cn("flex", isInbound ? "justify-start" : "justify-end")}>
      <div
        className={cn(
          "max-w-[75%] rounded-2xl px-4 py-2.5 text-sm",
          isInbound
            ? "bg-cream-2 text-ink rounded-bl-sm"
            : isBot
              ? "bg-blue-50 text-blue-900 border border-blue-200 italic rounded-br-sm"
              : "bg-navy text-cream rounded-br-sm",
        )}
      >
        <div className="flex items-center gap-1.5 mb-1 text-[10px] opacity-70">
          {isBot && <Bot className="w-3 h-3" />}
          <span className="capitalize">{message.senderType}</span>
          <ChannelIcon channel={message.channel} small />
          <span className="ml-auto">{formatRelativeTime(message.createdAt)}</span>
        </div>
        <div className="whitespace-pre-wrap break-words">{message.body}</div>
        {message.intentClassification?.intent && (
          <div className="mt-1.5 text-[9px] opacity-50">
            {message.intentClassification.intent} ({Math.round((message.intentClassification.confidence || 0) * 100)}%)
          </div>
        )}
      </div>
    </div>
  )
}

function ChannelIcon({
  channel,
  small = false,
}: {
  channel: string | null
  small?: boolean
}) {
  const size = small ? "w-3 h-3" : "w-3.5 h-3.5"
  if (channel === "sms") return <Phone className={cn(size, "text-current opacity-60")} />
  if (channel === "email") return <Mail className={cn(size, "text-current opacity-60")} />
  if (channel === "telegram") return <MessageSquare className={cn(size, "text-current opacity-60")} />
  return null
}

function AssignmentBadge({ role }: { role: string | null }) {
  if (!role || role === "bot") {
    return (
      <span className="px-1.5 py-0.5 rounded bg-blue-100 text-blue-700 uppercase">
        Bot
      </span>
    )
  }
  if (role === "coach") {
    return (
      <span className="px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-700 uppercase">
        Coach
      </span>
    )
  }
  return (
    <span className="px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 uppercase">
      Admin
    </span>
  )
}

function formatRelativeTime(isoString: string): string {
  const then = new Date(isoString).getTime()
  const now = Date.now()
  const diff = now - then
  const minutes = Math.floor(diff / 60_000)

  if (minutes < 1) return "now"
  if (minutes < 60) return `${minutes}m`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h`
  const days = Math.floor(hours / 24)
  if (days < 7) return `${days}d`
  return new Date(isoString).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  })
}
