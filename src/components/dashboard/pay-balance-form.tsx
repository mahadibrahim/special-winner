"use client"

import { useEffect, useState } from "react"
import { Loader2 } from "lucide-react"
import { ErrorBanner } from "@/components/ui/error-banner"
import { EmbeddedPayment } from "@/components/registration/embedded-payment"
import { useHydrationBeacon } from "@/lib/hooks/use-hydration-beacon"

interface RegistrationSummary {
  id: string
  amountDueCents: number
  amountPaidCents: number
  paymentStatus: string
  season: {
    id: string
    name: string
  }
  program: {
    id: string
    name: string
  }
  sport: {
    id: string
    name: string
  }
  location: {
    id: string
    name: string
  }
}

interface PayBalanceFormProps {
  registrationId: string
}

export default function PayBalanceForm({ registrationId }: PayBalanceFormProps) {
  useHydrationBeacon()
  const [registration, setRegistration] = useState<RegistrationSummary | null>(null)
  const [clientSecret, setClientSecret] = useState<string | null>(null)
  const [publishableKey, setPublishableKey] = useState<string | null>(null)
  const [isInitializing, setIsInitializing] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    ;(async () => {
      try {
        const regRes = await fetch(`/api/registrations/${registrationId}`)
        if (!regRes.ok) throw new Error("Couldn't load this registration")
        const regData = await regRes.json()
        if (cancelled) return
        const reg: RegistrationSummary = regData.registration
        setRegistration(reg)

        const balanceCents = reg.amountDueCents - reg.amountPaidCents
        if (balanceCents <= 0) {
          setError("This registration is already paid in full.")
          setIsInitializing(false)
          return
        }

        const checkoutRes = await fetch("/api/payments/create-checkout", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ registrationId }),
        })
        const checkoutData = await checkoutRes.json()
        if (!checkoutRes.ok) {
          throw new Error(checkoutData.error || "Couldn't start your payment")
        }
        if (!checkoutData.clientSecret) {
          throw new Error("Payment is unavailable right now — please try again shortly.")
        }
        if (cancelled) return

        setClientSecret(checkoutData.clientSecret)
        setPublishableKey(checkoutData.publishableKey)

        const seasonItem = {
          id: reg.season.id,
          name: `${reg.program.name} - ${reg.season.name}`,
          category: reg.sport.name,
          category2: reg.location.name,
          priceCents: reg.amountDueCents,
        }

        const { trackViewItem, trackBeginCheckout } = await import(
          "@/lib/analytics/datalayer"
        )
        trackViewItem(seasonItem)
        trackBeginCheckout(seasonItem, balanceCents)
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Something went wrong")
        }
      } finally {
        if (!cancelled) setIsInitializing(false)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [registrationId])

  const handlePaymentSuccess = (paymentIntentId: string) => {
    // Land on the canonical payment-status page — a full-screen "Payment
    // confirmed" the customer can't miss — rather than dumping them on the
    // dashboard and hoping a banner renders. Its Continue CTA carries the
    // payment=success params so the dashboard banner reinforces on arrival.
    window.location.href = `/payment/return?payment_intent=${paymentIntentId}`
  }

  const handlePaymentCancel = () => {
    window.location.href = "/dashboard"
  }

  if (isInitializing) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="space-y-4">
        <ErrorBanner message={error} />
        <a href="/dashboard" className="text-sm underline text-ink-muted">
          ← Back to dashboard
        </a>
      </div>
    )
  }

  if (!registration || !clientSecret || !publishableKey) {
    return null
  }

  const balanceCents = registration.amountDueCents - registration.amountPaidCents
  const seasonItem = {
    id: registration.season.id,
    name: `${registration.program.name} - ${registration.season.name}`,
    category: registration.sport.name,
    category2: registration.location.name,
    priceCents: registration.amountDueCents,
  }

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-border bg-paper px-6 py-5">
        <div className="text-sm text-ink-muted">Balance due</div>
        <div className="mt-1 text-3xl font-semibold text-ink">
          ${(balanceCents / 100).toFixed(2)}
        </div>
        <div className="mt-3 text-sm text-ink-muted">
          {registration.program.name} — {registration.season.name}
        </div>
      </div>

      <div className="rounded-xl border border-border bg-paper px-6 py-5">
        <h2 className="mb-4 text-lg font-semibold text-ink">Payment Details</h2>
        <EmbeddedPayment
          clientSecret={clientSecret}
          publishableKey={publishableKey}
          seasonItem={seasonItem}
          valueCents={balanceCents}
          paymentType="balance"
          returnUrl={`${window.location.origin}/payment/return`}
          onSuccess={handlePaymentSuccess}
          onCancel={handlePaymentCancel}
        />
      </div>
    </div>
  )
}
