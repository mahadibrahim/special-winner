"use client"

import { useState, useEffect } from "react"
import {
  User,
  FileCheck,
  CreditCard,
  CheckCircle2,
  ChevronRight,
  ChevronLeft,
  Loader2,
  AlertCircle,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { WhoStep } from "./who-step"
import {
  GuestInfoStep,
  type GuestRegistrationMode,
  type GuestFieldErrors,
} from "./guest-info-step"
import { WaiverStep } from "./waiver-step"
import { MediaAuthStep, type MediaAuthScope } from "./media-auth-step"
import { PaymentStep } from "./payment-step"
import { ConfirmationStep } from "./confirmation-step"
import { AddDependentForm } from "./add-dependent-form"
import { useHydrationBeacon } from "@/lib/hooks/use-hydration-beacon"
import { parseApiError } from "@/lib/api/error-message"
import { recordConfirmedPayment } from "@/lib/registrations/payment-confirmation-signal"
import {
  trackRegistrationStepViewed,
  trackRegistrationPaymentMethodSelected,
} from "@/lib/analytics/events"

interface Season {
  id: string
  name: string
  slug: string
  startDate: string
  endDate: string
  price: number
  priceCents: number
  // Early-bird fields served by /api/public/seasons/[id]. Optional so stale
  // payloads (or other callers) degrade to the list price.
  earlyBirdActive?: boolean
  effectivePrice?: number
  effectivePriceCents?: number
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
  phone: string | null
  birthDate: string | null
  gender: string | null
}

interface RegistrationWizardProps {
  seasonId: string
  wasCancelled?: boolean
  user: AuthedUser | null
  /** URL ?audience= param forwarded from the Astro page ("adult" | "child" | null) */
  audienceHint?: string | null
  /** Opaque token linking this registration to a specific team (threaded to checkout). */
  teamToken?: string | null
}

// Step ids — named so the renumber (media folded into Agreements) stays
// readable everywhere the wizard branches on the current step.
const STEP_PLAYER = 1
const STEP_AGREEMENTS = 2
const STEP_PAYMENT = 3
const STEP_CONFIRM = 4

const STEP_NAME: Record<number, "player" | "agreements" | "payment" | "confirm"> = {
  1: "player", 2: "agreements", 3: "payment", 4: "confirm",
}

const STEPS = [
  { id: STEP_PLAYER, name: "Player", icon: User },
  { id: STEP_AGREEMENTS, name: "Agreements", icon: FileCheck },
  { id: STEP_PAYMENT, name: "Payment", icon: CreditCard },
  { id: STEP_CONFIRM, name: "Confirm", icon: CheckCircle2 },
]

// localStorage draft schema version. Bump to invalidate older shapes.
const DRAFT_VERSION = 1

// Early-bird-aware full price. The detail endpoint serves effectivePriceCents
// (server-computed, matches the charge path); fall back to the list price.
const fullPriceCents = (s: Season) => s.effectivePriceCents ?? s.priceCents
const fullPrice = (s: Season) => s.effectivePrice ?? s.price

// A deposit is only a real option when it's strictly less than the
// early-bird-aware full price — a misconfigured deposit at or above the full
// price would charge more than paying in full. Mirrors PaymentStep's
// `depositAvailable` guard and the server's registrationAmountDueCents.
const depositValid = (s: Season) =>
  s.allowDeposit && !!s.depositCents && s.depositCents < fullPriceCents(s)

interface WizardDraft {
  v: number
  currentStep: number
  selectedKey: string | null
  waiverAccepted: boolean
  waiverSignature: string
  mediaOptOuts: MediaAuthScope[]
  paymentOption: "full" | "deposit"
}

/** Captain deposit credit served by GET /api/public/team-registrations/[token]
 *  (viewerCaptainCredit) when the signed-in user is the captain of the
 *  team behind `teamToken` and the $200 deposit is verifiably paid. */
interface CaptainCredit {
  shareCents: number
  creditCents: number
  dueCents: number
  depositCents: number
}

export default function RegistrationWizard({
  seasonId,
  wasCancelled = false,
  user,
  audienceHint,
  teamToken,
}: RegistrationWizardProps) {
  const isGuest = user === null
  useHydrationBeacon()

  // ── Step / flow state ────────────────────────────────────────────────────
  const [currentStep, setCurrentStep] = useState(1)

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
  // Free-agent placement flag, derived instead of asked: an individual-mode
  // registration without a team token means "place me on a house team";
  // joining via a team invite token means the opposite. (The old Agreements
  // checkbox that asked this is gone.)
  const lookingForTeam = !teamToken
  // Media-auth opt-outs: empty Set = all 3 scopes granted (the default).
  const [mediaAuthOptOuts, setMediaAuthOptOuts] = useState<ReadonlySet<MediaAuthScope>>(
    new Set(),
  )

  // ── Guest-mode fields ────────────────────────────────────────────────────
  const [guestParentFirstName, setGuestParentFirstName] = useState("")
  const [guestParentLastName, setGuestParentLastName] = useState("")
  const [guestParentEmail, setGuestParentEmail] = useState("")
  const [guestParentPhone, setGuestParentPhone] = useState("")
  const [guestSmsConsent, setGuestSmsConsent] = useState(false)
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
  const [newMemberParentalConsent, setNewMemberParentalConsent] = useState(false)
  const [isAddingMember, setIsAddingMember] = useState(false)

  // ── Inline profile-completion (signed-in user without a stored birthDate) ──
  // Local copy of the user's birthDate that the UI uses for ageEligibility +
  // the Myself card. `null` means "not stored yet; show the profile form."
  const [completedBirthDate, setCompletedBirthDate] = useState<string | null>(
    user?.birthDate ?? null,
  )
  const [isSavingProfile, setIsSavingProfile] = useState(false)
  const [profileError, setProfileError] = useState<string | null>(null)

  // ── Cancel-resume state ──────────────────────────────────────────────────
  const [resumableRegistrationId, setResumableRegistrationId] = useState<string | null>(null)
  const [isResumingPayment, setIsResumingPayment] = useState(false)

  // Registration the live Stripe session is paying for — handlePaymentSuccess
  // needs it to record the client-confirmed payment signal (webhook-lag
  // bridge; see payment-confirmation-signal.ts).
  const [activeRegistrationId, setActiveRegistrationId] = useState<string | null>(null)

  // ── Draft-restore state (authed only) ────────────────────────────────────
  // A saved draft surfaced on return; the user explicitly resumes or starts
  // over rather than having state silently reappear.
  const [restorable, setRestorable] = useState<WizardDraft | null>(null)

  // Once the user commits to a payment method we create the registration with
  // its chosen type, so the full/deposit option locks for the rest of the
  // wizard (the row's amount is fixed; changing it would need a new flow).
  const [paymentStarted, setPaymentStarted] = useState(false)

  // localStorage key for this user's in-progress draft of this season.
  const draftKey = user ? `aspire:reg:${seasonId}:${user.id}` : null

  // ── Embedded payment state ───────────────────────────────────────────────
  const [paymentClientSecret, setPaymentClientSecret] = useState<string | null>(null)
  const [paymentPublishableKey, setPaymentPublishableKey] = useState<string | null>(null)
  const [paymentValueCents, setPaymentValueCents] = useState(0)
  // Customer's choice of payment-method group. Drives both the displayed
  // surcharge and the Stripe Checkout Session's payment_method_types.
  // Defaults to "card" — the fastest path (Apple Pay / Google Pay / any
  // card); the bank option stays one tap away for the fee-averse.
  const [selectedPaymentCategory, setSelectedPaymentCategory] = useState<
    "bank" | "card"
  >("card")
  const [appliedSurchargeCents, setAppliedSurchargeCents] = useState(0)

  // ── Account credit state (authed only — guests have no balance) ─────────
  const [creditBalanceCents, setCreditBalanceCents] = useState(0)
  const [applyAccountCredit, setApplyAccountCredit] = useState(true)
  const [appliedCreditCents, setAppliedCreditCents] = useState(0)
  // CheckoutPaymentType is "deposit" | "balance" | "full". The wizard only
  // sets "deposit" or "full" — balance pay UI ships in Phase 2 (separate
  // dashboard surface). Type is widened for forward-compat with the analytics
  // module's exported type.
  const [paymentTypeForTracking, setPaymentTypeForTracking] = useState<
    "deposit" | "balance" | "full"
  >("full")

  // ── Captain deposit credit (team-token registrations only) ───────────────
  // When the signed-in registrant is the CAPTAIN of the team behind
  // `teamToken` and the $200 deposit is paid, the server credits their share
  // by the deposit (typically to $0). This fetch is display-only — the server
  // recomputes the credit in createRegistration and never trusts the client.
  const [captainCredit, setCaptainCredit] = useState<CaptainCredit | null>(null)
  // The credit only applies to the captain's SELF registration (server gate:
  // familyMember.selfUserId === user.id) — never to a dependent registered
  // through the same account. Mirror that here so the payment step doesn't
  // show credit math the server would refuse.
  const effectiveCaptainCredit = selectedKey === "self" ? captainCredit : null

  useEffect(() => {
    if (!teamToken || isGuest) return
    let cancelled = false
    ;(async () => {
      try {
        const res = await fetch(
          `/api/public/team-registrations/${encodeURIComponent(teamToken)}`,
        )
        if (!res.ok) return
        const data = await res.json()
        if (!cancelled && data.viewerCaptainCredit) {
          setCaptainCredit(data.viewerCaptainCredit as CaptainCredit)
        }
      } catch {
        // non-fatal — the payment step falls back to the season price and the
        // server still applies the credit at registration time
      }
    })()
    return () => {
      cancelled = true
    }
  }, [teamToken, isGuest])

  // ── Effects ──────────────────────────────────────────────────────────────

  useEffect(() => {
    fetchData()
  }, [seasonId])

  // Fetch the signed-in user's account credit balance so the payment step
  // can offer to apply it. Guests never have a balance (no signed-in user
  // to hold one) — the fetch and the toggle both just don't happen.
  useEffect(() => {
    if (isGuest) return
    let cancelled = false
    ;(async () => {
      try {
        const res = await fetch("/api/account-credit/balance")
        if (!res.ok) return
        const data = await res.json()
        if (!cancelled && typeof data.balanceCents === "number") {
          setCreditBalanceCents(data.balanceCents)
        }
      } catch {
        // non-fatal — checkout proceeds without the credit toggle
      }
    })()
    return () => {
      cancelled = true
    }
  }, [isGuest])

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

  // ── Draft persistence (authed only) ───────────────────────────────────────
  // We persist non-sensitive wizard progress (selection key, signed-waiver
  // flag + the user's own typed name, media opt-outs, payment option) to the
  // browser so an interrupted registration can be resumed instead of restarted.
  // Guests are intentionally excluded — their step-1 form carries child PII we
  // don't want to leave in localStorage.
  const clearDraft = () => {
    if (typeof window === "undefined" || !draftKey) return
    try {
      window.localStorage.removeItem(draftKey)
    } catch {
      // storage disabled/full — non-fatal
    }
  }

  const applyDraft = (d: WizardDraft) => {
    setSelectedKey(d.selectedKey ?? null)
    setWaiverAccepted(Boolean(d.waiverAccepted))
    setWaiverSignature(d.waiverSignature ?? "")
    setMediaAuthOptOuts(new Set(d.mediaOptOuts ?? []))
    setPaymentOption(d.paymentOption === "deposit" ? "deposit" : "full")
    // Don't restore onto the payment step — the registration row isn't created
    // until a method is picked, so land them on Agreements to continue cleanly.
    setCurrentStep(Math.min(Math.max(d.currentStep ?? 1, 1), STEP_AGREEMENTS))
    setRestorable(null)
  }

  // Surface a saved draft on mount. We don't auto-apply — the user chooses.
  useEffect(() => {
    if (isGuest || !draftKey || typeof window === "undefined") return
    try {
      const raw = window.localStorage.getItem(draftKey)
      if (!raw) return
      const d = JSON.parse(raw) as WizardDraft
      if (d?.v !== DRAFT_VERSION) {
        window.localStorage.removeItem(draftKey)
        return
      }
      // Only offer resume when there's meaningful progress past step 1.
      const hasProgress =
        (d.currentStep ?? 1) >= STEP_AGREEMENTS || Boolean(d.selectedKey)
      if (hasProgress) setRestorable(d)
    } catch {
      // corrupt draft — ignore
    }
  }, [draftKey, isGuest])

  // Write the draft as the user advances. Paused while a restore prompt is
  // pending (so the live, empty state can't clobber the saved draft) and after
  // completion.
  useEffect(() => {
    if (
      isGuest ||
      !draftKey ||
      isLoading ||
      restorable !== null ||
      registrationComplete ||
      typeof window === "undefined"
    ) {
      return
    }
    const draft: WizardDraft = {
      v: DRAFT_VERSION,
      currentStep,
      selectedKey,
      waiverAccepted,
      waiverSignature,
      mediaOptOuts: Array.from(mediaAuthOptOuts),
      paymentOption,
    }
    try {
      window.localStorage.setItem(draftKey, JSON.stringify(draft))
    } catch {
      // storage disabled/full — non-fatal
    }
  }, [
    isGuest,
    draftKey,
    isLoading,
    restorable,
    registrationComplete,
    currentStep,
    selectedKey,
    waiverAccepted,
    waiverSignature,
    mediaAuthOptOuts,
    paymentOption,
  ])

  // Compute whether the season's audience is unambiguous. When it is, the
  // mode is "locked": the wizard forces the value and hides the radio toggle.
  // Otherwise both options stay available.
  //
  //   audienceHint = "adult" | "child" from URL  → locked to that mode
  //   ageGroup.maxAge < 18                       → locked to "child"
  //   ageGroup.minAge >= 18                      → locked to "adult"
  //   otherwise                                  → ambiguous, show toggle
  const lockedGuestMode: GuestRegistrationMode | null = (() => {
    if (audienceHint === "adult" || audienceHint === "child") {
      return audienceHint
    }
    if (season?.ageGroup) {
      if (season.ageGroup.maxAge < 18) return "child"
      if (season.ageGroup.minAge >= 18) return "adult"
    }
    return null
  })()

  // Auto-detect guest mode once season loads
  useEffect(() => {
    if (!isGuest || !season) return
    if (lockedGuestMode) {
      setGuestMode(lockedGuestMode)
    }
    // If no lock, leave at the "child" default
  }, [isGuest, season, lockedGuestMode])

  // Track each wizard step view (league analytics).
  useEffect(() => {
    if (season) trackRegistrationStepViewed({ step: STEP_NAME[currentStep] ?? "player", seasonId: season.id })
  }, [currentStep, season])

  // Fire view_item once when entering the payment step
  useEffect(() => {
    if (currentStep === STEP_PAYMENT && season) {
      import("@/lib/analytics/datalayer").then(({ trackViewItem }) => {
        trackViewItem({
          id: season.id,
          name: `${season.program.name} - ${season.name}`,
          category: season.sport.name,
          category2: season.location.name,
          priceCents: fullPriceCents(season),
        })
      })
    }
  }, [currentStep, season])

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
    if (!newMemberParentalConsent) {
      setError("Please confirm the consent checkbox to add a player.")
      return
    }

    setIsAddingMember(true)
    setError(null)
    try {
      const response = await fetch("/api/family-members", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          firstName: newMemberFirstName,
          lastName: newMemberLastName,
          birthDate: newMemberBirthDate,
          gender: newMemberGender || undefined,
          // COPPA-aware affirmative consent. The endpoint's Zod schema
          // requires this to be `true`. Without it, every customer was
          // hitting "Validation failed" with no detail. Tracked in PR.
          parentalConsent: true,
        }),
      })

      if (!response.ok) {
        const data = await response.json().catch(() => null)
        throw new Error(parseApiError(data, "Failed to add member"))
      }

      const data = await response.json()
      setFamilyMembers([...familyMembers, data.familyMember])
      setSelectedKey(data.familyMember.id)
      setShowAddMember(false)
      setNewMemberFirstName("")
      setNewMemberLastName("")
      setNewMemberBirthDate("")
      setNewMemberGender("")
      setNewMemberParentalConsent(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add member")
    } finally {
      setIsAddingMember(false)
    }
  }

  // Local mirror of the user's profile that the inline form mutates as the
  // customer fills in missing fields. Pre-filled from props; persisted to the
  // server when the form is submitted.
  const [completedProfile, setCompletedProfile] = useState({
    firstName: user?.firstName ?? "",
    lastName: user?.lastName ?? "",
    phone: user?.phone ?? "",
    birthDate: user?.birthDate ?? "",
    gender: user?.gender ?? "",
  })

  // Save whatever the customer just filled in. The PUT body always carries
  // the canonical firstName/lastName (schema requires non-empty), plus the
  // new field(s) the customer just edited. Server only updates fields that
  // are explicitly included (see updates conditional in /api/user/profile).
  const handleCompleteProfile = async (data: {
    firstName?: string
    lastName?: string
    phone?: string
    birthDate?: string
    gender?: string
    smsConsent?: boolean
  }) => {
    if (!user) return
    setIsSavingProfile(true)
    setProfileError(null)
    try {
      const merged = {
        firstName: data.firstName ?? completedProfile.firstName ?? user.firstName ?? "",
        lastName: data.lastName ?? completedProfile.lastName ?? user.lastName ?? "",
        phone: data.phone ?? completedProfile.phone ?? user.phone ?? undefined,
        birthDate: data.birthDate ?? completedProfile.birthDate ?? user.birthDate ?? undefined,
        // "" is the form's unset placeholder — omit the key entirely instead
        // of sending it, since the API's gender enum has no "" member and a
        // customer who leaves the optional Gender select on "—" would get a
        // raw "Invalid option" zod error on Save profile.
        gender: (data.gender || completedProfile.gender || user.gender) || undefined,
        // Only sent when the form collected a phone — the server records
        // opt-in state solely for phones provided alongside the checkbox.
        smsConsent: data.smsConsent,
      }
      const res = await fetch("/api/user/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(merged),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => null)
        throw new Error(parseApiError(body, "Failed to save profile"))
      }
      setCompletedProfile({
        firstName: merged.firstName,
        lastName: merged.lastName,
        phone: merged.phone ?? "",
        birthDate: merged.birthDate ?? "",
        gender: merged.gender ?? "",
      })
      setCompletedBirthDate(merged.birthDate ?? null)
      // Auto-select Myself once the profile is saved, so the customer
      // continues with one fewer click.
      setSelectedKey("self")
    } catch (err) {
      setProfileError(err instanceof Error ? err.message : "Failed to save profile")
    } finally {
      setIsSavingProfile(false)
    }
  }

  const handleApplyDiscount = async () => {
    if (!discountCodeInput.trim() || !season) return

    setIsValidatingDiscount(true)
    setDiscountError(null)

    try {
      const purchaseAmountCents = paymentOption === "deposit" && depositValid(season)
        ? season.depositCents!
        : fullPriceCents(season)

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

  const handlePaymentSuccess = (_paymentIntentId: string) => {
    // Bridge the webhook-lag window: the dashboard + nav read this signal to
    // present the (still pending/unpaid) registration as "Payment received —
    // confirming" instead of nagging for payment the customer just made.
    if (activeRegistrationId) {
      recordConfirmedPayment(activeRegistrationId, "succeeded")
    }
    clearDraft()
    setRegistrationComplete(true)
    setPaymentClientSecret(null)
    setCurrentStep(STEP_CONFIRM)
  }

  const handlePaymentCancel = () => {
    // Discard the in-flight Stripe session — the next Continue-to-Payment
    // creates a fresh one. Orphaned sessions self-expire on Stripe's side.
    setPaymentClientSecret(null)
    setPaymentPublishableKey(null)
    setPaymentValueCents(0)
    setAppliedSurchargeCents(0)
    setAppliedCreditCents(0)
  }

  const handleResumePayment = async () => {
    if (!resumableRegistrationId) return
    setIsResumingPayment(true)
    setError(null)
    try {
      const res = await fetch("/api/payments/create-checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          registrationId: resumableRegistrationId,
          paymentMethodCategory: selectedPaymentCategory,
          teamToken: teamToken ?? undefined,
          // Captain-credit checkouts keep the math to one credit source —
          // the deposit — so the displayed due can't drift from the charge.
          applyAccountCredit: effectiveCaptainCredit ? false : applyAccountCredit,
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        throw new Error(
          parseApiError(data, "Failed to create checkout session"),
        )
      }
      if (data.clientSecret) {
        const valueCents = effectiveCaptainCredit
          ? effectiveCaptainCredit.dueCents
          : paymentOption === "deposit" && depositValid(season!)
            ? season!.depositCents!
            : fullPriceCents(season!)
        const baseAfterDiscount = appliedDiscount
          ? valueCents - appliedDiscount.discountAmountCents
          : valueCents
        const creditCents = data.creditAppliedCents ?? 0
        const baseAfterCredit = Math.max(0, baseAfterDiscount - creditCents)
        const surchargeCents = data.surchargeCents ?? 0
        const finalValueCents = baseAfterCredit + surchargeCents

        setActiveRegistrationId(resumableRegistrationId)
        setAppliedSurchargeCents(surchargeCents)
        setAppliedCreditCents(creditCents)
        setPaymentValueCents(finalValueCents)
        setPaymentTypeForTracking(paymentOption === "deposit" && depositValid(season!) ? "deposit" : "full")
        setPaymentPublishableKey(data.publishableKey)
        setPaymentClientSecret(data.clientSecret)

        const { trackBeginCheckout } = await import("@/lib/analytics/datalayer")
        trackBeginCheckout(
          {
            id: season!.id,
            name: `${season!.program.name} - ${season!.name}`,
            category: season!.sport.name,
            category2: season!.location.name,
            priceCents: fullPriceCents(season!),
          },
          finalValueCents,
          appliedDiscount?.code,
        )
        return
      }
      // No clientSecret + ok → discount zeroed the bill; treat as complete.
      clearDraft()
      setRegistrationComplete(true)
      setCurrentStep(STEP_CONFIRM)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to start payment")
    } finally {
      setIsResumingPayment(false)
    }
  }

  const handleSubmitGuestCheckout = async (categoryOverride?: "bank" | "card") => {
    if (!season || !waiverAccepted || !waiverSignature) return
    // The selected method is passed in directly because setState hasn't
    // flushed yet when the method button fires this.
    const category = categoryOverride ?? selectedPaymentCategory
    setIsSubmitting(true)
    setError(null)
    try {
      const mediaAuthOptOutsArr = Array.from(mediaAuthOptOuts)
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
              smsConsent: guestSmsConsent,
              registrationType: paymentOption,
              waiverSigned: true,
              waiverSignedBy: waiverSignature,
              discountCode: discountCode || undefined,
              lookingForTeam,
              mediaAuthOptOuts: mediaAuthOptOutsArr,
              paymentMethodCategory: category,
              teamToken: teamToken ?? undefined,
            }
          : {
              seasonId,
              parent: {
                firstName: guestParentFirstName,
                lastName: guestParentLastName,
                email: guestParentEmail,
                phone: guestParentPhone || undefined,
              },
              smsConsent: guestSmsConsent,
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
              mediaAuthOptOuts: mediaAuthOptOutsArr,
              paymentMethodCategory: category,
              teamToken: teamToken ?? undefined,
            }

      const res = await fetch("/api/registrations/guest-checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })
      const data = await res.json()
      if (!res.ok) {
        throw new Error(parseApiError(data, "Failed to complete registration"))
      }
      if (data.clientSecret) {
        const valueCents =
          paymentOption === "deposit" && depositValid(season!)
            ? season!.depositCents!
            : fullPriceCents(season!)
        const baseAfterDiscount = appliedDiscount
          ? valueCents - appliedDiscount.discountAmountCents
          : valueCents
        const surchargeCents = data.surchargeCents ?? 0
        const finalValueCents = baseAfterDiscount + surchargeCents

        setActiveRegistrationId(data.registrationId ?? null)
        setAppliedSurchargeCents(surchargeCents)
        setPaymentValueCents(finalValueCents)
        setPaymentTypeForTracking(paymentOption === "deposit" && depositValid(season!) ? "deposit" : "full")
        setPaymentPublishableKey(data.publishableKey)
        setPaymentClientSecret(data.clientSecret)

        const { trackBeginCheckout } = await import("@/lib/analytics/datalayer")
        trackBeginCheckout(
          {
            id: season!.id,
            name: `${season!.program.name} - ${season!.name}`,
            category: season!.sport.name,
            category2: season!.location.name,
            priceCents: fullPriceCents(season!),
          },
          finalValueCents,
          appliedDiscount?.code,
        )
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

  const handleSubmitRegistration = async (categoryOverride?: "bank" | "card") => {
    if (!selectedKey || !waiverAccepted || !waiverSignature) return

    // Passed in directly from the method button (setState hasn't flushed).
    const category = categoryOverride ?? selectedPaymentCategory
    setIsSubmitting(true)
    setError(null)

    const mediaAuthOptOutsArr = Array.from(mediaAuthOptOuts)
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
            mediaAuthOptOuts: mediaAuthOptOutsArr,
            // Without the token the server can't resolve the invitee share
            // or the captain's deposit credit — the signed-in path must send
            // it just like the guest path does.
            teamToken: teamToken ?? undefined,
          }
        : {
            seasonId,
            familyMemberId: selectedKey,
            registrationType: paymentOption,
            waiverSigned: true,
            waiverSignedBy: waiverSignature,
            discountCode: discountCode || undefined,
            mediaAuthOptOuts: mediaAuthOptOutsArr,
            teamToken: teamToken ?? undefined,
          }

    try {
      // Step 1: Create registration
      const regResponse = await fetch("/api/registrations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(registrationBody),
      })

      if (!regResponse.ok) {
        const data = await regResponse.json().catch(() => null)
        throw new Error(parseApiError(data, "Failed to complete registration"))
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
            paymentMethodCategory: category,
            teamToken: teamToken ?? undefined,
            // Captain-credit checkouts keep the math to one credit source —
            // the deposit — so the displayed due can't drift from the charge.
            applyAccountCredit: effectiveCaptainCredit ? false : applyAccountCredit,
          }),
        })

        if (!checkoutResponse.ok) {
          const checkoutData = await checkoutResponse.json()
          // Never show a success screen when payment was required but could
          // not be initiated (e.g. Stripe not configured). Surfacing a fake
          // "registered" state would tell the customer they paid when no
          // payment was taken and no registration was finalized.
          throw new Error(
            parseApiError(checkoutData, "Failed to create checkout session"),
          )
        }

        const checkoutData = await checkoutResponse.json()

        // Hand off to embedded form rendered inside step 4
        if (checkoutData.clientSecret) {
          const valueCents = effectiveCaptainCredit
            ? effectiveCaptainCredit.dueCents
            : paymentOption === "deposit" && depositValid(season!)
              ? season!.depositCents!
              : fullPriceCents(season!)
          const baseAfterDiscount = appliedDiscount
            ? valueCents - appliedDiscount.discountAmountCents
            : valueCents
          const creditCents = checkoutData.creditAppliedCents ?? 0
          const baseAfterCredit = Math.max(0, baseAfterDiscount - creditCents)
          const surchargeCents = checkoutData.surchargeCents ?? 0
          const finalValueCents = baseAfterCredit + surchargeCents

          setActiveRegistrationId(regData.registration.id)
          setAppliedSurchargeCents(surchargeCents)
          setAppliedCreditCents(creditCents)
          setPaymentValueCents(finalValueCents)
          setPaymentTypeForTracking(paymentOption === "deposit" && depositValid(season!) ? "deposit" : "full")
          setPaymentPublishableKey(checkoutData.publishableKey)
          setPaymentClientSecret(checkoutData.clientSecret)

          const { trackBeginCheckout } = await import("@/lib/analytics/datalayer")
          trackBeginCheckout(
            {
              id: season!.id,
              name: `${season!.program.name} - ${season!.name}`,
              category: season!.sport.name,
              category2: season!.location.name,
              priceCents: fullPriceCents(season!),
            },
            finalValueCents,
            appliedDiscount?.code,
          )
          return
        }
      }

      // Waitlisted or no payment required — go straight to confirmation
      clearDraft()
      setRegistrationComplete(true)
      setCurrentStep(STEP_CONFIRM)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to complete registration")
    } finally {
      setIsSubmitting(false)
    }
  }

  // Selecting a payment method is the single commit action: lock the option,
  // remember the choice, and create the registration + Stripe session for it.
  const handleMethodSelected = (category: "bank" | "card") => {
    trackRegistrationPaymentMethodSelected({ method: category })
    setSelectedPaymentCategory(category)
    setPaymentStarted(true)
    if (isGuest) {
      handleSubmitGuestCheckout(category)
    } else {
      handleSubmitRegistration(category)
    }
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  // Per-field guest validation. Returns null when everything required for the
  // active mode is present. Drives the attempt-based Continue on step 1: the
  // button stays tappable and a failed attempt marks exactly what's missing —
  // a silently disabled button reads as "broken page" on mobile and was
  // costing registrations (users left without typing anything).
  const computeGuestErrors = (): GuestFieldErrors | null => {
    const errors: GuestFieldErrors = {}
    if (!guestParentFirstName.trim()) errors.parentFirstName = "Enter your first name."
    if (!guestParentLastName.trim()) errors.parentLastName = "Enter your last name."
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(guestParentEmail)) {
      errors.parentEmail = guestParentEmail.trim()
        ? "That email doesn't look right — check for typos."
        : "Enter your email."
    }
    if (guestMode === "adult") {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(guestAdultBirthDate))
        errors.adultBirthDate = "Enter your birth date."
    } else {
      if (!guestChildFirstName.trim()) errors.childFirstName = "Enter the player's first name."
      if (!guestChildLastName.trim()) errors.childLastName = "Enter the player's last name."
      if (!/^\d{4}-\d{2}-\d{2}$/.test(guestChildBirthDate))
        errors.childBirthDate = "Enter the player's birth date."
    }
    return Object.keys(errors).length > 0 ? errors : null
  }

  // Errors only render after the first failed Continue attempt, then update
  // live as the customer fixes fields (so resolved errors clear themselves).
  const [guestAttempted, setGuestAttempted] = useState(false)
  const guestFieldErrors = guestAttempted ? computeGuestErrors() : null

  const handleContinue = () => {
    if (currentStep === STEP_PLAYER && isGuest) {
      const errors = computeGuestErrors()
      if (errors) {
        setGuestAttempted(true)
        return
      }
      setGuestAttempted(false)
    }
    setCurrentStep(currentStep + 1)
  }

  const canProceed = () => {
    switch (currentStep) {
      case 1:
        // Guests: always allow the tap — handleContinue validates and surfaces
        // per-field errors instead of a dead button.
        if (isGuest) return true
        return selectedKey !== null
      case STEP_AGREEMENTS:
        // Waiver is the gate; media consent below it is optional. The full
        // legal text being collapsed doesn't change what's required.
        return waiverAccepted && waiverSignature.length >= 2
      case STEP_PAYMENT:
        return true
      default:
        return false
    }
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

  // ── Draft-restore early return ─────────────────────────────────────────────
  // Shown only when there's no further-along cancelled-payment registration to
  // resume (that card takes precedence).

  if (restorable && !resumableRegistrationId) {
    return (
      <div className="mx-auto max-w-xl">
        <div className="rounded-xl border border-ink/10 bg-cream px-6 py-8 shadow-sm">
          <h2 className="text-2xl font-medium text-ink mb-2">Welcome back</h2>
          <p className="text-ink/80 mb-6">
            We saved your progress for this registration. Pick up where you left
            off, or start fresh.
          </p>
          <div className="flex items-center gap-3">
            <Button onClick={() => applyDraft(restorable)}>Resume</Button>
            <Button
              variant="ghost"
              onClick={() => {
                clearDraft()
                setRestorable(null)
              }}
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
    <div className="w-full">
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

      {/* Step Content */}
      <div className="bg-paper border border-border rounded-2xl p-6">
        {/* Step 1: Who are you registering? (authenticated path) */}
        {currentStep === 1 && !isGuest && !showAddMember && (
          <WhoStep
            selfOption={
              completedBirthDate
                ? {
                    firstName: completedProfile.firstName || (user?.firstName ?? ""),
                    lastName: completedProfile.lastName || (user?.lastName ?? ""),
                    ageEligible: isAgeEligible(completedBirthDate, season),
                  }
                : null
            }
            selfProfile={
              user
                ? {
                    firstName: completedProfile.firstName || user.firstName,
                    lastName: completedProfile.lastName || user.lastName,
                    phone: completedProfile.phone || user.phone,
                    birthDate: completedBirthDate ?? null,
                    gender: completedProfile.gender || user.gender,
                  }
                : null
            }
            isSavingProfile={isSavingProfile}
            profileError={profileError}
            dependentError={error}
            onCompleteProfile={handleCompleteProfile}
            adultOnly={(season?.ageGroup?.minAge ?? 0) >= 18}
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
            parentalConsent={newMemberParentalConsent}
            isSubmitting={isAddingMember}
            onFirstNameChange={setNewMemberFirstName}
            onLastNameChange={setNewMemberLastName}
            onBirthDateChange={setNewMemberBirthDate}
            onGenderChange={setNewMemberGender}
            onParentalConsentChange={setNewMemberParentalConsent}
            onSubmit={handleAddMember}
            onCancel={() => {
              setShowAddMember(false)
              setNewMemberParentalConsent(false)
            }}
          />
        )}

        {/* Step 1 (guest): About you + player */}
        {currentStep === 1 && isGuest && (
          <GuestInfoStep
            seasonId={seasonId}
            mode={guestMode}
            onModeChange={setGuestMode}
            lockedMode={lockedGuestMode}
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
            smsConsent={guestSmsConsent}
            onSmsConsentChange={setGuestSmsConsent}
            onChildFirstNameChange={setGuestChildFirstName}
            onChildLastNameChange={setGuestChildLastName}
            onChildBirthDateChange={setGuestChildBirthDate}
            onChildGenderChange={setGuestChildGender}
            adultBirthDate={guestAdultBirthDate}
            adultGender={guestAdultGender}
            onAdultBirthDateChange={setGuestAdultBirthDate}
            onAdultGenderChange={setGuestAdultGender}
            fieldErrors={guestFieldErrors}
          />
        )}

        {/* Step 2: Agreements — waiver (required) + media consent (optional) */}
        {currentStep === STEP_AGREEMENTS && (
          <div className="space-y-6">
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
              onWaiverAcceptedChange={setWaiverAccepted}
              onWaiverSignatureChange={setWaiverSignature}
            />
            <MediaAuthStep
              isSelf={
                isGuest
                  ? guestMode === "adult"
                  : selectedKey === "self"
              }
              participantName={
                isGuest
                  ? guestMode === "adult"
                    ? `${guestParentFirstName} ${guestParentLastName}`.trim()
                    : `${guestChildFirstName} ${guestChildLastName}`.trim()
                  : selectedDisplayName
              }
              optOutScopes={mediaAuthOptOuts}
              onOptOutScopesChange={setMediaAuthOptOuts}
            />
          </div>
        )}

        {/* Step 3: Payment */}
        {currentStep === STEP_PAYMENT && (
          <PaymentStep
            seasonName={season.name}
            seasonPrice={fullPrice(season)}
            seasonPriceCents={fullPriceCents(season)}
            earlyBirdActive={season.earlyBirdActive ?? false}
            seasonDeposit={season.deposit}
            seasonDepositCents={season.depositCents}
            allowDeposit={season.allowDeposit}
            paymentOption={paymentOption}
            paymentMethodCategory={selectedPaymentCategory}
            onMethodSelected={handleMethodSelected}
            captainCredit={effectiveCaptainCredit}
            onCompleteZeroDue={() => {
              // Zero-due captain registration: no method, no Stripe intent —
              // the server finalizes the row as paid via the deposit credit.
              setPaymentStarted(true)
              handleSubmitRegistration()
            }}
            isCreatingSession={isSubmitting}
            optionLocked={paymentStarted}
            appliedSurchargeCents={appliedSurchargeCents}
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
            creditBalanceCents={creditBalanceCents}
            applyAccountCredit={applyAccountCredit}
            onApplyAccountCreditChange={setApplyAccountCredit}
            appliedCreditCents={appliedCreditCents}
            clientSecret={paymentClientSecret}
            publishableKey={paymentPublishableKey}
            seasonItem={
              season
                ? {
                    id: season.id,
                    name: `${season.program.name} - ${season.name}`,
                    category: season.sport.name,
                    category2: season.location.name,
                    priceCents: fullPriceCents(season),
                  }
                : null
            }
            paymentValueCents={paymentValueCents}
            checkoutPaymentType={paymentTypeForTracking}
            paymentReturnUrl={`${window.location.origin}/payment/return`}
            onPaymentSuccess={handlePaymentSuccess}
            onPaymentCancel={handlePaymentCancel}
          />
        )}

        {/* Step 4: Confirmation */}
        {currentStep === STEP_CONFIRM && registrationComplete && (
          <ConfirmationStep
            seasonName={season.name}
            registrantDisplayName={
              isGuest
                ? guestMode === "adult"
                  ? `${guestParentFirstName} ${guestParentLastName}`.trim()
                  : `${guestChildFirstName} ${guestChildLastName}`.trim()
                : selectedDisplayName
            }
            isSelf={isGuest ? guestMode === "adult" : selectedKey === "self"}
          />
        )}
      </div>

      {/* Navigation — on the payment step there's no forward button; selecting
          a payment method is what advances the flow. */}
      {currentStep < STEP_CONFIRM && !paymentClientSecret && (
        <div className="mt-6 flex items-center justify-between">
          <Button
            variant="ghost"
            onClick={() => setCurrentStep(currentStep - 1)}
            disabled={currentStep === STEP_PLAYER || isSubmitting}
            className="text-ink-muted hover:text-ink"
          >
            <ChevronLeft className="w-4 h-4 mr-1" />
            Back
          </Button>

          {currentStep < STEP_PAYMENT && (
            <div className="flex flex-col items-end gap-1.5">
              <Button
                onClick={handleContinue}
                disabled={!canProceed()}
                className="bg-primary hover:bg-primary/90"
              >
                Continue
                <ChevronRight className="w-4 h-4 ml-1" />
              </Button>
              {currentStep === STEP_PLAYER && isGuest && guestFieldErrors && (
                <p className="text-xs text-destructive text-right">
                  Fix the highlighted fields above to continue.
                </p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
