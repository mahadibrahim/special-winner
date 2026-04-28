"use client"

import { useState, useEffect } from "react"
import {
  User,
  FileCheck,
  CreditCard,
  CheckCircle2,
  ChevronRight,
  ChevronLeft,
  Calendar,
  MapPin,
  Users,
  Loader2,
  AlertCircle,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { TelegramConnectStep } from "./telegram-connect-step"
import { WhoStep } from "./who-step"
import { GuestInfoStep, type GuestRegistrationMode } from "./guest-info-step"
import { WaiverStep } from "./waiver-step"
import { PaymentStep } from "./payment-step"
import { ConfirmationStep } from "./confirmation-step"
import { AddDependentForm } from "./add-dependent-form"
import { useHydrationBeacon } from "@/lib/hooks/use-hydration-beacon"

interface Season {
  id: string
  name: string
  slug: string
  startDate: string
  endDate: string
  price: number
  priceCents: number
  deposit: number | null
  depositCents: number | null
  allowDeposit: boolean
  maxParticipants: number | null
  registeredCount: number
  spotsLeft: number | null
  scheduleNotes: string | null
  status: string
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
    slug: string
    address: string | null
    city: string | null
    state: string | null
  }
  ageGroup: {
    id: string
    name: string
    minAge: number
    maxAge: number
  } | null
}

interface FamilyMember {
  id: string
  firstName: string
  lastName: string
  birthDate: string
  gender: string | null
}

interface AuthedUser {
  id: string
  email: string
  firstName: string | null
  lastName: string | null
  birthDate: string | null
}

interface RegistrationWizardProps {
  seasonId: string
  hasLinkedTelegram?: boolean
  wasCancelled?: boolean
  user: AuthedUser | null
  /** URL ?audience= param forwarded from the Astro page ("adult" | "child" | null) */
  audienceHint?: string | null
}

const STEPS = [
  { id: 1, name: "Select Player", icon: User },
  { id: 2, name: "Sign Waiver", icon: FileCheck },
  { id: 3, name: "Payment", icon: CreditCard },
  { id: 4, name: "Confirm", icon: CheckCircle2 },
]

export default function RegistrationWizard({
  seasonId,
  hasLinkedTelegram = false,
  wasCancelled = false,
  user,
  audienceHint,
}: RegistrationWizardProps) {
  const isGuest = user === null
  useHydrationBeacon()

  // ── Step / flow state ────────────────────────────────────────────────────
  const [currentStep, setCurrentStep] = useState(1)
  const [showTelegramStep, setShowTelegramStep] = useState(false)

  // ── Remote data ──────────────────────────────────────────────────────────
  const [season, setSeason] = useState<Season | null>(null)
  const [familyMembers, setFamilyMembers] = useState<FamilyMember[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // ── Submission state ─────────────────────────────────────────────────────
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [registrationComplete, setRegistrationComplete] = useState(false)

  // ── Selection / waiver / payment state ──────────────────────────────────
  // selectedKey: "self" | <dependentId> | null
  const [selectedKey, setSelectedKey] = useState<string | null>(null)
  const [waiverAccepted, setWaiverAccepted] = useState(false)
  const [waiverSignature, setWaiverSignature] = useState("")
  const [paymentOption, setPaymentOption] = useState<"full" | "deposit">("full")
  const [lookingForTeam, setLookingForTeam] = useState(false)

  // ── Guest-mode fields ────────────────────────────────────────────────────
  const [guestParentFirstName, setGuestParentFirstName] = useState("")
  const [guestParentLastName, setGuestParentLastName] = useState("")
  const [guestParentEmail, setGuestParentEmail] = useState("")
  const [guestParentPhone, setGuestParentPhone] = useState("")
  const [guestChildFirstName, setGuestChildFirstName] = useState("")
  const [guestChildLastName, setGuestChildLastName] = useState("")
  const [guestChildBirthDate, setGuestChildBirthDate] = useState("")
  const [guestChildGender, setGuestChildGender] = useState("")
  const [guestEmailCollision, setGuestEmailCollision] = useState(false)
  const [isCheckingEmail, setIsCheckingEmail] = useState(false)

  // ── Guest registration mode (child vs adult) ─────────────────────────────
  // Default is determined after season data loads (see effect below).
  // audienceHint="adult" or minAge>=18 → "adult", otherwise "child".
  const [guestMode, setGuestMode] = useState<GuestRegistrationMode>("child")

  // Adult-self extra fields (birth date + gender stored separately so the
  // child fields remain intact if the user toggles back and forth).
  const [guestAdultBirthDate, setGuestAdultBirthDate] = useState("")
  const [guestAdultGender, setGuestAdultGender] = useState("")

  // ── Discount code state ──────────────────────────────────────────────────
  const [discountCode, setDiscountCode] = useState("")
  const [discountCodeInput, setDiscountCodeInput] = useState("")
  const [isValidatingDiscount, setIsValidatingDiscount] = useState(false)
  const [discountError, setDiscountError] = useState<string | null>(null)
  const [appliedDiscount, setAppliedDiscount] = useState<{
    code: string
    discountType: "percentage" | "fixed_amount"
    discountValue: number
    discountAmountCents: number
  } | null>(null)

  // ── Add-dependent form state ─────────────────────────────────────────────
  const [showAddMember, setShowAddMember] = useState(false)
  const [newMemberFirstName, setNewMemberFirstName] = useState("")
  const [newMemberLastName, setNewMemberLastName] = useState("")
  const [newMemberBirthDate, setNewMemberBirthDate] = useState("")
  const [newMemberGender, setNewMemberGender] = useState("")
  const [isAddingMember, setIsAddingMember] = useState(false)

  // ── Cancel-resume state ──────────────────────────────────────────────────
  const [resumableRegistrationId, setResumableRegistrationId] = useState<string | null>(null)
  const [isResumingPayment, setIsResumingPayment] = useState(false)

  // ── Effects ──────────────────────────────────────────────────────────────

  useEffect(() => {
    fetchData()
  }, [seasonId])

  // Check for cancelled-payment resumable registration
  useEffect(() => {
    if (!wasCancelled || isGuest) return
    let cancelled = false
    ;(async () => {
      try {
        const res = await fetch("/api/registrations")
        if (!res.ok) return
        const data = await res.json()
        const match = (data.registrations ?? []).find(
          (r: { id: string; season: { id: string }; status: string; paymentStatus: string }) =>
            r.season.id === seasonId &&
            r.status === "pending" &&
            r.paymentStatus === "unpaid"
        )
        if (!cancelled && match) {
          setResumableRegistrationId(match.id)
        }
      } catch {
        // swallow — fall back to normal wizard
      }
    })()
    return () => {
      cancelled = true
    }
  }, [wasCancelled, seasonId, isGuest])

  // Auto-detect guest mode once season loads
  useEffect(() => {
    if (!isGuest || !season) return
    const urlForced = audienceHint === "adult" || audienceHint === "child"
    if (urlForced) {
      setGuestMode(audienceHint as GuestRegistrationMode)
    } else if (season.ageGroup && season.ageGroup.minAge >= 18) {
      setGuestMode("adult")
    }
    // If no signal, leave at the "child" default
  }, [isGuest, season, audienceHint])

  // Debounced guest email collision check
  useEffect(() => {
    if (!isGuest || !guestParentEmail) {
      setGuestEmailCollision(false)
      return
    }
    const looksLikeEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(guestParentEmail)
    if (!looksLikeEmail) {
      setGuestEmailCollision(false)
      return
    }
    const ctrl = new AbortController()
    const handle = setTimeout(async () => {
      setIsCheckingEmail(true)
      try {
        const res = await fetch(
          `/api/auth/check-email?email=${encodeURIComponent(guestParentEmail)}`,
          { signal: ctrl.signal },
        )
        if (res.ok) {
          const data = await res.json()
          setGuestEmailCollision(data.exists === true)
        }
      } catch {
        // Network error or aborted — treat as no collision (fail open)
      } finally {
        setIsCheckingEmail(false)
      }
    }, 400)
    return () => {
      clearTimeout(handle)
      ctrl.abort()
    }
  }, [isGuest, guestParentEmail])

  // ── Data fetching ─────────────────────────────────────────────────────────

  const fetchData = async () => {
    try {
      setIsLoading(true)
      const [seasonRes, membersRes] = await Promise.all([
        fetch(`/api/public/seasons/${seasonId}`),
        isGuest ? Promise.resolve(null) : fetch("/api/family-members"),
      ])

      if (!seasonRes.ok) throw new Error("Failed to fetch season")
      const seasonData = await seasonRes.json()
      setSeason(seasonData.season)

      if (membersRes && membersRes.ok) {
        const membersData = await membersRes.json()
        setFamilyMembers(membersData.familyMembers || [])
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load data")
    } finally {
      setIsLoading(false)
    }
  }

  // ── Handlers ──────────────────────────────────────────────────────────────

  const handleAddMember = async () => {
    if (!newMemberFirstName || !newMemberLastName || !newMemberBirthDate) return

    setIsAddingMember(true)
    try {
      const response = await fetch("/api/family-members", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          firstName: newMemberFirstName,
          lastName: newMemberLastName,
          birthDate: newMemberBirthDate,
          gender: newMemberGender || undefined,
        }),
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || "Failed to add member")
      }

      const data = await response.json()
      setFamilyMembers([...familyMembers, data.familyMember])
      setSelectedKey(data.familyMember.id)
      setShowAddMember(false)
      setNewMemberFirstName("")
      setNewMemberLastName("")
      setNewMemberBirthDate("")
      setNewMemberGender("")
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add member")
    } finally {
      setIsAddingMember(false)
    }
  }

  const handleApplyDiscount = async () => {
    if (!discountCodeInput.trim() || !season) return

    setIsValidatingDiscount(true)
    setDiscountError(null)

    try {
      const purchaseAmountCents = paymentOption === "deposit" && season.depositCents
        ? season.depositCents
        : season.priceCents

      const response = await fetch("/api/public/validate-discount", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code: discountCodeInput.trim().toUpperCase(),
          seasonId: season.id,
          purchaseAmountCents,
        }),
      })

      const data = await response.json()

      if (!data.valid) {
        setDiscountError(data.error || "Invalid discount code")
        return
      }

      setDiscountCode(discountCodeInput.trim().toUpperCase())
      setAppliedDiscount({
        code: data.discount.code,
        discountType: data.discount.discountType,
        discountValue: data.discount.discountValue,
        discountAmountCents: data.calculatedDiscount?.discountAmountCents || 0,
      })
      setDiscountCodeInput("")
    } catch {
      setDiscountError("Failed to validate discount code")
    } finally {
      setIsValidatingDiscount(false)
    }
  }

  const handleRemoveDiscount = () => {
    setDiscountCode("")
    setAppliedDiscount(null)
    setDiscountError(null)
  }

  const handleResumePayment = async () => {
    if (!resumableRegistrationId) return
    setIsResumingPayment(true)
    setError(null)
    try {
      const res = await fetch("/api/payments/create-checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ registrationId: resumableRegistrationId }),
      })
      const data = await res.json()
      if (!res.ok) {
        throw new Error(data.error || "Failed to create checkout session")
      }
      if (data.checkoutUrl) {
        window.location.href = data.checkoutUrl
        return
      }
      // No URL + ok → discount zeroed the bill; treat as complete.
      setRegistrationComplete(true)
      setCurrentStep(4)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to start payment")
    } finally {
      setIsResumingPayment(false)
    }
  }

  const handleSubmitGuestCheckout = async () => {
    if (!season || !waiverAccepted || !waiverSignature) return
    setIsSubmitting(true)
    setError(null)
    try {
      const payload =
        guestMode === "adult"
          ? {
              seasonId,
              registrant: {
                firstName: guestParentFirstName,
                lastName: guestParentLastName,
                email: guestParentEmail,
                phone: guestParentPhone || undefined,
                birthDate: guestAdultBirthDate,
                isSelf: true as const,
                gender: guestAdultGender || undefined,
              },
              registrationType: paymentOption,
              waiverSigned: true,
              waiverSignedBy: waiverSignature,
              discountCode: discountCode || undefined,
            }
          : {
              seasonId,
              parent: {
                firstName: guestParentFirstName,
                lastName: guestParentLastName,
                email: guestParentEmail,
                phone: guestParentPhone || undefined,
              },
              child: {
                firstName: guestChildFirstName,
                lastName: guestChildLastName,
                birthDate: guestChildBirthDate,
                gender: guestChildGender || undefined,
              },
              registrationType: paymentOption,
              waiverSigned: true,
              waiverSignedBy: waiverSignature,
              discountCode: discountCode || undefined,
            }

      const res = await fetch("/api/registrations/guest-checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })
      const data = await res.json()
      if (!res.ok) {
        throw new Error(data.error || "Failed to complete registration")
      }
      if (data.checkoutUrl) {
        window.location.href = data.checkoutUrl
        return
      }
      if (data.paid) {
        window.location.href = `/dashboard?registered=${data.registrationId}`
        return
      }
      if (data.waitlisted) {
        window.location.href = `/dashboard?waitlisted=${data.registrationId}`
        return
      }
      setError("Unexpected response — please try again.")
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to complete registration")
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleSubmitRegistration = async () => {
    if (!selectedKey || !waiverAccepted || !waiverSignature) return

    setIsSubmitting(true)
    setError(null)

    const registrationBody =
      selectedKey === "self"
        ? {
            seasonId,
            registerSelf: true,
            registrationType: paymentOption,
            waiverSigned: true,
            waiverSignedBy: waiverSignature,
            discountCode: discountCode || undefined,
            lookingForTeam,
          }
        : {
            seasonId,
            familyMemberId: selectedKey,
            registrationType: paymentOption,
            waiverSigned: true,
            waiverSignedBy: waiverSignature,
            discountCode: discountCode || undefined,
          }

    try {
      // Step 1: Create registration
      const regResponse = await fetch("/api/registrations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(registrationBody),
      })

      if (!regResponse.ok) {
        const data = await regResponse.json()
        throw new Error(data.error || "Failed to complete registration")
      }

      const regData = await regResponse.json()

      if (regData.requiresPayment) {
        // Step 2: Create Stripe checkout session
        const checkoutResponse = await fetch("/api/payments/create-checkout", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            registrationId: regData.registration.id,
            discountCode: discountCode || undefined,
          }),
        })

        if (!checkoutResponse.ok) {
          const checkoutData = await checkoutResponse.json()
          // If Stripe isn't configured, show success without payment
          if (checkoutData.error === "Payment processing is not configured") {
            setRegistrationComplete(true)
            if (!hasLinkedTelegram) {
              setShowTelegramStep(true)
            } else {
              setCurrentStep(4)
            }
            return
          }
          throw new Error(checkoutData.error || "Failed to create checkout session")
        }

        const checkoutData = await checkoutResponse.json()

        // Redirect to Stripe checkout
        if (checkoutData.checkoutUrl) {
          window.location.href = checkoutData.checkoutUrl
          return
        }
      }

      // Waitlisted or no payment required — show Telegram step first (if not already linked)
      setRegistrationComplete(true)
      if (!hasLinkedTelegram) {
        setShowTelegramStep(true)
      } else {
        setCurrentStep(4)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to complete registration")
    } finally {
      setIsSubmitting(false)
    }
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  const canProceed = () => {
    switch (currentStep) {
      case 1:
        if (isGuest) {
          const baseValid =
            guestParentFirstName.trim().length > 0 &&
            guestParentLastName.trim().length > 0 &&
            /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(guestParentEmail)
          if (guestMode === "adult") {
            return baseValid && /^\d{4}-\d{2}-\d{2}$/.test(guestAdultBirthDate)
          }
          return (
            baseValid &&
            guestChildFirstName.trim().length > 0 &&
            guestChildLastName.trim().length > 0 &&
            /^\d{4}-\d{2}-\d{2}$/.test(guestChildBirthDate)
          )
        }
        return selectedKey !== null
      case 2:
        return waiverAccepted && waiverSignature.length >= 2
      case 3:
        return true
      default:
        return false
    }
  }

  const formatDateRange = (start: string, end: string) => {
    // Parse as local dates so "2026-05-16" doesn't render as May 15 in -04 TZs.
    const [sy, sm, sd] = start.split("-").map(Number)
    const [ey, em, ed] = end.split("-").map(Number)
    const startDate = new Date(sy, (sm ?? 1) - 1, sd ?? 1)
    const endDate = new Date(ey, (em ?? 1) - 1, ed ?? 1)
    const startMonth = startDate.toLocaleDateString("en-US", { month: "short" })
    const endMonth = endDate.toLocaleDateString("en-US", { month: "short" })
    const startDay = startDate.getDate()
    const endDay = endDate.getDate()
    const year = endDate.getFullYear()

    if (startMonth === endMonth) {
      return `${startMonth} ${startDay} - ${endDay}, ${year}`
    }
    return `${startMonth} ${startDay} - ${endMonth} ${endDay}, ${year}`
  }

  const calculateAge = (birthDate: string) => {
    const today = new Date()
    const birth = new Date(birthDate)
    let age = today.getFullYear() - birth.getFullYear()
    const monthDiff = today.getMonth() - birth.getMonth()
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) {
      age--
    }
    return age
  }

  const isAgeEligible = (birthDate: string, currentSeason: Season): boolean => {
    if (!currentSeason.ageGroup) return true
    const age = calculateAge(birthDate)
    return age >= currentSeason.ageGroup.minAge && age <= currentSeason.ageGroup.maxAge
  }

  // Resolve the display name for the selected registrant
  const selectedDisplayName =
    selectedKey === "self"
      ? `${user?.firstName ?? ""} ${user?.lastName ?? ""}`.trim()
      : selectedKey
      ? (() => {
          const m = familyMembers.find((m) => m.id === selectedKey)
          return m ? `${m.firstName} ${m.lastName}` : ""
        })()
      : ""

  // ── Loading / error states ─────────────────────────────────────────────────

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    )
  }

  if (error && !season) {
    return (
      <div className="text-center py-20">
        <AlertCircle className="w-12 h-12 text-destructive mx-auto mb-4" />
        <p className="text-ink mb-2">Failed to load registration</p>
        <p className="text-ink-muted text-sm">{error}</p>
      </div>
    )
  }

  if (!season) return null

  // ── Resume-payment early return ────────────────────────────────────────────

  if (resumableRegistrationId) {
    return (
      <div className="mx-auto max-w-xl">
        <div className="rounded-xl border border-ink/10 bg-cream px-6 py-8 shadow-sm">
          <h2 className="text-2xl font-medium text-ink mb-2">Finish your payment</h2>
          <p className="text-ink/80 mb-6">
            You started registering for this season but didn't complete payment.
            Your spot is saved — click below to go back to Stripe Checkout.
          </p>
          {error && (
            <div className="mb-4 rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-900">
              {error}
            </div>
          )}
          <div className="flex items-center gap-3">
            <Button onClick={handleResumePayment} disabled={isResumingPayment}>
              {isResumingPayment ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Redirecting…
                </>
              ) : (
                "Continue to payment"
              )}
            </Button>
            <Button
              variant="ghost"
              onClick={() => setResumableRegistrationId(null)}
              disabled={isResumingPayment}
            >
              Start over
            </Button>
          </div>
        </div>
      </div>
    )
  }

  // ── Main wizard render ─────────────────────────────────────────────────────

  return (
    <div className="max-w-3xl mx-auto">
      {/* Progress Steps */}
      <div className="mb-8">
        <div className="flex items-center justify-between relative">
          {/* Progress line */}
          <div className="absolute top-5 left-0 right-0 h-0.5 bg-border" />
          <div
            className="absolute top-5 left-0 h-0.5 bg-primary transition-all duration-500"
            style={{ width: `${((currentStep - 1) / (STEPS.length - 1)) * 100}%` }}
          />

          {STEPS.map((step) => {
            const StepIcon = step.icon
            const isActive = currentStep === step.id
            const isComplete = currentStep > step.id

            return (
              <div key={step.id} className="relative flex flex-col items-center z-10">
                <div
                  className={`w-10 h-10 rounded-full flex items-center justify-center transition-all ${
                    isComplete
                      ? "bg-primary text-primary-foreground"
                      : isActive
                        ? "bg-primary text-primary-foreground ring-4 ring-primary/20"
                        : "bg-cream-3 text-ink-muted"
                  }`}
                >
                  {isComplete ? (
                    <CheckCircle2 className="w-5 h-5" />
                  ) : (
                    <StepIcon className="w-5 h-5" />
                  )}
                </div>
                <span
                  className={`mt-2 text-xs font-medium ${
                    isActive ? "text-ink" : "text-ink-muted"
                  }`}
                >
                  {step.name}
                </span>
              </div>
            )
          })}
        </div>
      </div>

      {/* Error Banner */}
      {error && (
        <div className="mb-6 p-4 rounded-xl bg-destructive/10 border border-destructive/20 flex items-center gap-3 text-destructive">
          <AlertCircle className="w-5 h-5 flex-shrink-0" />
          <span>{error}</span>
          <button onClick={() => setError(null)} className="ml-auto text-sm underline">
            Dismiss
          </button>
        </div>
      )}

      {/* Program Summary */}
      <div className="mb-6 p-4 rounded-xl bg-paper border border-border">
        <div className="flex items-center gap-4">
          <div
            className="w-14 h-14 rounded-xl flex items-center justify-center text-2xl"
            style={{
              backgroundColor: `${season.sport.color || "#6b7280"}15`,
              border: `1px solid ${season.sport.color || "#6b7280"}30`,
            }}
          >
            {season.sport.icon || "🏃"}
          </div>
          <div className="flex-1">
            <h2 className="font-semibold text-ink">{season.name}</h2>
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-ink-muted">
              <span className="flex items-center gap-1">
                <Calendar className="w-3.5 h-3.5" />
                {formatDateRange(season.startDate, season.endDate)}
              </span>
              <span className="flex items-center gap-1">
                <MapPin className="w-3.5 h-3.5" />
                {season.location.name}
              </span>
              {season.ageGroup && (
                <span className="flex items-center gap-1">
                  <Users className="w-3.5 h-3.5" />
                  Ages {season.ageGroup.minAge}-{season.ageGroup.maxAge}
                </span>
              )}
            </div>
          </div>
          <div className="text-right">
            <div className="text-2xl font-bold text-ink">${season.price}</div>
            {season.allowDeposit && season.deposit && (
              <div className="text-sm text-ink-muted">
                or ${season.deposit} deposit
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Step Content */}
      <div className="bg-paper border border-border rounded-2xl p-6">
        {/* Step 1: Who are you registering? (authenticated path) */}
        {currentStep === 1 && !isGuest && !showAddMember && (
          <WhoStep
            selfOption={
              user?.birthDate
                ? {
                    firstName: user.firstName ?? "",
                    lastName: user.lastName ?? "",
                    ageEligible: isAgeEligible(user.birthDate, season),
                  }
                : null
            }
            dependents={familyMembers.map((m) => ({
              id: m.id,
              firstName: m.firstName,
              lastName: m.lastName,
              birthDate: m.birthDate,
              ageEligible: isAgeEligible(m.birthDate, season),
            }))}
            selectedKey={selectedKey}
            onSelect={setSelectedKey}
            onAddDependent={() => setShowAddMember(true)}
          />
        )}

        {/* Add dependent inline form (authenticated path, step 1) */}
        {currentStep === 1 && !isGuest && showAddMember && (
          <AddDependentForm
            firstName={newMemberFirstName}
            lastName={newMemberLastName}
            birthDate={newMemberBirthDate}
            gender={newMemberGender}
            isSubmitting={isAddingMember}
            onFirstNameChange={setNewMemberFirstName}
            onLastNameChange={setNewMemberLastName}
            onBirthDateChange={setNewMemberBirthDate}
            onGenderChange={setNewMemberGender}
            onSubmit={handleAddMember}
            onCancel={() => setShowAddMember(false)}
          />
        )}

        {/* Step 1 (guest): About you + player */}
        {currentStep === 1 && isGuest && (
          <GuestInfoStep
            seasonId={seasonId}
            mode={guestMode}
            onModeChange={setGuestMode}
            parentFirstName={guestParentFirstName}
            parentLastName={guestParentLastName}
            parentEmail={guestParentEmail}
            parentPhone={guestParentPhone}
            childFirstName={guestChildFirstName}
            childLastName={guestChildLastName}
            childBirthDate={guestChildBirthDate}
            childGender={guestChildGender}
            emailCollision={guestEmailCollision}
            isCheckingEmail={isCheckingEmail}
            onParentFirstNameChange={setGuestParentFirstName}
            onParentLastNameChange={setGuestParentLastName}
            onParentEmailChange={setGuestParentEmail}
            onParentPhoneChange={setGuestParentPhone}
            onChildFirstNameChange={setGuestChildFirstName}
            onChildLastNameChange={setGuestChildLastName}
            onChildBirthDateChange={setGuestChildBirthDate}
            onChildGenderChange={setGuestChildGender}
            adultBirthDate={guestAdultBirthDate}
            adultGender={guestAdultGender}
            onAdultBirthDateChange={setGuestAdultBirthDate}
            onAdultGenderChange={setGuestAdultGender}
          />
        )}

        {/* Step 2: Waiver */}
        {currentStep === 2 && (
          <WaiverStep
            isSelf={selectedKey === "self"}
            isGuest={isGuest}
            guestMode={guestMode}
            registrantName={
              isGuest
                ? guestMode === "adult"
                  ? `${guestParentFirstName} ${guestParentLastName}`.trim()
                  : selectedDisplayName
                : selectedDisplayName
            }
            guestChildFullName={
              isGuest && guestMode === "child"
                ? `${guestChildFirstName} ${guestChildLastName}`.trim()
                : undefined
            }
            waiverAccepted={waiverAccepted}
            waiverSignature={waiverSignature}
            lookingForTeam={lookingForTeam}
            onWaiverAcceptedChange={setWaiverAccepted}
            onWaiverSignatureChange={setWaiverSignature}
            onLookingForTeamChange={setLookingForTeam}
          />
        )}

        {/* Step 3: Payment */}
        {currentStep === 3 && (
          <PaymentStep
            seasonName={season.name}
            seasonPrice={season.price}
            seasonDeposit={season.deposit}
            allowDeposit={season.allowDeposit}
            paymentOption={paymentOption}
            registrantName={
              isGuest
                ? guestMode === "adult"
                  ? `${guestParentFirstName} ${guestParentLastName}`.trim()
                  : `${guestChildFirstName} ${guestChildLastName}`.trim()
                : selectedDisplayName
            }
            discountCodeInput={discountCodeInput}
            isValidatingDiscount={isValidatingDiscount}
            discountError={discountError}
            appliedDiscount={appliedDiscount}
            onPaymentOptionChange={setPaymentOption}
            onDiscountCodeInputChange={(v) => {
              setDiscountCodeInput(v)
              setDiscountError(null)
            }}
            onApplyDiscount={handleApplyDiscount}
            onRemoveDiscount={handleRemoveDiscount}
          />
        )}

        {/* Telegram Connect Step (between payment and confirmation) */}
        {showTelegramStep && (
          <TelegramConnectStep
            onComplete={() => {
              setShowTelegramStep(false)
              setCurrentStep(4)
            }}
            onSkip={() => {
              setShowTelegramStep(false)
              setCurrentStep(4)
            }}
          />
        )}

        {/* Step 4: Confirmation */}
        {currentStep === 4 && !showTelegramStep && registrationComplete && (
          <ConfirmationStep
            seasonName={season.name}
            registrantDisplayName={selectedDisplayName}
          />
        )}
      </div>

      {/* Navigation */}
      {currentStep < 4 && !showTelegramStep && (
        <div className="mt-6 flex items-center justify-between">
          <Button
            variant="ghost"
            onClick={() => setCurrentStep(currentStep - 1)}
            disabled={currentStep === 1}
            className="text-ink-muted hover:text-ink"
          >
            <ChevronLeft className="w-4 h-4 mr-1" />
            Back
          </Button>

          {currentStep < 3 ? (
            <Button
              onClick={() => setCurrentStep(currentStep + 1)}
              disabled={!canProceed()}
              className="bg-primary hover:bg-primary/90"
            >
              Continue
              <ChevronRight className="w-4 h-4 ml-1" />
            </Button>
          ) : (
            <Button
              onClick={isGuest ? handleSubmitGuestCheckout : handleSubmitRegistration}
              disabled={isSubmitting}
              className="bg-primary hover:bg-primary/90"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin mr-2" />
                  Processing...
                </>
              ) : (
                <>
                  Complete Registration
                  <CheckCircle2 className="w-4 h-4 ml-2" />
                </>
              )}
            </Button>
          )}
        </div>
      )}
    </div>
  )
}
