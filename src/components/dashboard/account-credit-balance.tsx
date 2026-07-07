"use client"

import { useEffect, useState } from "react"
import { Wallet } from "lucide-react"

/**
 * Small self-contained balance card for the family dashboard. Fetches its
 * own data (GET /api/account-credit/balance) and renders nothing when the
 * balance is 0 or the fetch fails — this is a nice-to-have surface, not
 * something worth an error state or loading skeleton for.
 *
 * children-overview.tsx is family.astro's top-level client:load component
 * and already calls useHydrationBeacon() for that page, so this
 * (client:load) component doesn't need its own.
 */
export function AccountCreditBalance() {
  const [balanceCents, setBalanceCents] = useState<number | null>(null)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const res = await fetch("/api/account-credit/balance")
        if (!res.ok) return
        const data = await res.json()
        if (!cancelled && typeof data.balanceCents === "number") {
          setBalanceCents(data.balanceCents)
        }
      } catch {
        // non-fatal — the card just doesn't render
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  if (!balanceCents || balanceCents <= 0) return null

  return (
    <div className="p-4 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-between">
      <div className="flex items-center gap-3 min-w-0">
        <div className="w-10 h-10 rounded-lg bg-primary/20 text-primary flex items-center justify-center flex-shrink-0">
          <Wallet className="w-5 h-5" />
        </div>
        <div className="min-w-0">
          <p className="font-semibold text-ink text-sm">Account credit</p>
          <p className="text-xs text-ink-faint mt-0.5">
            Ready to apply to your next registration.
          </p>
        </div>
      </div>
      <span className="text-xl font-bold text-ink flex-shrink-0">
        ${(balanceCents / 100).toFixed(2)}
      </span>
    </div>
  )
}
