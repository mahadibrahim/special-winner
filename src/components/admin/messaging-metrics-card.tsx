"use client"

import { useState, useEffect } from "react"
import { Loader2 } from "lucide-react"

interface MessagingMetrics {
  totalParents: number
  linkedParents: number
  telegramLinkRate: number
  invitedMembers: number
  joinedMembers: number
  groupJoinRate: number
}

export function MessagingMetricsCard() {
  const [metrics, setMetrics] = useState<MessagingMetrics | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch("/api/admin/metrics/messaging")
      .then((res) => {
        if (!res.ok) throw new Error("Failed to load metrics")
        return res.json()
      })
      .then((data: MessagingMetrics) => setMetrics(data))
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load"))
      .finally(() => setLoading(false))
  }, [])

  function pct(rate: number) {
    return `${Math.round(rate * 100)}%`
  }

  return (
    <div className="rounded-lg border border-gray-200 bg-white shadow-sm">
      <div className="px-6 py-4 border-b border-gray-200">
        <h2 className="text-lg font-semibold text-gray-900">Messaging Adoption</h2>
        <p className="text-sm text-gray-500 mt-0.5">Telegram link rate and group join rate</p>
      </div>

      <div className="px-6 py-5">
        {loading && (
          <div className="flex items-center gap-2 text-gray-500 text-sm">
            <Loader2 className="w-4 h-4 animate-spin" />
            Loading metrics…
          </div>
        )}

        {error && (
          <p className="text-sm text-red-600">{error}</p>
        )}

        {metrics && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            {/* Telegram Link Rate */}
            <div>
              <p className="text-sm font-medium text-gray-600 mb-1">Telegram Link Rate</p>
              <p className="text-4xl font-bold text-gray-900">{pct(metrics.telegramLinkRate)}</p>
              <p className="text-xs text-gray-500 mt-1">
                {metrics.linkedParents} of {metrics.totalParents} parents linked
              </p>
              <div className="mt-3 w-full bg-gray-100 rounded-full h-2">
                <div
                  className="bg-blue-500 h-2 rounded-full transition-all"
                  style={{ width: pct(metrics.telegramLinkRate) }}
                />
              </div>
            </div>

            {/* Group Join Rate */}
            <div>
              <p className="text-sm font-medium text-gray-600 mb-1">Group Join Rate</p>
              <p className="text-4xl font-bold text-gray-900">{pct(metrics.groupJoinRate)}</p>
              <p className="text-xs text-gray-500 mt-1">
                {metrics.joinedMembers} of {metrics.invitedMembers} members joined
              </p>
              <div className="mt-3 w-full bg-gray-100 rounded-full h-2">
                <div
                  className="bg-emerald-500 h-2 rounded-full transition-all"
                  style={{ width: pct(metrics.groupJoinRate) }}
                />
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
