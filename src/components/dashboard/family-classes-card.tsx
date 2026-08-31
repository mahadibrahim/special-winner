"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { ErrorBanner } from "@/components/ui/error-banner"
import { EmptyState } from "@/components/ui/empty-state"
import { LoadingSkeleton } from "@/components/ui/loading-skeleton"
import { toast } from "sonner"
import { useHydrationBeacon } from "@/lib/hooks/use-hydration-beacon"
import { DashboardCard } from "@/components/dashboard/shell/DashboardCard"
import type { StatusTone } from "@/lib/dashboard/dashboard-ui"
import { DROPIN_WAIVER_TEXT } from "@/lib/dropin/waiver-text"
import { waiverAssentSentence } from "@/lib/consents/waiver-consent-language"

/**
 * Family dashboard — per-child class membership card (Task 7 of the youth
 * classes UX plan). Mounts `client:load` in family.astro's "What you're
 * part of" section, above `<ChildrenOverview client:load/>`.
 *
 * Fetches `/api/classes/summary` once and renders one `DashboardCard` per
 * child who holds a class membership, has active pack/block credits
 * (`credits`, Task 12 — the class-purchase-ladder's non-membership rungs),
 * OR has used their org trial (`trialUsed`). Children with none of the
 * three render nothing — `ChildrenOverview` already covers the plain "no
 * classes yet" case, so duplicating that here would be noise. The whole
 * component renders `null` when zero children qualify (no empty section, no
 * dangling heading).
 *
 * CREDITS: every qualifying child's card also shows its active credit
 * grants inline (`CreditLines`) — a MEMBER can be sitting on leftover pack/
 * block credits too, not just a non-member. A child with credits but no
 * membership gets its own `CreditChildCard`, whose "Book a session" CTA
 * opens the same `MakeUpModal` as the membership card: `POST /api/classes/
 * book { kind: "member" }` already spends a credit transparently when
 * there's no membership allotment to draw from first (see
 * src/lib/classes/credits.ts), so no separate booking UI is needed.
 *
 * WAIVER NUDGE: a child who has spendable credits but no VALID waiver
 * (`!hasWaiverOnFile` from the summary endpoint, which is now the annual
 * validity predicate — src/lib/consents/liability.ts) gets an amber nudge
 * pointing at the same modal — their next booking attempt is what actually
 * surfaces the guardian waiver step (see MakeUpModal's `waiver_required`
 * handling below), so the nudge only needs to explain what's coming and
 * share the trigger, not engineer a special modal entry state.
 *
 * The condition used to also require `!hasEverBooked` ("never been through a
 * booking flow"), on the assumption that anyone who had booked was covered
 * forever. With a 365-day waiver that assumption inverts: a veteran family
 * whose signature lapsed is exactly who must be nudged, and they have years
 * of booking history. Validity alone decides.
 *
 * PACK SUCCESS (`?pack=success&child=…`): this island is also the consumer of
 * the pack-purchase Checkout return URL (see src/pages/api/classes/packs/
 * purchase.ts's `success_url`). Stripe's redirect routinely beats the webhook
 * that writes the credit grant, so the top-level component acknowledges the
 * payment immediately with `PackSuccessBanner` and re-reads
 * /api/classes/summary on a short backoff ladder until the child's credits
 * appear (`PACK_SETTLE_DELAYS_MS` — runBlockFlow's settling approach in
 * choose-slot.tsx, in miniature), degrading to an honest "still processing"
 * line if they don't. The params are stripped via `history.replaceState` so a
 * refresh never re-triggers the ladder.
 *
 * Field note: the summary endpoint (src/pages/api/classes/summary.ts) does
 * NOT expose a membership renewal/period-end date or the org's cancellation
 * cutoff window — both were checked against the actual route rather than
 * assumed. Renewal date is simply not rendered (nothing to show); the
 * cancel confirm below uses generic "before the cancellation window" copy
 * per the task brief rather than inventing a number.
 *
 * Two actions live in a modal (`MakeUpModal`) or delegate to an existing
 * page (`Change home slot` → the Task-3/4 choose-slot page, which already
 * has switch semantics — never a second slot-picker UI here). `Cancel`
 * posts directly. Every async flow uses explicit params (never a stale
 * `child` read off state) and a monotonic generation counter inside the
 * modal, mirroring trial-booking.tsx's documented stale-closure fix.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface SummaryMembership {
  tierName: string
  status: "active" | "paused" | "past_due" | "incomplete"
  classAllotmentRemaining: number | "unlimited"
}

interface SummaryEnrollment {
  id: string
  templateId: string
  templateName: string
  weekday: number
  startTime: string
}

interface SummaryNextSession {
  sessionId: string
  startsAt: string
  bookingId: string
}

interface SummaryCredit {
  source: "pack" | "block"
  remaining: number
  expiresAt: string
  label: string
}

interface SummaryChild {
  familyMemberId: string
  name: string
  membership: SummaryMembership | null
  enrollment: SummaryEnrollment | null
  nextSession: SummaryNextSession | null
  trialUsed: boolean
  credits: SummaryCredit[]
  /** Annual validity, not "has ever signed" — a signature older than the
   *  365-day window reads false here. */
  hasWaiverOnFile: boolean
}

interface ScheduleSlot {
  templateId: string
  name: string
  sportLabel: string | null
  weekday: number
  startTime: string
  durationMins: number
  minAge: number | null
  maxAge: number | null
  locationName: string | null
  venueName: string | null
  capacity: number
  enrolledCount: number
  spotsLeft: number
}

interface ScheduleSession {
  id: string
  templateId: string
  startsAt: string
  endsAt: string
  capacity: number
  bookedCount: number
  spotsLeft: number
}

interface FamilyMemberRow {
  id: string
  birthDate: string | null
}

interface TierBenefits {
  classes_per_month?: number
  unlimited_classes?: boolean
  [key: string]: unknown
}

interface MembershipTier {
  id: string
  monthlyPriceCents: number | null
  benefits: TierBenefits
}

// ---------------------------------------------------------------------------
// Helpers — small pure functions duplicated per repo convention (see
// choose-slot.tsx / trial-booking.tsx / class-tiers.tsx header comments):
// each client island keeps its own copies rather than importing across
// files that may pull in server-only dependencies.
// ---------------------------------------------------------------------------

const WEEKDAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]

function formatDayTime(weekday: number, startTime: string): string {
  const day = WEEKDAY_NAMES[weekday] ?? `Day ${weekday}`
  const [hourStr, minuteStr] = startTime.slice(0, 5).split(":")
  const hour = Number(hourStr)
  const minute = Number(minuteStr)
  if (Number.isNaN(hour) || Number.isNaN(minute)) return `${day} ${startTime.slice(0, 5)}`
  const period = hour >= 12 ? "PM" : "AM"
  const hour12 = hour % 12 === 0 ? 12 : hour % 12
  return `${day} ${hour12}:${String(minute).padStart(2, "0")} ${period}`
}

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  })
}

/** Mirrors ageOnDate in src/lib/classes/book-child.ts exactly. */
function ageOnDate(birthDate: string, onDate: Date): number {
  const [by, bm, bd] = birthDate.split("-").map(Number)
  let age = onDate.getUTCFullYear() - by
  const monthDiff = onDate.getUTCMonth() + 1 - bm
  if (monthDiff < 0 || (monthDiff === 0 && onDate.getUTCDate() < bd)) {
    age -= 1
  }
  return age
}

/** Mirrors isAgeIneligible in src/lib/classes/enrollment.ts (inverted). */
function isAgeEligible(slot: ScheduleSlot, age: number | null): boolean {
  if (age === null) return true
  if (slot.minAge !== null && age < slot.minAge) return false
  if (slot.maxAge !== null && age > slot.maxAge) return false
  return true
}

/** Mirrors isClassTier in class-tiers.tsx. */
function isClassTier(tier: MembershipTier): boolean {
  const benefits = tier.benefits ?? {}
  const classesPerMonth =
    typeof benefits.classes_per_month === "number" ? benefits.classes_per_month : 0
  return classesPerMonth > 0 || benefits.unlimited_classes === true
}

/** Mirrors fmtDollars in class-tiers.tsx. */
function fmtDollars(cents: number | null): string | null {
  if (cents === null || cents === undefined) return null
  const dollars = cents / 100
  const hasCents = cents % 100 !== 0
  return `$${dollars.toLocaleString(undefined, {
    minimumFractionDigits: hasCents ? 2 : 0,
    maximumFractionDigits: hasCents ? 2 : 0,
  })}`
}

/** "2026-09-15T00:00:00.000Z" → "Sep 15" — short civil-date, no year/time
 *  (matches class-purchase-ladder.tsx's `formatCivilDate` grammar for the
 *  same "expires <date>" phrasing, but this one reads a real timestamp
 *  rather than a plain civil date string). */
function formatShortDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" })
}

function creditLine(credit: SummaryCredit): string {
  const sessions = `${credit.remaining} session${credit.remaining === 1 ? "" : "s"} left`
  return `${sessions} · ${credit.label} · expires ${formatShortDate(credit.expiresAt)}`
}

/** Best-effort remaining-credits count for the "N left" success copy,
 *  computed from the summary's PRE-booking `credits` snapshot (the modal
 *  never learns which specific grant a spend hit — `POST /api/classes/book`
 *  returns only `paymentMethod`, not a grant id — so this sums every active
 *  grant's balance and subtracts the one session this booking just spent).
 *  `onBooked()` triggers a real refetch right after, so this number is
 *  shown only for the instant before that lands; it is never persisted. */
function remainingCreditsAfterSpend(credits: SummaryCredit[]): number {
  const totalBefore = credits.reduce((sum, c) => sum + c.remaining, 0)
  return Math.max(0, totalBefore - 1)
}

/** One line per active credit grant — shared between the membership card
 *  (a member can also be sitting on leftover pack/block credits) and the
 *  credit-only card below, so the two never drift apart on copy. */
function CreditLines({ credits }: { credits: SummaryCredit[] }) {
  if (credits.length === 0) return null
  return (
    <div className="space-y-0.5">
      {credits.map((credit, i) => (
        <p key={`${credit.source}-${credit.label}-${i}`} className="text-xs text-ink-2">
          {creditLine(credit)}
        </p>
      ))}
    </div>
  )
}

/** Amber "sign the waiver first" nudge — shown when a child has spendable
 *  credits but no waiver inside the annual window. Clicking it opens the same
 *  make-up modal `onOpen` opens for the "Book a session" CTA: the modal's own
 *  booking attempt is what actually surfaces the waiver step (see
 *  MakeUpModal's `waiver_required` handling), so this nudge doesn't need to
 *  engineer a special modal entry state — it just explains what's about to
 *  happen and shares the trigger.
 *
 *  Copy is deliberately first-timer-neutral: waivers now expire yearly, so
 *  this fires for lapsed veteran families too, and "activate bookings" read
 *  like a one-time setup step they'd already done. "Annual" is also the
 *  honest reason, which pre-empts the "but I signed already" reply. */
function WaiverNudge({ onOpen }: { onOpen: () => void }) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="block text-left text-xs font-medium text-amber-800 bg-amber-50/80 border border-amber-200 rounded-lg px-2.5 py-1.5 hover:bg-amber-100/80"
    >
      Sign this year's waiver to book classes →
    </button>
  )
}

// ---------------------------------------------------------------------------
// Pack-purchase settling banner (`?pack=success&child=…`)
// ---------------------------------------------------------------------------

/** Backoff ladder for the post-Checkout webhook settle, deliberately shorter
 *  than choose-slot.tsx's `NO_MEMBERSHIP_RETRY_DELAYS_MS` ([2000, 4000, 8000]):
 *  nothing here is BLOCKED on the credits landing (unlike the block flow,
 *  which must actually book a session before it can report success), so the
 *  page degrades to an honest "still processing" line rather than making the
 *  parent stare at a spinner for 14 seconds. */
const PACK_SETTLE_DELAYS_MS = [2000, 5000]

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

type PackSettleStatus = "settling" | "settled" | "processing"

/** The acknowledgment a pack buyer sees when Stripe's success redirect beats
 *  the `checkout.session.completed` webhook that actually writes the credit
 *  grant. Without it the buyer lands on a dashboard that looks exactly like
 *  the one they left — no card, no credits, no sign the payment worked. */
function PackSuccessBanner({ status }: { status: PackSettleStatus }) {
  const message =
    status === "settled"
      ? "Payment received — your class credits are ready to use."
      : status === "processing"
        ? "Payment received — your class credits are still processing and will appear shortly."
        : "Payment received — your class credits will appear in a moment."
  return (
    <div
      role="status"
      aria-live="polite"
      data-pack-success-banner={status}
      className="flex items-start gap-2 rounded-xl border border-emerald-200 bg-emerald-50/80 px-3 py-2.5 text-sm font-medium text-emerald-900"
    >
      {status === "settling" && (
        <span
          className="mt-0.5 size-3.5 shrink-0 rounded-full border-2 border-emerald-600 border-t-transparent animate-spin"
          aria-hidden="true"
        />
      )}
      <span>{message}</span>
    </div>
  )
}

function allotmentLabel(remaining: number | "unlimited"): string {
  if (remaining === "unlimited") return "Unlimited classes this month"
  return `${remaining} class${remaining === 1 ? "" : "es"} left this month`
}

function statusBadge(status: SummaryMembership["status"]): { label: string; tone: StatusTone } {
  switch (status) {
    case "active":
      return { label: "Active", tone: "confirmed" }
    case "past_due":
      return { label: "Past due", tone: "action" }
    case "paused":
      return { label: "Paused", tone: "pending" }
    case "incomplete":
      return { label: "Setting up", tone: "pending" }
  }
}

async function parseJson(res: Response): Promise<Record<string, unknown>> {
  try {
    return (await res.json()) as Record<string, unknown>
  } catch {
    return {}
  }
}

// ---------------------------------------------------------------------------
// Make-up booking modal
// ---------------------------------------------------------------------------

type ModalPhase =
  | "loading"
  | "load_error"
  | "picking"
  | "booking"
  | "waiver"
  | "allotment_exhausted"
  | "paying"
  | "success"

interface ExhaustedOffer {
  session: ScheduleSession
  memberRateCents: number
}

interface MakeUpModalProps {
  child: SummaryChild
  open: boolean
  onClose: () => void
  /** Called once a make-up booking actually lands, so the parent card can
   *  refresh /api/classes/summary (new nextSession, allotment used). */
  onBooked: () => void
}

function MakeUpModal({ child, open, onClose, onBooked }: MakeUpModalProps) {
  const [phase, setPhase] = useState<ModalPhase>("loading")
  const [loadError, setLoadError] = useState<string | null>(null)
  const [flowError, setFlowError] = useState<string | null>(null)

  const [slots, setSlots] = useState<ScheduleSlot[]>([])
  const [sessions, setSessions] = useState<ScheduleSession[]>([])
  const [childAge, setChildAge] = useState<number | null>(null)

  const [pendingSession, setPendingSession] = useState<ScheduleSession | null>(null)
  const [exhaustedOffer, setExhaustedOffer] = useState<ExhaustedOffer | null>(null)
  const [bookedSession, setBookedSession] = useState<ScheduleSession | null>(null)
  /** `paymentMethod` off a successful booking response (`"member_allotment"`
   *  | `"pack_credit"` | `"trial"`), so the success copy can say WHICH
   *  thing was spent rather than a bare "booked" — mirrors
   *  class-dropin-modal.tsx's identical `paidWith` state. Null on the
   *  `already_booked` soft-success path (no real spend to report) and
   *  reset on every fresh `load()`. */
  const [paidWith, setPaidWith] = useState<string | null>(null)
  /** Snapshotted ONCE at the moment of spend — `remainingCreditsAfterSpend(
   *  child.credits)` MUST NOT be called at render time, because `onBooked()`
   *  triggers a background `/api/classes/summary` refetch that updates the
   *  parent's `children` state (and therefore this modal's `child` prop)
   *  WITHOUT unmounting the modal. Once that refetch lands — well under a
   *  second later — `child.credits` is already server-decremented, and
   *  recomputing from it at render time would subtract the spend a SECOND
   *  time (showing "0 left" when 1 remains), disagreeing with the toast
   *  that already fired. Captured alongside `paidWith`; reset everywhere
   *  `paidWith` resets. */
  const [creditsLeftAfterSpend, setCreditsLeftAfterSpend] = useState<number | null>(null)

  const [waiverAccepted, setWaiverAccepted] = useState(false)
  const [waiverSignerName, setWaiverSignerName] = useState("")

  // Monotonic generation counter — see trial-booking.tsx's "Re-entrancy"
  // doc comment for the exact bug class this guards against (a booking
  // request still in flight when the parent closes the modal must not
  // resurrect it via a delayed setPhase).
  const generationRef = useRef(0)

  // Defensive body-scroll lock — same rationale as trial-booking.tsx.
  useEffect(() => {
    if (!open) return
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = "hidden"
    return () => {
      document.body.style.overflow = previousOverflow
    }
  }, [open])

  const load = useCallback(async () => {
    const myGeneration = ++generationRef.current
    setPhase("loading")
    setLoadError(null)
    setFlowError(null)
    setPendingSession(null)
    setExhaustedOffer(null)
    setBookedSession(null)
    setPaidWith(null)
    setCreditsLeftAfterSpend(null)
    setWaiverAccepted(false)
    setWaiverSignerName("")
    try {
      const [scheduleRes, familyRes] = await Promise.all([
        fetch("/api/public/class-schedule"),
        fetch("/api/family-members"),
      ])
      if (myGeneration !== generationRef.current) return
      if (!scheduleRes.ok || !familyRes.ok) throw new Error("bad status")
      const scheduleBody = (await scheduleRes.json()) as {
        slots: ScheduleSlot[]
        sessions: ScheduleSession[]
      }
      const familyBody = (await familyRes.json()) as { familyMembers: FamilyMemberRow[] }
      if (myGeneration !== generationRef.current) return
      const familyRow = familyBody.familyMembers.find((f) => f.id === child.familyMemberId)
      const age =
        familyRow?.birthDate != null ? ageOnDate(familyRow.birthDate, new Date()) : null
      setSlots(scheduleBody.slots)
      setSessions(scheduleBody.sessions)
      setChildAge(age)
      setPhase("picking")
    } catch {
      if (myGeneration !== generationRef.current) return
      setLoadError("Couldn't load available classes — please try again.")
      setPhase("load_error")
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [child.familyMemberId])

  useEffect(() => {
    if (open) void load()
  }, [open, load])

  function humanizeBookError(code: string | undefined, message: unknown): string {
    switch (code) {
      case "session_full":
        return "That class just filled up — pick another time below."
      case "session_started":
      case "session_not_scheduled":
        return "That class isn't open for booking — pick another time below."
      case "age_ineligible":
        return `${child.name} is outside this class's age range.`
      case "already_booked":
        return "Already booked for that class."
      case "trial_already_used":
      case "member_child_no_trial":
        return "That booking type isn't available for this child."
      default:
        return typeof message === "string" ? message : "Could not book this class — please try again."
    }
  }

  async function attemptBook(
    session: ScheduleSession,
    waiver?: { signedBy: string; consentText: string },
  ) {
    const myGeneration = generationRef.current
    setPhase("booking")
    setFlowError(null)

    let res: Response
    try {
      res = await fetch("/api/classes/book", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId: session.id,
          familyMemberId: child.familyMemberId,
          kind: "member",
          ...(waiver ? { waiver } : {}),
        }),
      })
    } catch {
      if (myGeneration !== generationRef.current) return
      setFlowError("Network error — please try again.")
      setPhase("picking")
      return
    }
    if (myGeneration !== generationRef.current) return

    if (res.ok) {
      const okBody = await parseJson(res)
      if (myGeneration !== generationRef.current) return
      const spentPaymentMethod = typeof okBody.paymentMethod === "string" ? okBody.paymentMethod : null
      // Snapshot the remaining-credits count HERE, synchronously, off the
      // `child` prop as it stands RIGHT NOW — this is the last point before
      // `onBooked()` (below) kicks off the background summary refetch that
      // will eventually update `child.credits` to the already-decremented
      // server value. Storing the derived number (not recomputing from
      // `child.credits` at render time) is what keeps the dialog from
      // double-subtracting once that refetch lands — see the state's own
      // doc comment.
      const creditsLeft =
        spentPaymentMethod === "pack_credit" ? remainingCreditsAfterSpend(child.credits) : null
      setBookedSession(session)
      setPaidWith(spentPaymentMethod)
      setCreditsLeftAfterSpend(creditsLeft)
      setPhase("success")
      // Feedback survives even if the modal gets dismissed some other way
      // (e.g. a stray Escape) before the user reads the success panel —
      // see the "success screen unreachable" fix-list finding. `onBooked`
      // below refreshes the parent's /api/classes/summary data but does
      // NOT close the modal; only the user's own Close/backdrop dismiss
      // (handleClose) does that.
      //
      // A pack/block credit spend gets its OWN copy (mirrors
      // class-dropin-modal.tsx's `paidWith === "pack_credit"` branch) —
      // otherwise it reads identically to an allotment booking, and a
      // parent watching their credit balance has no way to tell the two
      // apart from the toast alone.
      if (spentPaymentMethod === "pack_credit") {
        toast.success(
          `${child.name}'s session is booked — 1 credit used, ${creditsLeft} left.`,
        )
      } else {
        toast.success(`${child.name}'s make-up class is booked for ${formatDateTime(session.startsAt)}.`)
      }
      onBooked()
      return
    }

    const body = await parseJson(res)
    if (myGeneration !== generationRef.current) return
    const code = typeof body.error === "string" ? body.error : undefined

    if (res.status === 402 && code === "allotment_exhausted") {
      const memberRateCents = typeof body.memberRateCents === "number" ? body.memberRateCents : 0
      setExhaustedOffer({ session, memberRateCents })
      setPhase("allotment_exhausted")
      return
    }

    if (code === "waiver_required") {
      setPendingSession(session)
      setPhase("waiver")
      return
    }

    if (code === "already_booked") {
      // Soft success — the child already holds a booking on this session
      // (e.g. a second click, or a session the picker didn't know to
      // exclude). Same "stay open, let the user dismiss" rule as the
      // primary success path above. No real spend happened on THIS
      // attempt, so paidWith/creditsLeftAfterSpend are explicitly cleared
      // rather than left over from a prior try.
      setBookedSession(session)
      setPaidWith(null)
      setCreditsLeftAfterSpend(null)
      setPhase("success")
      toast.success(`${child.name} is already booked for that class.`)
      onBooked()
      return
    }

    setFlowError(humanizeBookError(code, body.message))
    setPhase("picking")
  }

  async function submitWaiver(e: React.FormEvent) {
    e.preventDefault()
    if (!pendingSession) return
    if (!waiverAccepted || waiverSignerName.trim().length === 0) return
    await attemptBook(pendingSession, {
      signedBy: waiverSignerName.trim(),
      consentText: DROPIN_WAIVER_TEXT,
    })
  }

  async function payForClass() {
    if (!exhaustedOffer) return
    const myGeneration = generationRef.current
    setPhase("paying")
    setFlowError(null)
    try {
      const res = await fetch("/api/dropin/bookings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId: exhaustedOffer.session.id,
          familyMemberId: child.familyMemberId,
        }),
      })
      if (myGeneration !== generationRef.current) return
      const body = await parseJson(res)
      // Re-check AGAIN after the second await (parseJson) — the modal can
      // close/reopen for a different session while the body is still being
      // read, same class of race attemptBook already guards against.
      if (myGeneration !== generationRef.current) return
      if (!res.ok) {
        // Two error shapes come off this endpoint: nested
        // `{ error: { code, message } }` (already_booked, class_requires_child)
        // and flat `{ error: "<code>", message }` (class_rate_not_configured —
        // see src/lib/classes/class-rate.ts). Read the human message from
        // either rather than swallowing a specific, actionable one ("This
        // class is missing its pricing — contact the front desk") behind the
        // generic retry copy.
        const err = body.error as { message?: string } | string | undefined
        const nestedMessage = typeof err === "object" && err?.message ? err.message : null
        const flatMessage =
          typeof err === "string" && typeof body.message === "string" ? body.message : null
        const message =
          nestedMessage ?? flatMessage ?? "Could not start payment — please try again.";
        setFlowError(message)
        setPhase("allotment_exhausted")
        return
      }
      if (body.paymentRequired === true) {
        if (typeof body.checkoutUrl === "string" && body.checkoutUrl.length > 0) {
          window.location.href = body.checkoutUrl
          return
        }
        // Malformed response — paymentRequired without a usable
        // checkoutUrl. Never fall through to a false "success"; surface an
        // error and let the user retry.
        setFlowError("Could not start payment — please try again.")
        setPhase("allotment_exhausted")
        return
      }
      if (body.paymentRequired === false) {
        // Free path — shouldn't normally happen for a paid make-up (the
        // endpoint always prices it > 0), but a genuine $0 response from
        // the server is a real success, not a fallback guess.
        setBookedSession(exhaustedOffer.session)
        setPhase("success")
        toast.success(
          `${child.name}'s make-up class is booked for ${formatDateTime(exhaustedOffer.session.startsAt)}.`,
        )
        onBooked()
        return
      }
      // Any other shape (missing/unexpected paymentRequired) is malformed —
      // never assume success from an ambiguous response.
      setFlowError("Could not start payment — please try again.")
      setPhase("allotment_exhausted")
    } catch {
      if (myGeneration !== generationRef.current) return
      setFlowError("Network error — please try again.")
      setPhase("allotment_exhausted")
    }
  }

  function handleClose() {
    generationRef.current += 1
    onClose()
  }

  const eligibleSessions = sessions
    .filter((s) => s.id !== child.nextSession?.sessionId)
    .filter((s) => {
      const slot = slots.find((sl) => sl.templateId === s.templateId)
      return slot ? isAgeEligible(slot, childAge) : true
    })
    .sort((a, b) => a.startsAt.localeCompare(b.startsAt))

  return (
    <Dialog open={open} onOpenChange={(o) => !o && handleClose()}>
      <DialogContent className="bg-paper border-cream-3 text-ink max-w-md max-h-[85vh] overflow-y-auto">
        {phase === "loading" && (
          <>
            <DialogTitle className="text-ink">Book a make-up class</DialogTitle>
            <DialogDescription className="text-ink-muted">
              Loading available classes for {child.name}…
            </DialogDescription>
            <LoadingSkeleton variant="card" rows={2} />
          </>
        )}

        {phase === "load_error" && (
          <>
            <DialogTitle className="text-ink">Couldn't load classes</DialogTitle>
            <DialogDescription className="text-ink-muted">
              Something went wrong fetching the schedule.
            </DialogDescription>
            <ErrorBanner message={loadError} />
            <Button type="button" variant="outline" onClick={() => void load()}>
              Try again
            </Button>
          </>
        )}

        {(phase === "picking" || phase === "booking") && (
          <>
            <DialogTitle className="text-ink">
              {child.membership ? `Book a make-up class for ${child.name}` : `Book a session for ${child.name}`}
            </DialogTitle>
            <DialogDescription className="text-ink-muted">
              {child.membership
                ? <>Pick an upcoming class to make up a missed week — this draws from{" "}
                    {child.name}'s monthly allotment.</>
                : <>Pick an upcoming class — this spends one of {child.name}'s class credits.</>}
            </DialogDescription>

            <ErrorBanner message={flowError} />

            <div className="relative">
              {eligibleSessions.length === 0 ? (
                <EmptyState
                  title="No other classes available"
                  description="Nothing open in the next two weeks — check back soon, or reach out if your child needs a spot sooner."
                  className="py-6"
                />
              ) : (
                <div className="space-y-2 max-h-[45vh] overflow-y-auto">
                  {eligibleSessions.map((s) => {
                    const slot = slots.find((sl) => sl.templateId === s.templateId)
                    const full = s.spotsLeft === 0
                    return (
                      <button
                        key={s.id}
                        type="button"
                        disabled={full || phase === "booking"}
                        onClick={() => void attemptBook(s)}
                        className={`w-full text-left rounded-xl border p-3 transition-colors ${
                          full
                            ? "border-border bg-cream-2 opacity-60 cursor-not-allowed"
                            : "border-border hover:border-ochre/50"
                        }`}
                      >
                        <div className="font-semibold text-ink text-sm">
                          {slot?.name ?? "Class"}
                        </div>
                        <div className="text-xs text-ink-muted mt-0.5">
                          {formatDateTime(s.startsAt)}
                        </div>
                        {(slot?.venueName || slot?.locationName) && (
                          <div className="text-xs text-ink-muted">
                            {slot?.venueName ?? slot?.locationName}
                          </div>
                        )}
                        <div className="text-xs mt-1.5 font-medium">
                          {full ? (
                            <span className="text-destructive">Class full</span>
                          ) : (
                            <span className="text-emerald-700">{s.spotsLeft} spots left</span>
                          )}
                        </div>
                      </button>
                    )
                  })}
                </div>
              )}
              {phase === "booking" && (
                <div
                  className="absolute inset-0 flex items-center justify-center gap-2 rounded-lg bg-paper/85 text-sm font-medium text-ink-2"
                  role="status"
                  aria-live="polite"
                >
                  <div
                    className="size-4 rounded-full border-2 border-ochre border-t-transparent animate-spin"
                    aria-hidden="true"
                  />
                  Booking…
                </div>
              )}
            </div>
          </>
        )}

        {phase === "waiver" && pendingSession && (
          <form onSubmit={(e) => void submitWaiver(e)} className="space-y-4">
            <DialogTitle className="text-ink">One more step: sign the guardian waiver</DialogTitle>
            <DialogDescription className="text-ink-2">
              {child.name} is booking {formatDateTime(pendingSession.startsAt)} — this covers
              every class they attend from here on.
            </DialogDescription>

            <p className="text-sm text-ink-2 leading-relaxed rounded-lg border border-amber-200 bg-amber-50/60 p-3">
              {DROPIN_WAIVER_TEXT}
            </p>

            <div className="flex items-start gap-3">
              <Checkbox
                id="makeup-waiver-accept"
                checked={waiverAccepted}
                onCheckedChange={(checked) => setWaiverAccepted(checked === true)}
              />
              <Label htmlFor="makeup-waiver-accept" className="text-sm leading-snug cursor-pointer">
                {waiverAssentSentence("guardian", child.name)}
              </Label>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="makeup-waiver-signer-name" className="text-sm">
                Parent/guardian signature
              </Label>
              <Input
                id="makeup-waiver-signer-name"
                value={waiverSignerName}
                onChange={(e) => setWaiverSignerName(e.target.value)}
                placeholder="Your full name"
                autoComplete="name"
              />
            </div>

            <Button
              type="submit"
              disabled={!waiverAccepted || waiverSignerName.trim().length === 0}
              className="w-full sm:w-auto"
            >
              Sign waiver & book class
            </Button>
          </form>
        )}

        {phase === "allotment_exhausted" && exhaustedOffer && (
          <>
            <DialogTitle className="text-ink">This month's classes are used up</DialogTitle>
            <DialogDescription className="text-ink-2">
              {child.name}'s monthly allotment is used up for{" "}
              {formatDateTime(exhaustedOffer.session.startsAt)}. Pay{" "}
              {fmtDollars(exhaustedOffer.memberRateCents) ?? "the class rate"} to make up this one
              class instead?
            </DialogDescription>
            <ErrorBanner message={flowError} />
            <div className="flex gap-3">
              <Button type="button" onClick={() => void payForClass()}>
                Pay for this class
              </Button>
              <Button type="button" variant="outline" onClick={() => setPhase("picking")}>
                Back
              </Button>
            </div>
          </>
        )}

        {phase === "paying" && (
          <div className="py-6 text-center space-y-2">
            <div
              className="mx-auto size-6 rounded-full border-2 border-ochre border-t-transparent animate-spin"
              aria-hidden="true"
            />
            <p className="text-sm text-ink-muted">Redirecting to payment…</p>
          </div>
        )}

        {phase === "success" && bookedSession && (
          <>
            <DialogTitle className="text-ink">You're all set!</DialogTitle>
            <DialogDescription className="text-ink-muted">
              {child.name}'s {paidWith === "pack_credit" ? "session" : "make-up class"} is booked
              for {formatDateTime(bookedSession.startsAt)}
              {paidWith === "pack_credit"
                ? ` — 1 credit used, ${creditsLeftAfterSpend} left.`
                : "."}
            </DialogDescription>
            <Button type="button" onClick={handleClose}>
              Close
            </Button>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}

// ---------------------------------------------------------------------------
// Per-child card — membership branch
// ---------------------------------------------------------------------------

function MembershipChildCard({
  child,
  onChanged,
}: {
  child: SummaryChild
  onChanged: () => void
}) {
  const membership = child.membership!
  const [modalOpen, setModalOpen] = useState(false)
  const [cancelling, setCancelling] = useState(false)

  async function handleCancel() {
    const nextSession = child.nextSession
    if (!nextSession) return
    const confirmed = window.confirm(
      `Cancel ${child.name}'s class on ${formatDateTime(nextSession.startsAt)}? If this is before ` +
        "the cancellation window, the class credit will be freed — cancelling too close to class " +
        "time isn't allowed.",
    )
    if (!confirmed) return

    const bookingId = nextSession.bookingId
    setCancelling(true)
    try {
      const res = await fetch(`/api/classes/bookings/${bookingId}/cancel`, { method: "POST" })
      const body = await parseJson(res)
      if (!res.ok) {
        if (body.error === "inside_cutoff") {
          toast.error("Too close to class time to cancel — you're inside the cancellation window.")
        } else {
          toast.error(
            typeof body.message === "string" ? body.message : "Could not cancel — please try again.",
          )
        }
        return
      }
      if (body.creditFreed) {
        toast.success("Cancelled — the class credit was freed.")
      } else if (body.refunded) {
        toast.success("Cancelled — refund issued.")
      } else {
        toast.success("Cancelled.")
      }
      onChanged()
    } catch {
      toast.error("Network error — please try again.")
    } finally {
      setCancelling(false)
    }
  }

  const badge = statusBadge(membership.status)
  const isActive = membership.status === "active"
  // No billing portal exists in this repo yet (tracked platform gap — see
  // task-7-report.md). /dashboard/payments is a dead stub, so past_due's
  // CTA is an honest mailto to support rather than a link to nowhere.
  // paused/incomplete get NO payment CTA at all — there's nothing actionable
  // for the parent to click (paused was a deliberate pause; incomplete is
  // mid-processing), just a neutral status line below.
  const updatePaymentMailto =
    "mailto:hello@aspiresportsohio.com?subject=" +
    encodeURIComponent("Update payment method") +
    "&body=" +
    encodeURIComponent(
      `Hi Aspire team,\n\nI need to update the payment method for ${child.name}'s class membership.\n\nThanks!`,
    )

  return (
    <>
      <DashboardCard
        type="class"
        eyebrow={membership.tierName}
        title={child.name}
        meta={allotmentLabel(membership.classAllotmentRemaining)}
        status={badge}
        action={
          <div className="flex flex-col items-end gap-1.5">
            {isActive && (
              <Button size="sm" onClick={() => setModalOpen(true)}>
                Book a make-up
              </Button>
            )}
            {membership.status === "past_due" && (
              <Button asChild size="sm" variant="outline">
                <a href={updatePaymentMailto}>Contact us to update payment</a>
              </Button>
            )}
            {child.enrollment && (
              <Button asChild size="sm" variant="outline">
                <a href={`/dashboard/family/choose-slot?child=${child.familyMemberId}`}>
                  Change home slot
                </a>
              </Button>
            )}
            {child.nextSession && (
              <Button size="sm" variant="outline" disabled={cancelling} onClick={() => void handleCancel()}>
                {cancelling ? "Cancelling…" : "Cancel"}
              </Button>
            )}
          </div>
        }
      >
        <div className="mt-1.5 space-y-1">
          {child.enrollment ? (
            <p className="text-xs text-ink-2">
              Home slot:{" "}
              <span className="font-medium text-ink">{child.enrollment.templateName}</span> —{" "}
              {formatDayTime(child.enrollment.weekday, child.enrollment.startTime)}
            </p>
          ) : (
            <a
              href={`/dashboard/family/choose-slot?child=${child.familyMemberId}`}
              className="inline-block text-xs font-medium text-ochre hover:underline"
            >
              Choose a home slot →
            </a>
          )}
          {child.nextSession ? (
            <p className="text-xs text-ink-2">
              Next class: {formatDateTime(child.nextSession.startsAt)}
            </p>
          ) : child.enrollment ? (
            <p className="text-xs text-ink-muted">No upcoming class scheduled yet.</p>
          ) : null}
          {membership.status === "past_due" && (
            <p className="text-xs text-amber-700">
              Update your payment method to keep classes active.
            </p>
          )}
          {membership.status === "paused" && (
            <p className="text-xs text-ink-muted">Membership paused.</p>
          )}
          {membership.status === "incomplete" && (
            <p className="text-xs text-ink-muted">Payment processing…</p>
          )}
          <CreditLines credits={child.credits} />
          {child.credits.length > 0 && !child.hasWaiverOnFile && (
            <WaiverNudge onOpen={() => setModalOpen(true)} />
          )}
        </div>
      </DashboardCard>

      <MakeUpModal
        child={child}
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        // Refreshes /api/classes/summary (new nextSession, allotment used)
        // but deliberately does NOT close the modal — the user needs to see
        // the success panel first. Only handleClose (Close button /
        // backdrop / Escape, inside MakeUpModal) closes it. See the
        // "success screen unreachable" fix-list finding.
        onBooked={onChanged}
      />
    </>
  )
}

// ---------------------------------------------------------------------------
// Per-child card — no membership, but holds class-pack/block credits
// ---------------------------------------------------------------------------

/** A child with no membership but who bought a pack or block seat directly
 *  (the ladder's non-membership rungs — see class-purchase-ladder.tsx). Same
 *  `MakeUpModal` as the membership card: `POST /api/classes/book { kind:
 *  "member" }` already spends a credit transparently when there's no
 *  membership to spend from first (src/lib/classes/credits.ts), so no
 *  separate booking UI is needed here. */
function CreditChildCard({
  child,
  onChanged,
}: {
  child: SummaryChild
  onChanged: () => void
}) {
  const [modalOpen, setModalOpen] = useState(false)
  const showWaiverNudge = child.credits.length > 0 && !child.hasWaiverOnFile

  return (
    <>
      <DashboardCard
        type="class"
        eyebrow="Class credits"
        title={child.name}
        meta={creditLine(child.credits[0])}
        action={
          <Button size="sm" onClick={() => setModalOpen(true)}>
            Book a session
          </Button>
        }
      >
        <div className="mt-1.5 space-y-1">
          {child.credits.length > 1 && <CreditLines credits={child.credits.slice(1)} />}
          {showWaiverNudge && <WaiverNudge onOpen={() => setModalOpen(true)} />}
        </div>
      </DashboardCard>

      <MakeUpModal
        child={child}
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onBooked={onChanged}
      />
    </>
  )
}

// ---------------------------------------------------------------------------
// Per-child card — no membership, trial used → convert CTA
// ---------------------------------------------------------------------------

function ConvertCard({
  child,
  cheapestMonthlyCents,
}: {
  child: SummaryChild
  cheapestMonthlyCents: number | null
}) {
  const priceLabel = fmtDollars(cheapestMonthlyCents)
  return (
    <DashboardCard
      type="class"
      eyebrow="Free trial"
      title={child.name}
      meta="Loved the trial?"
      action={
        <Button asChild size="sm">
          <a href="/youth/classes#pricing">
            {priceLabel ? `Join from ${priceLabel}/mo` : "See membership pricing"}
          </a>
        </Button>
      }
    />
  )
}

// ---------------------------------------------------------------------------
// Top-level island
// ---------------------------------------------------------------------------

export default function FamilyClassesCard() {
  useHydrationBeacon()

  const [phase, setPhase] = useState<"loading" | "error" | "ready">("loading")
  const [children, setChildren] = useState<SummaryChild[]>([])
  const [cheapestMonthlyCents, setCheapestMonthlyCents] = useState<number | null>(null)
  const [reloadKey, setReloadKey] = useState(0)
  const [packSettle, setPackSettle] = useState<PackSettleStatus | null>(null)

  // ---- `?pack=success&child=…` settle ladder -----------------------------
  //
  // Stripe's success redirect routinely beats the webhook that writes the
  // credit grant, so the buyer can land here before ANY of their purchase is
  // visible. Mirrors runBlockFlow's settling approach in choose-slot.tsx in
  // miniature: acknowledge the payment immediately, then re-read
  // /api/classes/summary on a short backoff until the child's credits show
  // up, and degrade to an honest "still processing" line rather than lying
  // either way.
  //
  // Runs in an effect (not a useState initializer) so the server-rendered
  // and first client render agree — reading window.location during render
  // would be a hydration mismatch. Empty dep array: this must fire exactly
  // once per page load, and it strips its own params below so a refresh
  // can't re-trigger it.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    if (params.get("pack") !== "success") return
    const packChildId = params.get("child")

    setPackSettle("settling")

    // Clear the params up front — before the async ladder, so an impatient
    // refresh mid-settle lands on a clean URL rather than restarting the
    // whole acknowledgment.
    params.delete("pack")
    params.delete("child")
    const query = params.toString()
    window.history.replaceState(
      {},
      "",
      `${window.location.pathname}${query ? `?${query}` : ""}${window.location.hash}`,
    )

    let cancelled = false

    /** One settle probe: re-read the summary, push it into state (so the new
     *  credit card renders the instant it exists), and report whether the
     *  purchased child's credits have actually landed. */
    async function probe(): Promise<boolean> {
      let rows: SummaryChild[]
      try {
        const res = await fetch("/api/classes/summary")
        if (!res.ok) return false
        rows = ((await res.json()) as { children: SummaryChild[] }).children
      } catch {
        // Indistinguishable from "the webhook hasn't landed yet" — let the
        // ladder take another swing rather than treating it as terminal.
        return false
      }
      if (cancelled) return false
      setChildren(rows)
      setPhase("ready")
      // A missing/garbled `child` param still gets an acknowledgment: fall
      // back to "any child now holds credits" rather than never settling.
      return rows.some(
        (c) =>
          c.credits.length > 0 && (packChildId ? c.familyMemberId === packChildId : true),
      )
    }

    void (async () => {
      for (const delay of PACK_SETTLE_DELAYS_MS) {
        if (await probe()) {
          if (!cancelled) setPackSettle("settled")
          return
        }
        if (cancelled) return
        await sleep(delay)
        if (cancelled) return
      }
      const landed = await probe()
      if (cancelled) return
      setPackSettle(landed ? "settled" : "processing")
    })()

    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    // Only the very FIRST load shows the loading skeleton. Every later
    // reload (reloadKey > 0, triggered by `onChanged` after a booking/
    // cancel action) is a background refresh: flipping `phase` back to
    // "loading" here would swap the whole list — including any currently
    // OPEN make-up modal, which lives inside one of these cards — for a
    // skeleton and back, unmounting the modal and silently resetting its
    // `modalOpen` state to false. That was the real bug behind "the
    // success screen is unreachable" (fix-list finding): the modal wasn't
    // being closed by a stray `setModalOpen(false)` call, it was being
    // destroyed out from under itself by this refresh. A background
    // refresh must update `children` in place without ever unmounting the
    // tree that's already rendered.
    const isInitialLoad = reloadKey === 0
    if (isInitialLoad) setPhase("loading")
    ;(async () => {
      try {
        const [summaryRes, tiersRes] = await Promise.all([
          fetch("/api/classes/summary"),
          fetch("/api/public/membership-tiers"),
        ])
        if (cancelled) return
        if (!summaryRes.ok) {
          if (isInitialLoad) {
            setPhase("error")
          } else {
            toast.error("Couldn't refresh your class memberships — try reloading the page.")
          }
          return
        }
        const summaryBody = (await summaryRes.json()) as { children: SummaryChild[] }

        // Cheapest live class-membership tier — for the convert CTA's "$X/mo"
        // figure. Best-effort: a failed/empty tiers fetch just drops the
        // figure (ConvertCard falls back to generic copy), it never blocks
        // rendering the rest of the card.
        let cheapest: number | null = null
        if (tiersRes.ok) {
          const tiersBody = (await tiersRes.json()) as { tiers: MembershipTier[] }
          const classTierPrices = tiersBody.tiers
            .filter(isClassTier)
            .map((t) => t.monthlyPriceCents)
            .filter((c): c is number => typeof c === "number")
          if (classTierPrices.length > 0) {
            cheapest = Math.min(...classTierPrices)
          }
        }

        if (cancelled) return
        setChildren(summaryBody.children)
        setCheapestMonthlyCents(cheapest)
        setPhase("ready")
      } catch {
        if (cancelled) return
        if (isInitialLoad) {
          setPhase("error")
        } else {
          toast.error("Couldn't refresh your class memberships — try reloading the page.")
        }
      }
    })()
    return () => {
      cancelled = true
    }
  }, [reloadKey])

  // Rendered in EVERY branch below, deliberately: a pack buyer who beats the
  // webhook has no membership, no credits and often no other qualifying
  // child, so the paths that render a skeleton, an error, or nothing at all
  // are exactly the ones where the acknowledgment matters most.
  const packBanner = packSettle ? <PackSuccessBanner status={packSettle} /> : null

  if (phase === "loading") {
    return (
      <div className="space-y-3">
        {packBanner}
        <LoadingSkeleton variant="card" rows={2} />
      </div>
    )
  }

  if (phase === "error") {
    return (
      <div className="space-y-2">
        {packBanner}
        <ErrorBanner message="We couldn't load your class memberships." />
        <Button size="sm" variant="outline" onClick={() => setReloadKey((k) => k + 1)}>
          Retry
        </Button>
      </div>
    )
  }

  const qualifying = children.filter(
    (c) => c.membership !== null || c.trialUsed || c.credits.length > 0,
  )
  if (qualifying.length === 0) return packBanner

  return (
    <div className="space-y-3">
      {packBanner}
      {qualifying.map((c) =>
        c.membership ? (
          <MembershipChildCard
            key={c.familyMemberId}
            child={c}
            onChanged={() => setReloadKey((k) => k + 1)}
          />
        ) : c.credits.length > 0 ? (
          <CreditChildCard
            key={c.familyMemberId}
            child={c}
            onChanged={() => setReloadKey((k) => k + 1)}
          />
        ) : (
          <ConvertCard
            key={c.familyMemberId}
            child={c}
            cheapestMonthlyCents={cheapestMonthlyCents}
          />
        ),
      )}
    </div>
  )
}
