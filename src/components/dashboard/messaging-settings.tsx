"use client"

import { useCallback, useEffect, useState } from "react"
import {
  Phone,
  Mail,
  MessageSquare,
  Check,
  Loader2,
  AlertCircle,
  ExternalLink,
  Unlink,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

/**
 * Parent-facing messaging settings panel. Lets a parent:
 *  - See which channels are available for them (verified phone, email, telegram)
 *  - Pick their primary and fallback channel
 *  - Start the Telegram connect flow (which produces a t.me deep link)
 *  - Jump to phone verification if it's not done yet
 *
 * Intended to be mounted on /dashboard/settings alongside the existing
 * NotificationSettings and ProfileSettings components.
 */

type Channel = "sms" | "email" | "telegram"

interface MessagingSettingsState {
  email: string
  phone: string | null
  phoneVerified: boolean
  primaryChannel: Channel | null
  fallbackChannel: Channel | null
  telegramConnected: boolean
  telegramUsername: string | null
}

export function MessagingSettings() {
  const [state, setState] = useState<MessagingSettingsState | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [connecting, setConnecting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  const fetchState = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch("/api/dashboard/settings/messaging")
      if (!res.ok) throw new Error(`Failed to load (${res.status})`)
      const data = await res.json()
      setState(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load settings")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchState()
  }, [fetchState])

  async function updatePrimary(channel: Channel) {
    if (!state) return
    setSaving(true)
    setError(null)
    setSuccess(null)
    try {
      const res = await fetch("/api/dashboard/settings/messaging", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ primaryChannel: channel }),
      })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || "Update failed")
      }
      setState({ ...state, primaryChannel: channel })
      setSuccess(`Primary channel set to ${channelLabel(channel)}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Update failed")
    } finally {
      setSaving(false)
    }
  }

  async function updateFallback(channel: Channel | null) {
    if (!state) return
    setSaving(true)
    setError(null)
    try {
      const res = await fetch("/api/dashboard/settings/messaging", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fallbackChannel: channel }),
      })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || "Update failed")
      }
      setState({ ...state, fallbackChannel: channel })
    } catch (err) {
      setError(err instanceof Error ? err.message : "Update failed")
    } finally {
      setSaving(false)
    }
  }

  async function connectTelegram() {
    setConnecting(true)
    setError(null)
    try {
      const res = await fetch("/api/dashboard/settings/telegram/link", {
        method: "POST",
      })
      const data = await res.json()
      if (!res.ok) {
        throw new Error(data.error || "Could not generate Telegram link")
      }
      // Open the deep link in a new window — mobile will route to the Telegram app
      window.open(data.url, "_blank", "noopener,noreferrer")
      setSuccess(
        "Tap the 'Start' button in Telegram. After that, come back here and refresh.",
      )
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not connect Telegram")
    } finally {
      setConnecting(false)
    }
  }

  if (loading) {
    return (
      <div className="p-6 rounded-2xl bg-paper border border-border flex items-center justify-center">
        <Loader2 className="w-5 h-5 animate-spin text-ink-muted" />
      </div>
    )
  }

  if (!state) {
    return (
      <div className="p-6 rounded-2xl bg-red-500/5 border border-red-500/20 text-sm text-red-300">
        Failed to load messaging settings.
        <button
          onClick={fetchState}
          className="ml-2 underline hover:text-red-200"
        >
          Retry
        </button>
      </div>
    )
  }

  const channels: Array<{
    key: Channel
    label: string
    available: boolean
    detail: string
    icon: typeof Phone
  }> = [
    {
      key: "sms",
      label: "Text message",
      available: Boolean(state.phone && state.phoneVerified),
      detail: state.phone
        ? state.phoneVerified
          ? state.phone
          : `${state.phone} (not verified)`
        : "No phone on file",
      icon: Phone,
    },
    {
      key: "email",
      label: "Email",
      available: Boolean(state.email),
      detail: state.email,
      icon: Mail,
    },
    {
      key: "telegram",
      label: "Telegram",
      available: state.telegramConnected,
      detail: state.telegramConnected
        ? state.telegramUsername
          ? `@${state.telegramUsername}`
          : "Connected"
        : "Not connected",
      icon: MessageSquare,
    },
  ]

  return (
    <div className="p-6 rounded-2xl bg-paper border border-border space-y-6">
      <header>
        <h2 className="text-lg font-semibold text-ink flex items-center gap-2">
          <MessageSquare className="w-5 h-5 text-primary" />
          Messaging preferences
        </h2>
        <p className="text-sm text-ink-muted mt-1">
          Pick how Aspire reaches you for schedule updates, reminders, and coach
          messages. You can reply on whichever channel we send to.
        </p>
      </header>

      {error && (
        <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 flex items-start gap-2 text-xs text-red-300">
          <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {success && (
        <div className="p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-start gap-2 text-xs text-emerald-300">
          <Check className="w-4 h-4 mt-0.5 flex-shrink-0" />
          <span>{success}</span>
        </div>
      )}

      {/* Primary channel selector */}
      <section>
        <h3 className="text-sm font-medium text-ink-2 mb-3">
          Primary channel
        </h3>
        <div className="space-y-2">
          {channels.map((c) => {
            const Icon = c.icon
            const isPrimary = state.primaryChannel === c.key
            return (
              <button
                key={c.key}
                disabled={!c.available || saving}
                onClick={() => updatePrimary(c.key)}
                className={cn(
                  "w-full flex items-center gap-3 p-3 rounded-xl border transition-all text-left",
                  isPrimary
                    ? "bg-primary/10 border-primary/30"
                    : c.available
                      ? "bg-paper border-border hover:border-border"
                      : "bg-cream border-border opacity-50 cursor-not-allowed",
                )}
              >
                <div
                  className={cn(
                    "w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0",
                    isPrimary ? "bg-primary/10" : "bg-paper",
                  )}
                >
                  <Icon
                    className={cn(
                      "w-5 h-5",
                      isPrimary ? "text-primary" : "text-ink-muted",
                    )}
                  />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-ink">
                    {c.label}
                  </div>
                  <div className="text-xs text-ink-muted truncate">
                    {c.detail}
                  </div>
                </div>
                {isPrimary && (
                  <div className="text-xs font-medium text-primary flex items-center gap-1">
                    <Check className="w-3 h-3" /> Primary
                  </div>
                )}
              </button>
            )
          })}
        </div>

        <div className="mt-3 flex flex-wrap gap-2">
          {!state.phoneVerified && (
            <a
              href="/dashboard/settings/verify-phone"
              className="inline-flex items-center gap-1.5 text-xs text-primary hover:text-primary"
            >
              <Phone className="w-3 h-3" />
              Verify phone to enable SMS
            </a>
          )}
          {!state.telegramConnected && (
            <button
              onClick={connectTelegram}
              disabled={connecting}
              className="inline-flex items-center gap-1.5 text-xs text-primary hover:text-primary disabled:opacity-50"
            >
              {connecting ? (
                <Loader2 className="w-3 h-3 animate-spin" />
              ) : (
                <MessageSquare className="w-3 h-3" />
              )}
              {connecting ? "Generating link..." : "Connect Telegram"}
              <ExternalLink className="w-3 h-3" />
            </button>
          )}
          {state.telegramConnected && (
            <span className="inline-flex items-center gap-1.5 text-xs text-ink-muted">
              <Check className="w-3 h-3 text-emerald-400" />
              Telegram connected (reply /stop in the bot to disconnect)
            </span>
          )}
        </div>
      </section>

      {/* Fallback channel selector */}
      <section>
        <h3 className="text-sm font-medium text-ink-2 mb-3">
          Fallback channel
        </h3>
        <p className="text-xs text-ink-muted mb-3">
          If we can't reach you on your primary channel, we'll try this one next.
          Leave it unset if you only want one channel.
        </p>
        <select
          value={state.fallbackChannel ?? ""}
          onChange={(e) => {
            const value = e.target.value as Channel | ""
            updateFallback(value || null)
          }}
          disabled={saving}
          className="w-full px-3 py-2 rounded-md bg-paper border border-border text-sm text-ink"
        >
          <option value="">No fallback</option>
          {channels
            .filter((c) => c.available && c.key !== state.primaryChannel)
            .map((c) => (
              <option key={c.key} value={c.key}>
                {c.label} — {c.detail}
              </option>
            ))}
        </select>
      </section>
    </div>
  )
}

function channelLabel(channel: Channel): string {
  if (channel === "sms") return "text message"
  if (channel === "email") return "email"
  return "Telegram"
}
