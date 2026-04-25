"use client"

import { useEffect, useState } from "react"
import {
  ArrowLeft,
  Calendar,
  MapPin,
  Phone,
  Mail,
  Users,
  Loader2,
  AlertCircle,
  CheckCircle2,
  Clock,
  XCircle,
  CreditCard,
  ExternalLink,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"

interface Registration {
  id: string
  status: string
  paymentStatus: string
  amountPaidCents: number
  amountDueCents: number
  registrationType: string
  waiverSigned: boolean
  notes: string | null
  createdAt: string
  familyMember: {
    id: string
    firstName: string
    lastName: string
    birthDate: string
  }
  season: {
    id: string
    name: string
    startDate: string
    endDate: string
    scheduleNotes: string | null
    priceCents: number
    depositCents: number | null
  }
  program: {
    id: string
    name: string
    slug: string
    description: string | null
    programType: string
  }
  sport: {
    id: string
    name: string
    slug: string
    icon: string | null
    color: string | null
  }
  location: {
    id: string
    name: string
    addressLine1: string | null
    addressLine2: string | null
    city: string | null
    state: string | null
    postalCode: string | null
    phone: string | null
    email: string | null
  }
  ageGroup: {
    id: string
    name: string
    minAge: number
    maxAge: number
  } | null
}

const statusConfig: Record<
  string,
  { label: string; icon: typeof CheckCircle2; className: string }
> = {
  pending: {
    label: "Pending Payment",
    icon: Clock,
    className: "bg-yellow-500/10 text-yellow-600 border-yellow-500/30",
  },
  confirmed: {
    label: "Confirmed",
    icon: CheckCircle2,
    className: "bg-emerald-500/10 text-emerald-600 border-emerald-500/30",
  },
  waitlisted: {
    label: "Waitlisted",
    icon: AlertCircle,
    className: "bg-blue-500/10 text-blue-600 border-blue-500/30",
  },
  cancelled: {
    label: "Cancelled",
    icon: XCircle,
    className: "bg-gray-500/10 text-ink-muted border-gray-500/30",
  },
  refunded: {
    label: "Refunded",
    icon: XCircle,
    className: "bg-gray-500/10 text-ink-muted border-gray-500/30",
  },
}

const fallbackIcons: Record<string, string> = {
  soccer: "⚽",
  basketball: "🏀",
  baseball: "⚾",
  football: "🏈",
  "t-ball": "🥎",
}

function parseLocalDate(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number)
  return new Date(y, (m ?? 1) - 1, d ?? 1)
}

function formatDateRange(start: string, end: string) {
  const s = parseLocalDate(start)
  const e = parseLocalDate(end)
  const sm = s.toLocaleDateString("en-US", { month: "short" })
  const em = e.toLocaleDateString("en-US", { month: "short" })
  if (sm === em) {
    return `${sm} ${s.getDate()} – ${e.getDate()}, ${e.getFullYear()}`
  }
  return `${sm} ${s.getDate()} – ${em} ${e.getDate()}, ${e.getFullYear()}`
}

function formatAddress(loc: Registration["location"]) {
  const parts = [
    loc.addressLine1,
    loc.addressLine2,
    [loc.city, loc.state].filter(Boolean).join(", "),
    loc.postalCode,
  ].filter(Boolean)
  return parts.join(" · ")
}

function formatProgramType(t: string) {
  if (!t) return ""
  return t.charAt(0).toUpperCase() + t.slice(1)
}

export default function RegistrationDetail({ registrationId }: { registrationId: string }) {
  const [registration, setRegistration] = useState<Registration | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [isStartingCheckout, setIsStartingCheckout] = useState(false)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        setIsLoading(true)
        const res = await fetch(`/api/registrations/${registrationId}`)
        if (!res.ok) {
          if (res.status === 404) {
            setError("Registration not found")
          } else {
            setError("Failed to load registration")
          }
          return
        }
        const data = await res.json()
        if (!cancelled) setRegistration(data.registration)
      } catch {
        if (!cancelled) setError("Failed to load registration")
      } finally {
        if (!cancelled) setIsLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [registrationId])

  const handleCompletePayment = async () => {
    if (!registration) return
    setIsStartingCheckout(true)
    try {
      const res = await fetch("/api/payments/create-checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ registrationId: registration.id }),
      })
      const data = await res.json()
      if (!res.ok) {
        throw new Error(data.error || "Failed to start payment")
      }
      if (data.checkoutUrl) {
        window.location.href = data.checkoutUrl
        return
      }
      // No URL → bill resolved (e.g. discount zeroed it). Refresh.
      window.location.reload()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to start payment")
      setIsStartingCheckout(false)
    }
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
      </div>
    )
  }

  if (error || !registration) {
    return (
      <div className="space-y-4">
        <a
          href="/dashboard"
          className="inline-flex items-center gap-1.5 text-sm text-ink-muted hover:text-ink"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to dashboard
        </a>
        <div className="p-6 rounded-2xl border border-destructive/30 bg-destructive/5 text-destructive">
          <div className="flex items-center gap-2 font-medium">
            <AlertCircle className="w-5 h-5" />
            {error || "Registration not found"}
          </div>
        </div>
      </div>
    )
  }

  const status = statusConfig[registration.status] || statusConfig.pending
  const StatusIcon = status.icon
  const sportIcon =
    registration.sport.icon ||
    fallbackIcons[registration.sport.slug] ||
    fallbackIcons[registration.sport.name.toLowerCase()] ||
    "🏃"
  const sportColor = registration.sport.color || "#6b7280"

  const showCompletePayment =
    registration.status === "pending" &&
    registration.paymentStatus === "unpaid" &&
    registration.amountDueCents > 0

  const address = formatAddress(registration.location)
  const directionsQuery = encodeURIComponent(
    [
      registration.location.name,
      registration.location.addressLine1,
      registration.location.city,
      registration.location.state,
      registration.location.postalCode,
    ]
      .filter(Boolean)
      .join(", "),
  )

  return (
    <div className="space-y-6">
      <a
        href="/dashboard"
        className="inline-flex items-center gap-1.5 text-sm text-ink-muted hover:text-ink"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to dashboard
      </a>

      {/* Header card */}
      <div className="rounded-2xl border border-border bg-paper overflow-hidden">
        <div className="p-6 sm:p-8">
          <div className="flex items-start gap-4 sm:gap-5">
            <div
              className="w-16 h-16 rounded-2xl flex items-center justify-center text-3xl flex-shrink-0"
              style={{
                backgroundColor: `${sportColor}15`,
                border: `1px solid ${sportColor}30`,
              }}
            >
              {sportIcon}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex flex-wrap items-center gap-2 mb-2">
                <Badge variant="outline" className="border-border text-ink-muted bg-cream-2">
                  {registration.sport.name}
                </Badge>
                <Badge variant="outline" className="border-border text-ink-muted bg-cream-2">
                  {formatProgramType(registration.program.programType)}
                </Badge>
                {registration.ageGroup && (
                  <Badge variant="outline" className="border-border text-ink-muted bg-cream-2">
                    Ages {registration.ageGroup.minAge}–{registration.ageGroup.maxAge}
                  </Badge>
                )}
              </div>
              <h1 className="text-2xl sm:text-3xl font-bold text-ink leading-tight">
                {registration.program.name}
              </h1>
              <p className="text-base text-ink-muted mt-1">{registration.season.name}</p>
              <p className="text-sm text-ink-muted mt-1">
                Registered for{" "}
                <span className="text-ink font-medium">
                  {registration.familyMember.firstName} {registration.familyMember.lastName}
                </span>
              </p>
            </div>
            <Badge variant="outline" className={`${status.className} flex items-center gap-1 flex-shrink-0`}>
              <StatusIcon className="w-3.5 h-3.5" />
              {status.label}
            </Badge>
          </div>

          {registration.program.description && (
            <p className="mt-5 text-sm text-ink-muted leading-relaxed">
              {registration.program.description}
            </p>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Schedule + Location */}
        <div className="lg:col-span-2 space-y-6">
          <section className="rounded-2xl border border-border bg-paper p-6">
            <h2 className="text-base font-semibold text-ink flex items-center gap-2 mb-4">
              <Calendar className="w-4 h-4 text-primary" />
              Schedule
            </h2>
            <dl className="space-y-3 text-sm">
              <div className="flex justify-between gap-4">
                <dt className="text-ink-muted">Season</dt>
                <dd className="text-ink text-right">
                  {formatDateRange(registration.season.startDate, registration.season.endDate)}
                </dd>
              </div>
              {registration.season.scheduleNotes && (
                <div className="flex justify-between gap-4">
                  <dt className="text-ink-muted">Meeting times</dt>
                  <dd className="text-ink text-right whitespace-pre-line">
                    {registration.season.scheduleNotes}
                  </dd>
                </div>
              )}
            </dl>
            <div className="mt-4 pt-4 border-t border-border">
              <Button asChild variant="outline" size="sm" className="border-border text-ink-2 hover:bg-cream-2">
                <a href="/dashboard/schedule">
                  View full schedule
                </a>
              </Button>
            </div>
          </section>

          <section className="rounded-2xl border border-border bg-paper p-6">
            <h2 className="text-base font-semibold text-ink flex items-center gap-2 mb-4">
              <MapPin className="w-4 h-4 text-primary" />
              Location
            </h2>
            <p className="text-ink font-medium">{registration.location.name}</p>
            {address && <p className="text-sm text-ink-muted mt-1">{address}</p>}

            {(registration.location.phone || registration.location.email) && (
              <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-sm">
                {registration.location.phone && (
                  <a
                    href={`tel:${registration.location.phone}`}
                    className="inline-flex items-center gap-1.5 text-ink-muted hover:text-ink"
                  >
                    <Phone className="w-3.5 h-3.5" />
                    {registration.location.phone}
                  </a>
                )}
                {registration.location.email && (
                  <a
                    href={`mailto:${registration.location.email}`}
                    className="inline-flex items-center gap-1.5 text-ink-muted hover:text-ink"
                  >
                    <Mail className="w-3.5 h-3.5" />
                    {registration.location.email}
                  </a>
                )}
              </div>
            )}

            {directionsQuery && (
              <div className="mt-4 pt-4 border-t border-border">
                <Button asChild variant="outline" size="sm" className="border-border text-ink-2 hover:bg-cream-2">
                  <a
                    href={`https://www.google.com/maps/search/?api=1&query=${directionsQuery}`}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Get directions
                    <ExternalLink className="w-3.5 h-3.5 ml-1.5" />
                  </a>
                </Button>
              </div>
            )}
          </section>

          {registration.notes && (
            <section className="rounded-2xl border border-border bg-paper p-6">
              <h2 className="text-base font-semibold text-ink mb-3">Notes</h2>
              <p className="text-sm text-ink-muted whitespace-pre-line">{registration.notes}</p>
            </section>
          )}
        </div>

        {/* Payment + Athlete */}
        <div className="space-y-6">
          <section className="rounded-2xl border border-border bg-paper p-6">
            <h2 className="text-base font-semibold text-ink flex items-center gap-2 mb-4">
              <CreditCard className="w-4 h-4 text-primary" />
              Payment
            </h2>
            <dl className="space-y-3 text-sm">
              <div className="flex justify-between">
                <dt className="text-ink-muted">Plan</dt>
                <dd className="text-ink capitalize">
                  {registration.registrationType === "deposit" ? "Deposit" : "Full payment"}
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-ink-muted">Season price</dt>
                <dd className="text-ink">
                  ${(registration.season.priceCents / 100).toFixed(2)}
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-ink-muted">Paid</dt>
                <dd className="text-ink">
                  ${(registration.amountPaidCents / 100).toFixed(2)}
                </dd>
              </div>
              <div className="flex justify-between font-medium">
                <dt className="text-ink">Balance</dt>
                <dd className="text-ink">
                  ${(registration.amountDueCents / 100).toFixed(2)}
                </dd>
              </div>
            </dl>

            {showCompletePayment && (
              <Button
                onClick={handleCompletePayment}
                disabled={isStartingCheckout}
                className="w-full mt-5 bg-primary hover:bg-primary/90"
              >
                {isStartingCheckout ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Starting checkout…
                  </>
                ) : (
                  "Complete payment"
                )}
              </Button>
            )}

            <div className="mt-4 pt-4 border-t border-border">
              <Button asChild variant="ghost" size="sm" className="text-ink-muted hover:text-ink px-0">
                <a href="/dashboard/payments">View payment history →</a>
              </Button>
            </div>
          </section>

          <section className="rounded-2xl border border-border bg-paper p-6">
            <h2 className="text-base font-semibold text-ink flex items-center gap-2 mb-4">
              <Users className="w-4 h-4 text-primary" />
              Athlete
            </h2>
            <p className="text-ink font-medium">
              {registration.familyMember.firstName} {registration.familyMember.lastName}
            </p>
            <Button asChild variant="outline" size="sm" className="mt-4 border-border text-ink-2 hover:bg-cream-2">
              <a href={`/dashboard/children/${registration.familyMember.id}`}>
                View profile
              </a>
            </Button>
          </section>

        </div>
      </div>
    </div>
  )
}
