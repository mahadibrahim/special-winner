"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"

type Props = {
  onComplete: () => void
  onSkip: () => void
}

export function TelegramConnectStep({ onComplete, onSkip }: Props) {
  const [submitting, setSubmitting] = useState(false)

  async function connect() {
    setSubmitting(true)
    try {
      const res = await fetch("/api/dashboard/settings/telegram/link", { method: "POST" })
      const json = await res.json()
      if (json.deepLink) {
        window.open(json.deepLink, "_blank")
        setTimeout(() => onComplete(), 1500)
      } else {
        // No deep link returned — proceed anyway
        onSkip()
      }
    } catch {
      onSkip()
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="space-y-4 text-center">
      <div>
        <h2 className="text-2xl font-semibold">Stay connected</h2>
        <p className="mt-2 text-sm text-gray-600">
          Your team uses Telegram to share reminders, schedule changes, and quick updates.
          Connect now and you'll be added to your team's group automatically.
        </p>
      </div>

      <div className="flex flex-col gap-2 max-w-xs mx-auto">
        <Button onClick={connect} disabled={submitting} size="lg">
          {submitting ? "Opening Telegram…" : "Connect Telegram"}
        </Button>
        <Button variant="ghost" onClick={onSkip} disabled={submitting} size="lg">
          Skip for now
        </Button>
      </div>

      <p className="text-xs text-gray-500 max-w-sm mx-auto">
        We'll email you updates if you skip this. You can connect anytime from your dashboard.
      </p>
    </div>
  )
}
