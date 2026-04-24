"use client"

import { useEffect, useState } from "react"
import { CheckCircle2, Loader2, X } from "lucide-react"

interface RegistrationSummary {
  id: string
  paymentStatus: string
  familyMember: { firstName: string; lastName: string }
  program: { name: string }
  season: { name: string }
}

interface PaymentSuccessBannerProps {
  registrationId: string
}

const MAX_POLLS = 7
const POLL_INTERVAL_MS = 2000

function stripQueryParams() {
  if (typeof window === "undefined") return
  const url = new URL(window.location.href)
  url.searchParams.delete("payment")
  url.searchParams.delete("registration")
  window.history.replaceState({}, "", url.toString())
}

export function PaymentSuccessBanner({ registrationId }: PaymentSuccessBannerProps) {
  const [dismissed, setDismissed] = useState(false)
  const [registration, setRegistration] = useState<RegistrationSummary | null>(null)
  const [state, setState] = useState<"polling" | "confirmed" | "pending">("polling")

  useEffect(() => {
    let attempts = 0
    let cancelled = false

    async function poll() {
      if (cancelled) return
      attempts += 1
      try {
        const res = await fetch("/api/registrations")
        if (res.ok) {
          const data = await res.json()
          const hit = (data.registrations ?? []).find(
            (r: RegistrationSummary) => r.id === registrationId
          )
          if (hit) {
            setRegistration(hit)
            if (hit.paymentStatus === "paid" || hit.paymentStatus === "deposit_paid") {
              setState("confirmed")
              return
            }
          }
        }
      } catch {
        // swallow — we'll retry
      }

      if (attempts >= MAX_POLLS) {
        setState("pending")
        return
      }
      setTimeout(poll, POLL_INTERVAL_MS)
    }

    poll()

    return () => {
      cancelled = true
    }
  }, [registrationId])

  if (dismissed) return null

  function handleDismiss() {
    stripQueryParams()
    setDismissed(true)
  }

  const playerName = registration
    ? `${registration.familyMember.firstName} ${registration.familyMember.lastName}`
    : null
  const programLabel = registration
    ? `${registration.program.name} — ${registration.season.name}`
    : null

  const baseClasses =
    "relative flex items-start gap-3 rounded-xl border px-4 py-3 mb-6"

  if (state === "confirmed") {
    return (
      <div
        className={`${baseClasses} border-emerald-300 bg-emerald-50 text-emerald-900`}
        role="status"
      >
        <CheckCircle2 className="mt-0.5 h-5 w-5 flex-shrink-0" aria-hidden />
        <div className="flex-1">
          <div className="font-medium">Payment confirmed.</div>
          {playerName && programLabel && (
            <div className="text-sm opacity-90">
              {playerName} is registered for {programLabel}.
            </div>
          )}
        </div>
        <button
          type="button"
          onClick={handleDismiss}
          aria-label="Dismiss"
          className="rounded p-1 hover:bg-emerald-100"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    )
  }

  if (state === "pending") {
    return (
      <div
        className={`${baseClasses} border-amber-300 bg-amber-50 text-amber-900`}
        role="status"
      >
        <Loader2 className="mt-0.5 h-5 w-5 flex-shrink-0" aria-hidden />
        <div className="flex-1">
          <div className="font-medium">Your payment went through.</div>
          <div className="text-sm opacity-90">
            We're finalizing your registration — refresh in a moment to see it confirmed.
          </div>
        </div>
        <button
          type="button"
          onClick={handleDismiss}
          aria-label="Dismiss"
          className="rounded p-1 hover:bg-amber-100"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    )
  }

  // polling
  return (
    <div
      className={`${baseClasses} border-ink/10 bg-cream text-ink`}
      role="status"
      aria-live="polite"
    >
      <Loader2 className="mt-0.5 h-5 w-5 flex-shrink-0 animate-spin" aria-hidden />
      <div className="flex-1">
        <div className="font-medium">Confirming your payment…</div>
        <div className="text-sm opacity-80">This usually takes a couple of seconds.</div>
      </div>
    </div>
  )
}
