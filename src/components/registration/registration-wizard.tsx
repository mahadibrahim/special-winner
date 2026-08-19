"use client"

import { useState, useEffect, useRef } from "react"
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
import { ExitReasonChips } from "./exit-reason-chips"
import { ConfirmationStep } from "./confirmation-step"
import { AddDependentForm } from "./add-dependent-form"
import { useHydrationBeacon } from "@/lib/hooks/use-hydration-beacon"
import { parseApiError } from "@/lib/api/error-message"
import { recordConfirmedPayment } from "@/lib/registrations/payment-confirmation-signal"
import { readGuestDraft, clearGuestDraft, stashGuestDraft } from "@/lib/registrations/guest-draft"
import {
  trackRegistrationStepViewed,
  type RegVariant,
  type RegFlow,
} from "@/lib/analytics/events"
import { phSessionHeader } from "@/lib/analytics/track"
import type { CreateIntentResult } from "./embedded-payment"

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
  // Null for adult self-registrants whose DOB is still pending
  // post-payment review (their row can surface here alongside dependents).
  birthDate: string | null
  gender: string | null
  // Present when this row is the signed-in user's own self-registration
  // record (created by resolvePerson on first self-checkout). Used to match
  // this user's own rows out of GET /api/registrations for the Task 5
  // already-registered / resume states, and to keep that same row out of
  // the dependents list (it belongs on the "Myself" card, not as a lookalike
  // dependent entry).
  selfUserId?: string | null
}

/** A signed-in user's non-cancelled/refunded registration row for THIS
 *  season, as reduced from GET /api/registrations (Task 5's already-
 *  registered / resume states). */
interface ActiveSeasonRegistration {
  id: string
  status: string
  paymentStatus: string
  waiverSigned: boolean
  familyMemberId: string
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
  /** Captain-assigned share (cents) for an invite-link visitor, resolved by
   *  RegisterExperience from GET /api/public/team-registrations/[token].
   *  null = not known yet / not an invite-link visitor. Not yet consumed by
   *  wizard behavior (Task 4). */
  inviteeShareCents?: number | null
  /** Team name resolved alongside inviteeShareCents. Not yet consumed by
   *  wizard behavior (Task 5). */
  teamName?: string | null
  /** Stripe publishable key, threaded from the Astro page's server env. The
   *  deferred payment Element needs it at mount (the key is server-only
   *  otherwise). */
  stripePublishableKey: string
  /** Reports the live (step, stepCount) up to RegisterExperience so the
   *  context rail's progress bar tracks the wizard. */
  onStepChange?: (step: number, stepCount: number) => void
}

// Wizard steps by name. `currentStep` stays 1-based, but which step that
// number maps to depends on the flow variant: v1 keeps the four-step flow
// (agreements pre-payment), v2 (adult-locked seasons) drops the agreements
// interstitial — the waiver + details are collected after payment.
type WizardStepName = "player" | "agreements" | "payment" | "confirm"

const STEP_LISTS: Record<RegVariant, WizardStepName[]> = {
  v1: ["player", "agreements", "payment", "confirm"],
  v2: ["player", "payment", "confirm"],
}

// The active step-list variant for EVERY season. Youth solo checkout adopted
// the funnel-proven v2 shape (player → payment → confirm; the waiver moves to
// the post-payment completion form), so nothing selects "v1" any more. The v1
// list, its guards and its Agreements render block are deliberately left
// intact as a one-line rollback lever — `as RegVariant` widens the literal so
// those branches keep type-checking instead of narrowing to dead code.
const ACTIVE_FLOW_VARIANT = "v2" as RegVariant

const STEP_META: Record<WizardStepName, { name: string; icon: typeof User }> = {
  player: { name: "Player", icon: User },
  agreements: { name: "Agreements", icon: FileCheck },
  payment: { name: "Payment", icon: CreditCard },
  confirm: { name: "Confirm", icon: CheckCircle2 },
}

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
  inviteeShareCents,
  teamName,
  stripePublishableKey,
  onStepChange,
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

  // ── Flow variant ─────────────────────────────────────────────────────────
  // TWO INDEPENDENT AXES — they used to be one predicate, which is why youth
  // was stuck on v1:
  //
  // 1. `flowVariant` — the STEP-LIST / WAIVER axis. Universally "v2" now: no
  //    pre-payment agreements step, the waiver is signed on the post-payment
  //    completion form. Applies to youth and adult alike.
  const flowVariant: RegVariant = ACTIVE_FLOW_VARIANT
  // 2. `adultSelfFlow` — the ADULT-SELF axis (the OLD v2 condition). True only
  //    when the person being registered IS the account holder: an adult-locked
  //    season or an explicit ?audience=adult. It gates every behavior that
  //    assumes "one registrant, and it's you" — the minimal name+email guest
  //    step, auto-selecting "Myself", the self-only already-registered
  //    short-circuit, the aggressive resume card, and deferring the
  //    registrant's DOB past payment. Youth keeps the parent-registers-a-child
  //    behaviors (kid DOB pre-payment, second-child registrations allowed).
  const adultSelfFlow =
    audienceHint === "adult" || (season?.ageGroup?.minAge ?? 0) >= 18
  const stepList = STEP_LISTS[flowVariant]
  const stepName = stepList[currentStep - 1] ?? "player"
  // 1-based number of a named step in the active list (confirm is step 4 in
  // v1 but step 3 in v2; payment is step 3 vs 2).
  const stepNumberOf = (name: WizardStepName) => stepList.indexOf(name) + 1
  // Progress-header steps derived from the active list (v2 shows 3 dots).
  const steps = stepList.map((n, i) => ({
    id: i + 1,
    name: STEP_META[n].name,
    icon: STEP_META[n].icon,
  }))

  // Mirror the live step up to the context rail (see RegisterExperience).
  useEffect(() => {
    onStepChange?.(currentStep, stepList.length)
  }, [currentStep, stepList.length, onStepChange])

  // ── Submission state ─────────────────────────────────────────────────────
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [registrationComplete, setRegistrationComplete] = useState(false)

  // Exit-reason chips: offered once per wizard session, right after the first
  // Back out of the payment step. Parent-controlled so navigation is never
  // gated on the ask.
  const [showExitChips, setShowExitChips] = useState(false)
  const exitChipsOfferedRef = useRef(false)

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

  // Guest submit hit the server's `already_registered` 409 (this email
  // already has a live registration for this season). Renders a friendly
  // state in place of the step content instead of the generic error banner —
  // per the disclosure rule, no registration detail is shown, just that the
  // email has a spot and a manage-link email was sent.
  const [guestAlreadyRegistered, setGuestAlreadyRegistered] = useState(false)
  // Season filled between reaching the payment step and clicking Pay (the
  // deferred flow checks capacity at Pay-time). Renders an explicit "you're
  // on the waitlist, card NOT charged" terminal state — never a silent
  // dashboard bounce, and never the "Your spot is locked!" confirmation.
  const [waitlistedAtCheckout, setWaitlistedAtCheckout] = useState(false)
  // Set by "Register a different player instead" so the effect below can
  // focus the email field once step 1 has actually re-rendered.
  const [focusGuestEmailOnMount, setFocusGuestEmailOnMount] = useState(false)

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
  // The resumable row's server-computed amountDueCents (from GET
  // /api/registrations) — same role as serverAmountDueCents below, but for
  // the resume-payment path, which never goes through handleSubmit* and so
  // never gets a fresh POST response to read amountDueCents off of.
  const [resumableAmountDueCents, setResumableAmountDueCents] = useState<number | null>(null)
  const [isResumingPayment, setIsResumingPayment] = useState(false)

  // ── Already-registered state (authed only, Task 5) ───────────────────────
  // The signed-in user's non-cancelled/refunded registrations for THIS
  // season, keyed to their family member. Adult-locked v2 self flows use
  // this to short-circuit the whole wizard; v1/dependent-capable flows only
  // use it to mark individual people in WhoStep (a parent may still
  // register a second, not-yet-registered child).
  const [activeSeasonRegistrations, setActiveSeasonRegistrations] = useState<
    ActiveSeasonRegistration[]
  >([])
  // Whether the GET /api/registrations check below has settled (success,
  // no-op for guests, or error). The main loading gate waits on this too —
  // without it, the wizard would render the normal Player step for a beat
  // and then flash to the resume/already-registered card once this fetch
  // resolves, since it's independent of the season+family-members fetch
  // that isLoading otherwise tracks.
  const [registrationsChecked, setRegistrationsChecked] = useState(isGuest)
  // Set when the up-front fetch above found nothing but the submit still
  // hit the server's 409 (race: another tab/device beat us, or the fetch was
  // stale). v2 renders the same full-screen state as the up-front check;
  // there's no detailed registration row to show in this case.
  const [raceAlreadyRegistered, setRaceAlreadyRegistered] = useState(false)

  // Registration the live Stripe session is paying for — handlePaymentSuccess
  // needs it to record the client-confirmed payment signal (webhook-lag
  // bridge; see payment-confirmation-signal.ts).
  const [activeRegistrationId, setActiveRegistrationId] = useState<string | null>(null)
  // Ref mirror of activeRegistrationId. In the deferred flow the id is set
  // INSIDE createIntent, during the same Pay handler that then confirms and
  // calls onSuccess — so handlePaymentSuccess's closure would still read the
  // stale (null) state value. The ref is current immediately.
  const activeRegistrationIdRef = useRef<string | null>(null)
  const rememberActiveRegistration = (id: string | null) => {
    activeRegistrationIdRef.current = id
    setActiveRegistrationId(id)
  }

  // ── Draft-restore state (authed only) ────────────────────────────────────
  // A saved draft surfaced on return; the user explicitly resumes or starts
  // over rather than having state silently reappear.
  const [restorable, setRestorable] = useState<WizardDraft | null>(null)

  // localStorage key for this user's in-progress draft of this season.
  const draftKey = user ? `aspire:reg:${seasonId}:${user.id}` : null

  // ── Embedded payment state ───────────────────────────────────────────────
  // Card-only, deferred: the payment Element mounts immediately on the payment
  // step and the registration row + PaymentIntent are created only on Pay (see
  // createIntent below). paymentValueCents mirrors the server-resolved charge
  // once created — the live amount the deferred form mounts with is computed in
  // PaymentStep from the current option/discount/credit.
  const [paymentValueCents, setPaymentValueCents] = useState(0)
  const [appliedSurchargeCents, setAppliedSurchargeCents] = useState(0)
  // The server's amountDueCents from the most recent submit (guest or authed
  // path) — stashed purely for the invite-share mismatch check below; never
  // used to compute what's charged.
  const [serverAmountDueCents, setServerAmountDueCents] = useState<number | null>(null)

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
  // Whether the captain-credit fetch below has settled (success, no-op, or
  // error) for a teamToken + signed-in visitor. Gates the step-viewed
  // analytics effect so it waits for the real team_captain/team_member
  // classification instead of firing early with a guess. `!teamToken` and
  // guest sessions never fetch, so they're settled from the start.
  const [captainCreditLoaded, setCaptainCreditLoaded] = useState(false)
  const captainCreditSettled = !teamToken || isGuest || captainCreditLoaded
  // The credit only applies to the captain's SELF registration (server gate:
  // familyMember.selfUserId === user.id) — never to a dependent registered
  // through the same account. Mirror that here so the payment step doesn't
  // show credit math the server would refuse.
  const effectiveCaptainCredit = selectedKey === "self" ? captainCredit : null
  // The personal invite link (`inviteeShareCents`) promised a specific share,
  // but the server only applies it when the registering email matches the
  // invitee it was minted for. If the registrant used a different email, the
  // server falls back to the full price — this flags that mismatch so
  // PaymentStep can explain the charge instead of silently showing full
  // price after a share was promised. Only meaningful post-submit, once
  // serverAmountDueCents is populated.
  const shareMismatch =
    teamToken != null &&
    inviteeShareCents != null &&
    !effectiveCaptainCredit &&
    serverAmountDueCents != null &&
    serverAmountDueCents !== inviteeShareCents
  // Same classification the step-viewed analytics effect below uses, hoisted
  // to a variable so it can also be threaded to ConfirmationStep/CompletionForm
  // (which otherwise defaults to "solo" and mislabels every team registration's
  // completion-step event).
  const regFlow: RegFlow = teamToken
    ? captainCredit != null
      ? "team_captain"
      : "team_member"
    : "solo"

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
      } finally {
        if (!cancelled) setCaptainCreditLoaded(true)
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

  // Rehydrate the guest adult-self draft stashed before a sign-in round trip
  // (see handleGuestSignInClick below). Guests get the three fields prefilled
  // once and the stash cleared; authed users just clear it — their profile
  // supersedes a stashed guest draft, and leaving it around risks it leaking
  // into a future anonymous session on this device.
  useEffect(() => {
    const draft = readGuestDraft(seasonId)
    if (!draft) return
    if (isGuest) {
      setGuestParentFirstName(draft.firstName)
      setGuestParentLastName(draft.lastName)
      setGuestParentEmail(draft.email)
    }
    clearGuestDraft(seasonId)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seasonId, isGuest])

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

  // Fetch the signed-in user's existing registrations for THIS season —
  // unconditional (not just on the wasCancelled/?payment=cancelled redirect)
  // so both the resume-payment card and the already-registered state render
  // on a normal, direct visit too (Task 5). Guests are excluded — they have
  // no account to look up and get their own friendly state via the
  // guest-checkout 409 path (see guestAlreadyRegistered above).
  useEffect(() => {
    if (isGuest) return
    let cancelled = false
    ;(async () => {
      try {
        const res = await fetch("/api/registrations")
        if (!res.ok) return
        const data = await res.json()
        const rows = (data.registrations ?? []) as Array<{
          id: string
          status: string
          paymentStatus: string
          waiverSigned: boolean
          amountDueCents: number
          season: { id: string }
          familyMember: { id: string }
        }>
        if (cancelled) return
        // This season only. Cancelled/refunded rows are never "existing" —
        // mirrors create-registration.ts's notInArray(["cancelled",
        // "refunded"]) filter, so a member can freely re-register after
        // cancelling or being refunded.
        const active = rows.filter(
          (r) =>
            r.season.id === seasonId &&
            r.status !== "cancelled" &&
            r.status !== "refunded",
        )
        const pendingUnpaid = active.find(
          (r) => r.status === "pending" && r.paymentStatus === "unpaid",
        )
        if (pendingUnpaid) {
          setResumableRegistrationId(pendingUnpaid.id)
          setResumableAmountDueCents(
            typeof pendingUnpaid.amountDueCents === "number"
              ? pendingUnpaid.amountDueCents
              : null,
          )
        }
        setActiveSeasonRegistrations(
          active.map((r) => ({
            id: r.id,
            status: r.status,
            paymentStatus: r.paymentStatus,
            waiverSigned: r.waiverSigned,
            familyMemberId: r.familyMember.id,
          })),
        )
      } catch {
        // swallow — fall back to normal wizard
      } finally {
        // Settled (success, non-ok response, or network error) — the main
        // loading gate below waits on this so the wizard never flashes the
        // normal Player step before a resume/already-registered state has
        // had a chance to resolve.
        if (!cancelled) setRegistrationsChecked(true)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [seasonId, isGuest])

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
    // until a method is picked. Land on the last step before payment (v1:
    // Agreements; v2: Player) to continue cleanly.
    const maxRestoreStep = Math.max(1, stepList.indexOf("payment"))
    setCurrentStep(Math.min(Math.max(d.currentStep ?? 1, 1), maxRestoreStep))
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
      // Only offer resume when there's meaningful progress past step 1 —
      // derived from the ACTIVE step list rather than the old hardcoded
      // STEP_AGREEMENTS=2, which quietly came to mean "Payment" once v2
      // became universal. A payment-step draft still counting as progress is
      // intentional: nothing is created until Pay, so resuming there is safe
      // and is exactly where an interrupted customer wants to land.
      const minProgressStep = stepNumberOf("player") + 1
      const hasProgress =
        (d.currentStep ?? 1) >= minProgressStep || Boolean(d.selectedKey)
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

  // Track each wizard step view (league analytics). Gated on
  // captainCreditSettled so a team-token visitor's flow is classified
  // team_captain/team_member with the SETTLED value — never fired early with
  // a guess, and never double-fired for the same step once it resolves.
  useEffect(() => {
    if (season && captainCreditSettled) trackRegistrationStepViewed({
      step: stepName,
      seasonId: season.id,
      flow: regFlow,
      variant: flowVariant,
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentStep, season, teamToken, captainCreditSettled])

  // Fire view_item once when entering the payment step
  useEffect(() => {
    if (stepName === "payment" && season) {
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

  // Focus the guest email field after "Register a different player instead"
  // sends the wizard back to step 1 — runs once step 1 has actually
  // re-rendered (stepName flips async with currentStep).
  useEffect(() => {
    if (focusGuestEmailOnMount && stepName === "player") {
      document.getElementById("guest-parent-email")?.focus()
      setFocusGuestEmailOnMount(false)
    }
  }, [focusGuestEmailOnMount, stepName])

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
      // Team-share base precedes the deposit branch, same ordering as the
      // valueCents sites above: a personal invite's share is paid in full
      // (no deposit concept), and — like those sites — a stale-draft
      // paymentOption:"deposit" must never override it. When teamToken is
      // set but the share isn't known yet (open joiner, or ref hasn't
      // resolved), full price is the correct preview base — open joiners
      // genuinely pay full price. Residual: an email-mismatch invitee (one
      // whose registering email doesn't match the invite the ref was minted
      // for) still previews against inviteeShareCents here even though the
      // server will redeem the discount against the full price instead —
      // the shareMismatch notice on PaymentStep is what surfaces that case,
      // not this preview.
      const purchaseAmountCents =
        teamToken != null && inviteeShareCents != null
          ? inviteeShareCents
          : paymentOption === "deposit" && depositValid(season)
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
    const confirmedRegistrationId =
      activeRegistrationIdRef.current ?? activeRegistrationId
    if (confirmedRegistrationId) {
      recordConfirmedPayment(confirmedRegistrationId, "succeeded")
    }
    clearDraft()
    setRegistrationComplete(true)
    setCurrentStep(stepNumberOf("confirm"))
  }

  const handlePaymentCancel = () => {
    // "Back" from the inline payment form returns to the previous wizard step.
    // Nothing was created (deferred) unless the customer already clicked Pay,
    // in which case any orphaned PaymentIntent self-expires on Stripe's side.
    // First back-out also offers the optional exit-reason chips (never blocks
    // the navigation itself).
    if (!exitChipsOfferedRef.current) {
      exitChipsOfferedRef.current = true
      setShowExitChips(true)
    }
    setCurrentStep((s) => Math.max(1, s - 1))
  }

  const handleResumePayment = () => {
    // The registration row already exists (a prior Pay-abandoned or failed
    // attempt left it pending+unpaid). Finishing payment for an EXISTING
    // registration lives on the dedicated pay-balance page — its card form
    // mounts against that registration — so send the signed-in customer there
    // rather than re-mounting a form in the wizard.
    if (!resumableRegistrationId) return
    setIsResumingPayment(true)
    window.location.href = `/dashboard/registrations/${resumableRegistrationId}/pay-balance`
  }

  // Deferred create-on-Pay: called from the inline card form's Pay button
  // (via createIntent). Creates the guest registration row + PaymentIntent and
  // returns the new client secret, or an error string the form surfaces.
  // Card-only (ACH is gone).
  const handleSubmitGuestCheckout = async (): Promise<CreateIntentResult> => {
    // v2 (now every season) defers the waiver to the post-payment completion
    // step, so the signed-waiver guard only applies to a v1 rollback.
    if (!season) return { error: "This season is still loading — try again." }
    if (flowVariant === "v1" && (!waiverAccepted || !waiverSignature))
      return { error: "Please review and sign the waiver before paying." }
    const category = "card" as const
    setIsSubmitting(true)
    setError(null)
    try {
      const mediaAuthOptOutsArr = Array.from(mediaAuthOptOuts)
      // Waiver deferral is the flowVariant axis and applies to every payload
      // shape below: v2 creates the row unsigned and the completion form signs
      // it after payment; v1 (rollback) carries the pre-payment signature.
      const guestWaiverFields =
        flowVariant === "v2"
          ? { waiverSigned: false as const }
          : { waiverSigned: true as const, waiverSignedBy: waiverSignature }
      const payload =
        adultSelfFlow
          ? {
              // Minimal adult self-registration: name + email only. DOB, gender
              // and the signed waiver are collected after payment via the
              // completion step (waiverSigned:false, no birthDate/waiverSignedBy).
              seasonId,
              registrant: {
                firstName: guestParentFirstName,
                lastName: guestParentLastName,
                email: guestParentEmail,
                isSelf: true as const,
              },
              smsConsent: guestSmsConsent,
              registrationType: paymentOption,
              ...guestWaiverFields,
              discountCode: discountCode || undefined,
              lookingForTeam,
              mediaAuthOptOuts: mediaAuthOptOutsArr,
              paymentMethodCategory: category,
              teamToken: teamToken ?? undefined,
            }
          : guestMode === "adult"
          ? {
              // Ambiguous-audience season where the guest picked "adult" on the
              // mode toggle: still a self-registration, so the `registrant`
              // shape (server analytics audience:"adult") — but the DOB is
              // asked up front here, since the minimal step is adultSelfFlow-only.
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
              ...guestWaiverFields,
              discountCode: discountCode || undefined,
              lookingForTeam,
              mediaAuthOptOuts: mediaAuthOptOutsArr,
              paymentMethodCategory: category,
              teamToken: teamToken ?? undefined,
            }
          : {
              // Youth: parent + child. The payload SHAPE is load-bearing — the
              // server keys `guest_checkout_started` audience:"youth" off it —
              // so a youth v2 registration keeps posting parent+child and only
              // the waiver fields move to post-payment.
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
              ...guestWaiverFields,
              discountCode: discountCode || undefined,
              mediaAuthOptOuts: mediaAuthOptOutsArr,
              paymentMethodCategory: category,
              teamToken: teamToken ?? undefined,
            }

      const res = await fetch("/api/registrations/guest-checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...phSessionHeader() },
        body: JSON.stringify(payload),
      })
      const data = await res.json()
      if (!res.ok) {
        if (data?.code === "already_registered") {
          // Friendly state instead of the generic error banner — see
          // `guestAlreadyRegistered` render branch below. Never paid: this
          // 409 fires before guest-checkout creates any Stripe PaymentIntent.
          // The benign error string just stops the caller; the UI already
          // switched to the friendly state.
          setGuestAlreadyRegistered(true)
          return { error: "already_registered" }
        }
        throw new Error(parseApiError(data, "Failed to complete registration"))
      }
      if (typeof data.amountDueCents === "number") {
        setServerAmountDueCents(data.amountDueCents)
      }
      if (data.clientSecret) {
        // Team-token branch precedes the deposit branch — see the resume-
        // payment site's comment for why (stale-draft paymentOption must
        // never bypass the server-resolved share/full-price amount).
        const valueCents =
          teamToken != null && typeof data.amountDueCents === "number"
            ? data.amountDueCents
            : paymentOption === "deposit" && depositValid(season!)
              ? season!.depositCents!
              : fullPriceCents(season!)
        const baseAfterDiscount = appliedDiscount
          ? valueCents - appliedDiscount.discountAmountCents
          : valueCents
        const surchargeCents = data.surchargeCents ?? 0
        const finalValueCents = baseAfterDiscount + surchargeCents

        rememberActiveRegistration(data.registrationId ?? null)
        setAppliedSurchargeCents(surchargeCents)
        setPaymentValueCents(finalValueCents)
        setPaymentTypeForTracking(paymentOption === "deposit" && depositValid(season!) ? "deposit" : "full")

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
        return { clientSecret: data.clientSecret }
      }
      if (data.paid) {
        // payment=success + registration are the params the dashboard's
        // PaymentSuccessBanner reads — `registered=` was consumed by nothing.
        window.location.href = `/dashboard?payment=success&registration=${data.registrationId}`
        return { error: "redirecting" }
      }
      if (data.waitlisted) {
        // The customer just entered card details — tell them plainly what
        // happened (season filled, no charge, they're on the list) instead of
        // silently bouncing to the dashboard with a param nothing reads.
        setWaitlistedAtCheckout(true)
        return { error: "waitlisted" }
      }
      const unexpected = "Unexpected response — please try again."
      setError(unexpected)
      return { error: unexpected }
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to complete registration"
      setError(message)
      return { error: message }
    } finally {
      setIsSubmitting(false)
    }
  }

  // "Register a different player instead" — leaves the already-registered
  // state, clears the email that collided (never the name fields — those
  // are still useful if this is actually a sibling), and sends the guest
  // back to step 1 with the email field focused.
  const handleRegisterDifferentPlayer = () => {
    setGuestAlreadyRegistered(false)
    setGuestParentEmail("")
    setCurrentStep(1)
    setFocusGuestEmailOnMount(true)
  }

  // Guest taps "Sign in" mid-wizard: stash the adult-self fields so the
  // round trip through /signin doesn't make them retype. Scoped to the v2
  // (adult-locked) guest flow only — those three fields are unambiguously
  // the adult registering themselves. The v1 flow's "about you" fields can
  // belong to a parent registering a child, and the child fields are never
  // eligible for this stash (see Global Constraints — adult self only).
  const handleGuestSignInClick = () => {
    // Stash whenever the guest is in ADULT mode — the fields are adult-self in
    // both the v2 minimal flow and v1's ambiguous-audience adult sub-mode.
    // Child mode never stashes (PII rule: adult self fields only).
    if (guestMode !== "adult") return
    stashGuestDraft({
      v: 1,
      seasonId,
      firstName: guestParentFirstName.trim(),
      lastName: guestParentLastName.trim(),
      email: guestParentEmail.trim(),
    })
  }

  // Deferred create-on-Pay: called from the inline card form's Pay button
  // (via createIntent) for signed-in registrants, and directly for the
  // $0-due captain/discount finalize path. Creates the registration row +
  // PaymentIntent and returns the new client secret, or an error string.
  // Card-only (ACH is gone).
  const handleSubmitRegistration = async (): Promise<CreateIntentResult> => {
    if (!selectedKey) return { error: "Select who you're registering first." }
    // v2 (now every season) has no pre-payment agreements step, so the waiver
    // is signed after payment — only a v1 rollback requires it here.
    if (flowVariant === "v1" && (!waiverAccepted || !waiverSignature))
      return { error: "Please review and sign the waiver before paying." }

    const category = "card" as const
    setIsSubmitting(true)
    setError(null)

    const mediaAuthOptOutsArr = Array.from(mediaAuthOptOuts)
    // v2 defers the waiver: create the row unsigned; v1 carries the signature.
    const waiverFields =
      flowVariant === "v2"
        ? { waiverSigned: false as const }
        : { waiverSigned: true as const, waiverSignedBy: waiverSignature }
    const registrationBody =
      selectedKey === "self"
        ? {
            seasonId,
            registerSelf: true,
            registrationType: paymentOption,
            ...waiverFields,
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
            ...waiverFields,
            discountCode: discountCode || undefined,
            mediaAuthOptOuts: mediaAuthOptOutsArr,
            teamToken: teamToken ?? undefined,
          }

    try {
      // Step 1: Create registration
      const regResponse = await fetch("/api/registrations", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...phSessionHeader() },
        body: JSON.stringify(registrationBody),
      })

      if (!regResponse.ok) {
        const data = await regResponse.json().catch(() => null)
        if (data?.code === "already_registered") {
          // Race/edge fallback: the up-front GET /api/registrations effect
          // found nothing (another tab/device beat us, or the fetch was
          // stale) but the server still knows better. Adult-self flows are
          // self-only, so the whole wizard is done — same full-screen state
          // as the up-front check. Youth must NOT be globally blocked: the
          // 409 is about ONE child, and the parent may still be here to
          // register a sibling — so it gets a named inline message naming
          // that player, and the wizard stays usable.
          if (adultSelfFlow) {
            setRaceAlreadyRegistered(true)
          } else {
            setError(
              teamToken != null
                ? `${selectedDisplayName || "This player"} is already registered for this season. To appear on ${teamName ?? "the team"}'s roster, ask your captain to add them — nothing more to pay through this link.`
                : `${selectedDisplayName || "This player"} is already registered for this season.`,
            )
          }
          return { error: "already_registered" }
        }
        throw new Error(parseApiError(data, "Failed to complete registration"))
      }

      const regData = await regResponse.json()
      if (typeof regData.amountDueCents === "number") {
        setServerAmountDueCents(regData.amountDueCents)
      }

      if (regData.requiresPayment) {
        // Step 2: Create Stripe checkout session
        const checkoutResponse = await fetch("/api/payments/create-checkout", {
          method: "POST",
          headers: { "Content-Type": "application/json", ...phSessionHeader() },
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
          // Team-token branch precedes the deposit branch — see the resume-
          // payment site's comment for why (stale-draft paymentOption must
          // never bypass the server-resolved share/full-price amount).
          const valueCents = effectiveCaptainCredit
            ? effectiveCaptainCredit.dueCents
            : teamToken != null && typeof regData.amountDueCents === "number"
              ? regData.amountDueCents
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

          rememberActiveRegistration(regData.registration.id)
          setAppliedSurchargeCents(surchargeCents)
          setAppliedCreditCents(creditCents)
          setPaymentValueCents(finalValueCents)
          setPaymentTypeForTracking(paymentOption === "deposit" && depositValid(season!) ? "deposit" : "full")

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
          return { clientSecret: checkoutData.clientSecret }
        }
      }

      // Season filled — the row was created as waitlisted, nothing charged.
      // Show the explicit waitlist state, NOT the "Your spot is locked!"
      // confirmation (which would lie to an unpaid, waitlisted customer).
      if (regData.registration.status === "waitlisted") {
        setWaitlistedAtCheckout(true)
        return { error: "waitlisted" }
      }
      // No payment required (zero-due) — go straight to confirmation.
      // Must still set activeRegistrationId: ConfirmationStep's inline
      // CompletionForm (v2's post-payment waiver capture) gates on
      // `registrationId` being present, and zero-due registrations never
      // pass through the clientSecret branch above that normally sets it.
      rememberActiveRegistration(regData.registration.id)
      clearDraft()
      setRegistrationComplete(true)
      setCurrentStep(stepNumberOf("confirm"))
      // The wizard already advanced to the confirmation step. The benign
      // error just stops the deferred caller — there's no client secret to
      // confirm against.
      return { error: "completed" }
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to complete registration"
      setError(message)
      return { error: message }
    } finally {
      setIsSubmitting(false)
    }
  }

  // Deferred create-on-Pay callback handed to the inline card form: the
  // registration row + PaymentIntent are created only when the customer clicks
  // Pay, then confirmed against the returned client secret.
  const createIntent = (): Promise<CreateIntentResult> =>
    isGuest ? handleSubmitGuestCheckout() : handleSubmitRegistration()

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
    // The adult-self guest step collects name + email only; the registrant's
    // own DOB/gender and the waiver are deferred to the post-payment
    // completion. Youth falls through to the full validation below — the
    // child's DOB is still asked (and required) BEFORE payment, because it
    // decides age-group eligibility.
    if (adultSelfFlow) {
      return Object.keys(errors).length > 0 ? errors : null
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
    if (stepName === "player" && isGuest) {
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
    switch (stepName) {
      case "player":
        // Guests: always allow the tap — handleContinue validates and surfaces
        // per-field errors instead of a dead button.
        if (isGuest) return true
        return selectedKey !== null
      case "agreements":
        // Waiver is the gate; media consent below it is optional. The full
        // legal text being collapsed doesn't change what's required.
        return waiverAccepted && waiverSignature.length >= 2
      case "payment":
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

  const isAgeEligible = (birthDate: string | null, currentSeason: Season): boolean => {
    if (!currentSeason.ageGroup) return true
    // DOB not known yet (post-payment deferral) — treat as unknown-yet-
    // allowed; the post-payment age check owns enforcement.
    if (!birthDate) return true
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

  // ── Already-registered derivations (Task 5) ────────────────────────────────
  // A registration row "blocks" re-registration exactly when the server's
  // createRegistration would 409 on it: any non-cancelled/refunded row that
  // ISN'T pending+unpaid (pending+unpaid is the resumable case, handled
  // separately by resumableRegistrationId above).
  const isBlockingRegistration = (r: ActiveSeasonRegistration) =>
    !(r.status === "pending" && r.paymentStatus === "unpaid")

  const paymentStatusLabel = (paymentStatus: string): string => {
    switch (paymentStatus) {
      case "paid":
        return "paid"
      case "deposit_paid":
        return "deposit paid"
      case "partial_refund":
        return "partially refunded"
      case "refunded":
        return "refunded"
      default:
        return "payment pending"
    }
  }

  // The signed-in user's own family-member row, if resolvePerson has already
  // created one (i.e. they've self-registered somewhere before). `null`
  // means no self row exists yet, so there is nothing to block on.
  const selfFamilyMemberId =
    familyMembers.find((m) => m.selfUserId === user?.id)?.id ?? null

  // Adult-self flows: the self row's blocking registration for THIS season,
  // if any — drives the full-screen "You're already in" short-circuit.
  const selfBlockingRegistration =
    selfFamilyMemberId != null
      ? activeSeasonRegistrations.find(
          (r) => r.familyMemberId === selfFamilyMemberId && isBlockingRegistration(r),
        ) ?? null
      : null

  // Youth / dependent-capable flows: every family member (self or dependent)
  // who already has a blocking registration for this season — WhoStep marks
  // these "Registered ✓" and disables selection, without blocking the rest of
  // the wizard (a parent may still register a different, unregistered child).
  const registeredMemberIds = new Set(
    activeSeasonRegistrations.filter(isBlockingRegistration).map((r) => r.familyMemberId),
  )

  // Auto-select "Myself" for the adult-self flow. Adult leagues are self-only
  // (the Add-Player button is hidden and self is the sole registerable
  // option), so making the customer tap the lone card before Continue is pure
  // friction — costly for the returning users ads re-engage. Youth is excluded
  // on purpose: there the parent genuinely has to pick WHICH child.
  // Skipped when something is already selected, or when the self row is already
  // registered for this season (the short-circuit below owns that case).
  useEffect(() => {
    if (isGuest || !adultSelfFlow) return
    if (!registrationsChecked || isLoading) return
    if (selectedKey !== null || !user) return
    if (selfBlockingRegistration) return
    setSelectedKey("self")
  }, [
    isGuest,
    adultSelfFlow,
    registrationsChecked,
    isLoading,
    selectedKey,
    user,
    selfBlockingRegistration,
  ])

  // ── Loading / error states ─────────────────────────────────────────────────

  // Also waits on registrationsChecked (Task 5) so the wizard never flashes
  // the normal Player step before the resume/already-registered check has
  // had a chance to resolve — that fetch is independent of the season +
  // family-members load isLoading otherwise tracks.
  if (isLoading || !registrationsChecked) {
    // min-h matches the reserved skeleton height in RegisterExperience so
    // neither loading state collapses when the wizard content mounts.
    return (
      <div className="flex items-center justify-center min-h-[70vh]">
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
  // Adult-self (self-only) flows show the resume card on ANY return: there is
  // exactly one possible registrant, so an unfinished payment for this season
  // is unambiguously the thing this visitor came back for.
  //
  // Youth keeps the narrower wasCancelled-only trigger, and this is the whole
  // reason the axis was split. A parent with an unfinished payment for child A
  // who comes back to register child B would otherwise be hijacked by A's
  // resume card — the wizard would hide the Player step entirely and push them
  // to pay for the wrong kid. A's row is not lost: it still resumes
  // server-side the moment A is re-selected, and the ?payment=cancelled
  // redirect (wasCancelled) still surfaces the card when the parent really did
  // just bail out of Stripe.
  const showResumeCard =
    Boolean(resumableRegistrationId) && (adultSelfFlow || wasCancelled)

  if (showResumeCard) {
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
              onClick={() => {
                setResumableRegistrationId(null)
                setResumableAmountDueCents(null)
              }}
              disabled={isResumingPayment}
            >
              Start over
            </Button>
          </div>
        </div>
      </div>
    )
  }

  // ── Already-registered early return (adult self, Task 5) ───────────────────
  // Adult-locked seasons are self-only, so a blocking registration on the
  // self row means THIS wizard is done — no steps to render. Youth /
  // dependent-capable flows never hit this: they only get the per-person
  // WhoStep marker below, since a parent whose first child is already
  // registered is very often here precisely to register the second one.
  // Mutually exclusive with the resume card above (the DB's active-row
  // unique index means a member can't be both pending+unpaid and blocking
  // for the same season).
  if (adultSelfFlow && !registrationComplete && (selfBlockingRegistration || raceAlreadyRegistered)) {
    return (
      <div className="mx-auto max-w-xl">
        <div className="rounded-xl border border-ink/10 bg-cream px-6 py-8 shadow-sm text-center">
          <h2 className="text-2xl font-medium text-ink mb-2">You're already in ✓</h2>
          <p className="text-ink/80 mb-6">
            {selfBlockingRegistration
              ? `${selfBlockingRegistration.status === "waitlisted" ? "Waitlisted" : "Registered"} · ${paymentStatusLabel(selfBlockingRegistration.paymentStatus)} · waiver ${selfBlockingRegistration.waiverSigned ? "signed" : "pending"}`
              : "You already have a registration for this season."}
          </p>
          <Button asChild>
            <a href="/dashboard">View my registration</a>
          </Button>
        </div>
      </div>
    )
  }

  // ── Draft-restore early return ─────────────────────────────────────────────
  // Shown only when there's no further-along cancelled-payment registration to
  // resume (that card takes precedence).

  if (restorable && !showResumeCard) {
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
            style={{ width: `${((currentStep - 1) / (steps.length - 1)) * 100}%` }}
          />

          {steps.map((step) => {
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
        {waitlistedAtCheckout ? (
          /* Season filled at Pay-time (deferred capacity check). The customer
             may have just typed card details — lead with "not charged". */
          <div className="text-center py-8">
            <h3 className="font-display text-2xl text-ink mb-2">
              This season just filled up
            </h3>
            <p className="text-ink-muted mb-4 max-w-md mx-auto">
              The last open spots went while you were checking out.{" "}
              <strong className="text-ink">Your card was not charged.</strong>{" "}
              You're on the waitlist — we'll email you the moment a spot opens,
              with a link to complete your registration.
            </p>
            <div className="flex justify-center gap-3">
              <Button asChild variant="outline" className="border-border text-ink hover:bg-cream-2">
                <a href="/dashboard">View my dashboard</a>
              </Button>
              <Button asChild className="bg-primary hover:bg-primary/90">
                <a href="/programs">Browse other programs</a>
              </Button>
            </div>
          </div>
        ) : guestAlreadyRegistered ? (
          /* Guest repeat-registrant friendly state — replaces the step
             content entirely (never the generic error banner). Disclosure
             rule: confirms only that this email has a spot, nothing about
             the underlying registration. */
          <div className="text-center py-8">
            <h3 className="font-display text-2xl text-ink mb-2">
              You're already registered 🎉
            </h3>
            <p className="text-ink-muted mb-6 max-w-md mx-auto">
              {teamToken != null
                ? `This email already has a spot in this season. ${
                    teamName
                      ? `To appear on ${teamName}'s roster, ask your captain to add you.`
                      : "To appear on the team's roster, ask your captain to add you."
                  } Nothing more to pay through this link.`
                : "This email has a spot in this division. We've sent you a link to view and manage it — no sign-in needed."}
            </p>
            <div className="mx-auto max-w-sm rounded-xl border border-border bg-cream-2 px-4 py-3 text-sm text-ink mb-6">
              Check your email — the link opens your registration.
            </div>
            <Button
              variant="ghost"
              onClick={handleRegisterDifferentPlayer}
              className="text-ink-muted hover:text-ink"
            >
              Register a different player instead
            </Button>
          </div>
        ) : (
        <>
        {/* Optional exit-reason ask, shown once after backing out of payment. */}
        {showExitChips && stepName !== "payment" && !registrationComplete && season && (
          <ExitReasonChips
            seasonId={season.id}
            flow={regFlow}
            variant={flowVariant}
            onClose={() => setShowExitChips(false)}
          />
        )}
        {/* Step 1: Who are you registering? (authenticated path) */}
        {stepName === "player" && !isGuest && !showAddMember && (
          <WhoStep
            selfOption={
              // Adult-self flows defer DOB to post-payment, so "Myself" is
              // selectable even with no birthDate on file — otherwise a
              // returning user hits the "Complete your profile" wall before
              // payment. Youth keeps the wall: a parent's own DOB is only
              // asked when they're actually registering themselves, and their
              // kid's DOB is collected on the dependent instead.
              completedBirthDate || adultSelfFlow
                ? {
                    firstName: completedProfile.firstName || (user?.firstName ?? ""),
                    lastName: completedProfile.lastName || (user?.lastName ?? ""),
                    ageEligible: isAgeEligible(completedBirthDate, season),
                    registered:
                      selfFamilyMemberId != null && registeredMemberIds.has(selfFamilyMemberId),
                  }
                : null
            }
            deferBirthDate={adultSelfFlow}
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
            dependents={familyMembers
              // The signed-in user's own self-registration row belongs on
              // the Myself card above, not as a lookalike dependent entry.
              .filter((m) => m.selfUserId !== user?.id)
              .map((m) => ({
                id: m.id,
                firstName: m.firstName,
                lastName: m.lastName,
                birthDate: m.birthDate,
                ageEligible: isAgeEligible(m.birthDate, season),
                registered: registeredMemberIds.has(m.id),
              }))}
            selectedKey={selectedKey}
            onSelect={setSelectedKey}
            onAddDependent={() => setShowAddMember(true)}
          />
        )}

        {/* Add dependent inline form (authenticated path, step 1) */}
        {stepName === "player" && !isGuest && showAddMember && (
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
        {stepName === "player" && isGuest && (
          <GuestInfoStep
            seasonId={seasonId}
            mode={guestMode}
            onModeChange={setGuestMode}
            lockedMode={lockedGuestMode}
            // Minimal = name + email only, adult-self only. Youth renders the
            // full parent + child form here (child DOB included); the waiver
            // step simply no longer follows it.
            minimal={adultSelfFlow}
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
            onSignInClick={handleGuestSignInClick}
          />
        )}

        {/* Step 2: Agreements — waiver (required) + media consent (optional).
            UNREACHABLE under the live v2 step list (the waiver is deferred to
            the post-payment completion form for every season). Kept wired up
            so flipping ACTIVE_FLOW_VARIANT back to "v1" restores the old
            pre-payment flow in one line. */}
        {stepName === "agreements" && (
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
        {stepName === "payment" && (
          <div className="space-y-6">
            {/* v2 has no agreements interstitial, so recap what's being bought
                right above the payment options (name · price · venue). */}
            {flowVariant === "v2" && (
              <div className="rounded-xl border border-border bg-cream-2 px-4 py-3">
                <p className="text-sm font-medium text-ink">{season.name}</p>
                <p className="text-xs text-ink-muted">
                  ${fullPrice(season)} · {season.location.name}
                </p>
              </div>
            )}
          <PaymentStep
            seasonName={season.name}
            seasonPrice={fullPrice(season)}
            seasonPriceCents={fullPriceCents(season)}
            earlyBirdActive={season.earlyBirdActive ?? false}
            seasonDeposit={season.deposit}
            seasonDepositCents={season.depositCents}
            allowDeposit={season.allowDeposit}
            paymentOption={paymentOption}
            captainCredit={effectiveCaptainCredit}
            teamShareCents={!effectiveCaptainCredit && teamToken ? inviteeShareCents ?? null : null}
            shareMismatch={shareMismatch}
            onCompleteZeroDue={() => {
              // Zero-due (captain deposit credit or a discount that zeroes the
              // bill): no card form, no Stripe intent — the server finalizes
              // the row as paid. Fire-and-forget; the submit fns drive the
              // redirect / confirmation-step transition themselves.
              void (isGuest ? handleSubmitGuestCheckout() : handleSubmitRegistration())
            }}
            isCreatingSession={isSubmitting}
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
            createIntent={createIntent}
            publishableKey={stripePublishableKey}
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
            checkoutPaymentType={paymentTypeForTracking}
            paymentReturnUrl={`${window.location.origin}/payment/return`}
            onPaymentSuccess={handlePaymentSuccess}
            onPaymentCancel={handlePaymentCancel}
          />
          </div>
        )}

        {/* Step 4: Confirmation */}
        {stepName === "confirm" && registrationComplete && (
          <ConfirmationStep
            seasonName={season.name}
            seasonId={season.id}
            registrantDisplayName={
              isGuest
                ? guestMode === "adult"
                  ? `${guestParentFirstName} ${guestParentLastName}`.trim()
                  : `${guestChildFirstName} ${guestChildLastName}`.trim()
                : selectedDisplayName
            }
            isSelf={isGuest ? guestMode === "adult" : selectedKey === "self"}
            registrationId={activeRegistrationId}
            flow={regFlow}
            waiverSigned={flowVariant === "v1"}
            // Only the adult-self flow defers DOB to this post-payment step —
            // for BOTH guests (minimal name+email step) and signed-in users
            // without a stored birthDate (previously walled off by "Complete
            // your profile" before payment). Youth always has the player's DOB
            // by now (guest child form / dependent record), so it must pass
            // false or the parent would be asked for a birth date twice.
            needsBirthDate={
              adultSelfFlow &&
              (isGuest || (selectedKey === "self" && !completedBirthDate))
            }
          />
        )}
        </>
        )}
      </div>

      {/* Navigation — the payment step owns its own Back (the inline card form,
          or the zero-due block), so the wizard-level nav is hidden there.
          Hidden entirely for the already-registered friendly state, which has
          its own action. */}
      {!guestAlreadyRegistered && stepName !== "confirm" && stepName !== "payment" && (
        <div className="mt-6 flex items-center justify-between">
          <Button
            variant="ghost"
            onClick={() => setCurrentStep(currentStep - 1)}
            disabled={stepName === "player" || isSubmitting}
            className="text-ink-muted hover:text-ink"
          >
            <ChevronLeft className="w-4 h-4 mr-1" />
            Back
          </Button>

          {currentStep < stepNumberOf("payment") && (
            <div className="flex flex-col items-end gap-1.5">
              <Button
                onClick={handleContinue}
                disabled={!canProceed()}
                className="bg-primary hover:bg-primary/90"
              >
                Continue
                <ChevronRight className="w-4 h-4 ml-1" />
              </Button>
              {stepName === "player" && isGuest && guestFieldErrors && (
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
