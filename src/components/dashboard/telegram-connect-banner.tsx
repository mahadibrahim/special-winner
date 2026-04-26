"use client"

import { useState } from "react"
import { MessageSquare, X, ExternalLink, Loader2, Check } from "lucide-react"
import { Button } from "@/components/ui/button"

interface TelegramConnectBannerProps {
  hasLinkedTelegram: boolean
  /** ISO string of last dismissal, or null if never dismissed */
  lastDismissedAt: string | null
}

const RESHOW_AFTER_DAYS = 7

function shouldShow(hasLinkedTelegram: boolean, lastDismissedAt: string | null): boolean {
  if (hasLinkedTelegram) return false
  if (!lastDismissedAt) return true
  const dismissed = new Date(lastDismissedAt).getTime()
  const now = Date.now()
  return now - dismissed > RESHOW_AFTER_DAYS * 24 * 60 * 60 * 1000
}

/**
 * Banner prompting the parent to connect their Telegram account.
 * Shown at the top of the dashboard when they have not linked Telegram yet
 * and either have never dismissed it or dismissed it more than 7 days ago.
 * On dismiss it calls /api/dashboard/nudge/dismiss to persist the state.
 */
export function TelegramConnectBanner({
  hasLinkedTelegram,
  lastDismissedAt,
}: TelegramConnectBannerProps) {
  const [dismissed, setDismissed] = useState(false)
  const [connecting, setConnecting] = useState(false)
  const [connectSuccess, setConnectSuccess] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const visible = !dismissed && shouldShow(hasLinkedTelegram, lastDismissedAt)

  if (!visible) return null

  async function handleDismiss() {
    setDismissed(true)
    try {
      await fetch("/api/dashboard/nudge/dismiss", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nudgeKey: "telegram_connect_banner" }),
      })
    } catch {
      // fire-and-forget; local dismiss already applied
    }
  }

  async function handleConnect() {
    setConnecting(true)
    setError(null)
    try {
      const res = await fetch("/api/dashboard/settings/telegram/link", {
        method: "POST",
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "Could not generate Telegram link")
      // PostHog: parent clicked through to connect Telegram. Pair with the
      // server-side /api/telegram/webhook event that fires when they actually
      // bind to track real adoption rate.
      ;(window as unknown as { posthog?: { capture: (e: string, p?: Record<string, unknown>) => void } }).posthog?.capture(
        "telegram_link_clicked",
        { source: "dashboard_banner" },
      )
      window.open(data.url, "_blank", "noopener,noreferrer")
      setConnectSuccess(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not connect Telegram")
    } finally {
      setConnecting(false)
    }
  }

  return (
    <div className="rounded-2xl bg-sky-50 border border-sky-200 p-4">
      <div className="flex items-start gap-3">
        <div className="flex-shrink-0 mt-0.5">
          <div className="w-8 h-8 rounded-full bg-sky-100 flex items-center justify-center">
            <MessageSquare className="w-4 h-4 text-sky-700" />
          </div>
        </div>

        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-sky-900">Connect Telegram for instant team updates</h3>
          <p className="text-sm text-sky-800 mt-1">
            Get schedule changes, coach messages, and game reminders directly in Telegram.
            No app install needed beyond what you already have.
          </p>

          <div className="flex items-center gap-3 mt-3 flex-wrap">
            {connectSuccess ? (
              <div className="flex items-center gap-2 text-sm text-emerald-700">
                <Check className="w-4 h-4" />
                <span>Tap "Start" in Telegram, then come back and refresh.</span>
              </div>
            ) : (
              <Button
                variant="outline"
                size="sm"
                onClick={handleConnect}
                disabled={connecting}
                className="border-sky-300 bg-white text-sky-800 hover:bg-sky-100 hover:text-sky-900"
              >
                {connecting ? (
                  <Loader2 className="w-3 h-3 mr-2 animate-spin" />
                ) : (
                  <ExternalLink className="w-3 h-3 mr-2" />
                )}
                {connecting ? "Generating link…" : "Connect Telegram"}
              </Button>
            )}

            {error && (
              <span className="text-sm text-red-700">{error}</span>
            )}
          </div>
        </div>

        <button
          onClick={handleDismiss}
          className="flex-shrink-0 p-1 rounded-lg hover:bg-sky-100 text-sky-700 hover:text-sky-900 transition-colors"
          aria-label="Dismiss"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  )
}
