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
import { useConfirmDialog } from "@/components/ui/confirm-dialog"
import { formatCents } from "@/lib/classes/ladder-model"
import { formatDayTime, allotmentLabel } from "@/lib/dashboard/class-slot-format"

/**
 * Family dashboard — per-child class membership card (Task 7 of the youth
 * classes UX plan). Mounts `client:load` in family.astro's "What you're
 * part of" section, above `<ChildrenOverview client:load/>`.
 *
 * Fetches `/api/classes/summary` once and renders one `DashboardCard` per
 * child who holds a class membership, has active pack/block credits
 * (`credits`, Task 12 — the class-purchase-ladder's non-membership rungs),
 * has used their org trial (`trialUsed`), OR holds a standing `enrollment`
 * (Task 5, issue #601 F6: the TAIL of a credit-backed block — the backing
 * grant's last purchased session is already booked, so `credits` filters it
 * to `[]` even though the enrollment is still active until that session
 * happens; without this the child rendered no card at all and no way to end
 * it). Children with none of the four render nothing — `ChildrenOverview`
 * already covers the plain "no classes yet" case, so duplicating that here
 * would be noise. The whole component renders `null` when zero children
 * qualify (no empty section, no dangling heading).
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
 * PAID MAKE-UP (402 `allotment_exhausted`): confirming the price does NOT go
 * straight to checkout. It runs `payOrCollectWaiver`, the same two-door
 * decision class-dropin-modal.tsx makes — covered families pay with no waiver
 * fields, uncovered ones sign first and the signature rides along with the
 * paid booking. Reaching `allotment_exhausted` is not proof of a live
 * signature: a family enrolled 14 months ago has spent an allotment every
 * month AND has a lapsed waiver, and they are the last people who should be
 * charged with no release on record.
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
 * Field note (superseded — kept for history): this used to say the summary
 * endpoint exposed neither a membership renewal date nor the org's real
 * cancellation cutoff window, so the cancel confirm used generic "before the
 * cancellation window" copy. Both gaps are closed now: the endpoint returns
 * top-level `cancelWindowHours` and per-child `upcomingSessions`, so the
 * per-session cancel confirm below (`useConfirmDialog`, not `window.confirm`)
 * quotes the real number, and every upcoming session — not just the single
 * soonest one — gets its own list row and cancel action.
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
  /** The tier's monthly technical-band supplement, in cents — null/undefined
   *  when the tier has none configured. Surfaced so the make-up modal's
   *  `technical_not_included` upsell (see MakeUpModal below) can quote the
   *  real price without a second round trip; `POST /api/classes/book`'s 409
   *  body carries no price of its own (src/pages/api/classes/book.ts). */
  technicalMonthlyCents?: number | null
}

interface SummaryEnrollment {
  id: string
  templateId: string
  templateName: string
  weekday: number
  startTime: string
  /** Credit-BACKED (block) enrollments with sessions still on the grant: the
   *  date those credits expire. Ending the enrollment un-pins the grant so
   *  they float to any class until exactly this date (owner decision 2) —
   *  which is the whole reason the end-enrollment confirm can promise it.
   *  Null for membership-backed seats and exhausted/lapsed grants. */
  creditsExpireAt: string | null
}

interface SummaryNextSession {
  sessionId: string
  startsAt: string
  bookingId: string
}

/** One row of `child.upcomingSessions` — every confirmed future class
 *  booking for the child, soonest-first, capped at 10 server-side (Task 1's
 *  widening of `GET /api/classes/summary`). Same shape as
 *  `SummaryNextSession`, kept as its own named type since the two now serve
 *  different call sites (the list below vs. the make-up modal's "exclude the
 *  next session" filter, which still reads `child.nextSession` alone). */
interface SummaryUpcomingSession {
  sessionId: string
  bookingId: string
  startsAt: string
}

interface SummaryCredit {
  /** "comp" = admin-issued goodwill credits; they render exactly like pack
   *  credits, with the label the API supplies. */
  source: "pack" | "block" | "comp"
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
  /** Every confirmed future class booking, soonest-first (max 10) — the
   *  source for the upcoming-sessions list rendered below. `nextSession`
   *  above always equals `upcomingSessions[0]` when non-empty; kept as a
   *  separate field because the make-up modal's eligibility filter only
   *  needs the single soonest one. */
  upcomingSessions: SummaryUpcomingSession[]
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

// formatDayTime and allotmentLabel are imported from
// @/lib/dashboard/class-slot-format — the documented exception to this
// file's "duplicate small pure helpers per island" convention (see that
// module's header comment): child-profile-data.ts (Task 11) needs the exact
// same allotment-string logic and a long-form weekday variant, and it is a
// pure test target that must not pull in this island's Dialog/sonner
// imports through a same-file import.

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

/** Amber "sign the waiver first" nudge — shown for `CreditChildCard` whenever
 *  a child has spendable credits but no waiver inside the annual window, and
 *  for `MembershipChildCard` whenever the child has a membership or home-slot
 *  enrollment but no waiver inside the annual window (Task 3: previously
 *  gated on credits there too, so a membership child sitting on zero leftover
 *  pack/block credits got no warning until a real booking 422s
 *  `waiver_required`). Clicking it opens the same make-up modal `onOpen`
 *  opens for the "Book a session"/"Book a make-up" CTA: the modal's own
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
      data-testid="waiver-attention"
      onClick={onOpen}
      className="block text-left text-xs font-medium text-amber-800 bg-amber-50/80 border border-amber-200 rounded-lg px-2.5 py-1.5 hover:bg-amber-100/80"
    >
      Sign this year's waiver to book classes →
    </button>
  )
}

/**
 * "End enrollment" — gives up the child's STANDING weekly seat (not a single
 * booking; that's the `Cancel` action above, which targets `nextSession`).
 *
 * `DELETE /api/classes/enrollments/:id` releases the seat, cancels the child's
 * already-booked future $0 sessions on that slot, and — for a credit-backed
 * (block) seat — un-pins the backing grant so the sessions the family already
 * paid for become credits spendable on ANY class until their unchanged expiry
 * (owner decision 2; no cash refunds). The confirm says so BEFORE the click
 * commits, using the expiry the summary supplies; the toast afterwards reports
 * the exact count off the response, which is the only place it's knowable —
 * the releases above hand credits BACK, so the post-end balance is higher than
 * anything the dashboard could have computed up front. That's also why the
 * confirm deliberately quotes no number.
 *
 * Shared by both card variants: a block family with no membership renders as
 * `CreditChildCard`, and they are precisely the family this float exists for.
 */
function EndEnrollmentButton({
  child,
  onChanged,
}: {
  child: SummaryChild
  onChanged: () => void
}) {
  const [ending, setEnding] = useState(false)
  const { confirm, dialog } = useConfirmDialog()
  const enrollment = child.enrollment
  if (!enrollment) return null

  async function handleEnd() {
    if (!enrollment) return
    const creditsLine = enrollment.creditsExpireAt
      ? ` The remaining sessions become credits you can use on any class until ${formatShortDate(enrollment.creditsExpireAt)}.`
      : ""
    // "with your membership or block credits" is load-bearing, not padding:
    // the release deliberately spares PAID make-ups (see the scope boundary in
    // `releaseFutureEnrollmentSeats`), so a flat "any classes already booked
    // are cancelled" would tell a family their paid session is gone when it
    // is still theirs to attend.
    const confirmed = await confirm({
      title: "End this enrollment?",
      description:
        `End ${child.name}'s enrollment in ${enrollment.templateName}? Their weekly spot is ` +
        `released and any classes already booked on it with your membership or block ` +
        `credits are cancelled — classes you paid for separately are unaffected.${creditsLine}`,
      confirmLabel: "End enrollment",
      destructive: true,
    })
    if (!confirmed) return

    setEnding(true)
    try {
      const res = await fetch(`/api/classes/enrollments/${enrollment.id}`, { method: "DELETE" })
      const body = await parseJson(res)
      if (!res.ok) {
        toast.error(
          typeof body.message === "string"
            ? body.message
            : "Could not end this enrollment — please try again.",
        )
        return
      }
      const floated = typeof body.creditsFloated === "number" ? body.creditsFloated : 0
      const expiresAt = typeof body.creditsExpireAt === "string" ? body.creditsExpireAt : null
      if (floated > 0 && expiresAt) {
        toast.success(
          `Enrollment ended — ${floated} session${floated === 1 ? "" : "s"} ${
            floated === 1 ? "is" : "are"
          } now credits you can use on any class until ${formatShortDate(expiresAt)}.`,
        )
      } else {
        toast.success(`${child.name}'s enrollment has ended.`)
      }
      onChanged()
    } catch {
      toast.error("Network error — please try again.")
    } finally {
      setEnding(false)
    }
  }

  return (
    <>
      <Button
        size="sm"
        variant="outline"
        disabled={ending}
        onClick={() => void handleEnd()}
        data-testid="end-enrollment"
      >
        {ending ? "Ending…" : "End enrollment"}
      </Button>
      {dialog}
    </>
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
  | "technical_upsell"
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
  /** What happens once the guardian waiver is signed: re-attempt the FREE
   *  booking (the `waiver_required` path, where the signature both books the
   *  class and puts the waiver on file), or carry the signature into the PAID
   *  drop-in checkout (the 402 `allotment_exhausted` path). Mirrors
   *  class-dropin-modal.tsx's identically-named state — the two modals run
   *  the same two-door decision and must not drift. */
  const [waiverPurpose, setWaiverPurpose] = useState<"book" | "pay">("book")

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
    setWaiverPurpose("book")
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

    // Allotment has room, but this is a technical slot and the tier owes the
    // technical supplement the child hasn't paid for (no active technical
    // enrollment on this membership — see requiresTechnicalPremium /
    // hasActiveTechnicalEnrollment in book-child.ts). The 409 body carries no
    // price (src/pages/api/classes/book.ts) — quote the tier's real
    // technicalMonthlyCents off the summary snapshot instead of a dead-end
    // ErrorBanner dump, and route the parent to the choose-slot flow, which
    // already owns the `acknowledgeTechnicalPremium` PUT (see choose-slot.tsx's
    // `technical_premium_required` handling).
    if (code === "technical_not_included") {
      setPhase("technical_upsell")
      return
    }

    if (code === "waiver_required") {
      setPendingSession(session)
      setWaiverPurpose("book")
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
    const signedBy = waiverSignerName.trim()
    if (waiverPurpose === "pay") {
      // The allotment is spent and there is no live signature on file: the
      // guardian release rides along with the PAID booking, so the row lands
      // `waiverSigned: true` instead of taking money with nothing on record.
      await payForClass(signedBy)
      return
    }
    await attemptBook(pendingSession, {
      signedBy,
      consentText: DROPIN_WAIVER_TEXT,
    })
  }

  /**
   * The ONE place this modal decides "straight to payment, or collect a
   * guardian signature first?" — the twin of class-dropin-modal.tsx's
   * function of the same name, kept deliberately identical in shape.
   *
   * Reaching `allotment_exhausted` used to be treated as proof that a
   * signature existed: you cannot spend an allotment without having enrolled.
   * Waivers EXPIRE now (365 days), so that no longer follows — a family
   * enrolled 14 months ago has spent an allotment every month AND has a
   * lapsed waiver. They are the last people who should be charged with no
   * live release on record.
   *
   * Covered → pay with NO waiver fields. The booking endpoint re-checks the
   * same canonical predicate: it sets `waiver_on_file: "1"` in the Stripe
   * metadata fulfillment reads when the child IS covered, and refuses with
   * 422 `waiver_required` when the child is not and no signature came with
   * the request. That server gate is a backstop, not a licence to loosen this
   * one — `child.hasWaiverOnFile` comes off a summary snapshot that can be
   * stale, and the difference between the two decisions is a dead-end error
   * versus a panel the parent can act on. Only strict `true` skips;
   * `false`/`undefined`/a summary that never loaded all fall through to
   * ASKING. Do not weaken this to a truthiness check.
   */
  async function payOrCollectWaiver() {
    if (!exhaustedOffer) return
    if (child.hasWaiverOnFile === true) {
      await payForClass()
      return
    }
    setPendingSession(exhaustedOffer.session)
    setWaiverPurpose("pay")
    setPhase("waiver")
  }

  /** Paid make-up checkout. `waiverSignedBy` is present only when a guardian
   *  signature was just captured on the "pay" waiver step; omitting the
   *  fields is what a covered family sends, and the endpoint stamps the
   *  on-file attribution itself. */
  async function payForClass(waiverSignedBy?: string) {
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
          ...(waiverSignedBy
            ? { waiverAccepted: true, waiverName: waiverSignedBy }
            : {}),
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
        const err = body.error as { message?: string; code?: string } | string | undefined
        const code =
          typeof err === "string"
            ? err
            : typeof err === "object" && typeof err?.code === "string"
              ? err.code
              : undefined

        // The endpoint gates the child path server-side: no valid annual
        // waiver and no signature on the request → 422. `payOrCollectWaiver`
        // sends no signature whenever `hasWaiverOnFile` is true, and that flag
        // comes off a summary snapshot that can be STALE — a waiver that
        // lapsed between the dashboard load and this click lands exactly here.
        // Route it to the panel the user can actually act on instead of a dead
        // "could not start payment". `waiverPurpose` stays "pay", so signing
        // resubmits this same paid booking with the signature attached.
        if (code === "waiver_required") {
          setPendingSession(exhaustedOffer.session)
          setWaiverPurpose("pay")
          setPhase("waiver")
          return
        }

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
              {waiverPurpose === "pay"
                ? " Sign it here and we'll take you straight to payment."
                : ""}
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
              {waiverPurpose === "pay"
                ? "Sign waiver & continue to payment"
                : "Sign waiver & book class"}
            </Button>
          </form>
        )}

        {phase === "allotment_exhausted" && exhaustedOffer && (
          <>
            <DialogTitle className="text-ink">Book this class</DialogTitle>
            <DialogDescription className="text-ink-2">
              {child.name}'s membership doesn't cover{" "}
              {formatDateTime(exhaustedOffer.session.startsAt)} — book it as a one-off for{" "}
              {fmtDollars(exhaustedOffer.memberRateCents) ?? "the class rate"}?
            </DialogDescription>
            <ErrorBanner message={flowError} />
            <div className="flex gap-3">
              <Button type="button" onClick={() => void payOrCollectWaiver()}>
                Pay for this class
              </Button>
              <Button type="button" variant="outline" onClick={() => setPhase("picking")}>
                Back
              </Button>
            </div>
          </>
        )}

        {phase === "technical_upsell" && (
          <>
            <DialogTitle className="text-ink">Book this class</DialogTitle>
            <DialogDescription className="sr-only">
              This class requires the technical training supplement.
            </DialogDescription>
            <div
              data-testid="technical-upsell"
              className="rounded-lg border border-sky-200 bg-sky-50 p-3 space-y-2"
            >
              <h3 className="font-semibold text-sky-900 text-sm">This is a technical class</h3>
              <p className="text-sm text-sky-800">
                Technical sessions run in smaller groups with extra coaching. Add the technical
                supplement — {formatCents(child.membership?.technicalMonthlyCents) ?? "a monthly amount"}
                /month — to book them with your membership.
              </p>
              <Button asChild size="sm">
                <a href={`/dashboard/family/choose-slot?child=${child.familyMemberId}`}>
                  Add technical supplement
                </a>
              </Button>
            </div>
            <Button type="button" variant="outline" onClick={handleClose}>
              Not now
            </Button>
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
  cancelWindowHours,
  onChanged,
}: {
  child: SummaryChild
  /** Org's real cancellation cutoff, off the summary response's top-level
   *  `cancelWindowHours` (Task 1) — quoted verbatim in the confirm dialog so
   *  a parent knows exactly how much notice they need, instead of the old
   *  generic "before the cancellation window" copy. */
  cancelWindowHours: number
  onChanged: () => void
}) {
  const membership = child.membership!
  const [modalOpen, setModalOpen] = useState(false)
  const [cancellingBookingId, setCancellingBookingId] = useState<string | null>(null)
  const [openingPortal, setOpeningPortal] = useState(false)
  const { confirm: confirmCancel, dialog: cancelDialog } = useConfirmDialog()

  /** Cancels ONE specific upcoming session, identified by its bookingId —
   *  no longer implicitly "the next session" (`child.nextSession`), since a
   *  child can have several upcoming sessions listed and each row's own
   *  cancel button targets its own booking. */
  async function handleCancel(bookingId: string) {
    const confirmed = await confirmCancel({
      title: "Cancel this class?",
      description: `Cancelling less than ${cancelWindowHours} hours before start forfeits the session.`,
      confirmLabel: "Cancel this class",
      destructive: true,
    })
    if (!confirmed) return

    setCancellingBookingId(bookingId)
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
      setCancellingBookingId(null)
    }
  }

  const badge = statusBadge(membership.status)
  const isActive = membership.status === "active"

  // Self-serve Stripe billing portal (POST /api/memberships/billing-portal,
  // returnPath "/dashboard/family" — this card's own page in the return-path
  // allow-list). past_due gets a prominent button so a failing card is
  // actually fixable instead of a mailto dead-end; active gets a low-key
  // "Manage billing" link for receipts/self-cancel. paused/incomplete get
  // NEITHER — nothing actionable for the parent to click (paused was a
  // deliberate pause; incomplete is mid-processing), just the neutral status
  // line below. Error handling reuses parseJson's shape-tolerant read: the
  // endpoint's 404 `no_billing_account` carries a real `message` worth
  // showing verbatim rather than a generic retry line.
  async function openBillingPortal() {
    setOpeningPortal(true)
    try {
      const res = await fetch("/api/memberships/billing-portal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ returnPath: "/dashboard/family" }),
      })
      const body = await parseJson(res)
      if (!res.ok) {
        toast.error(
          typeof body.message === "string"
            ? body.message
            : "Could not open billing — please try again.",
        )
        return
      }
      const url = typeof body.url === "string" ? body.url : null
      if (!url) {
        toast.error("Could not open billing — please try again.")
        return
      }
      window.location.assign(url)
    } catch {
      toast.error("Network error — please try again.")
    } finally {
      setOpeningPortal(false)
    }
  }

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
              <Button size="sm" disabled={openingPortal} onClick={() => void openBillingPortal()}>
                {openingPortal ? "Opening…" : "Update payment method"}
              </Button>
            )}
            {child.enrollment && (
              <Button asChild size="sm" variant="outline">
                <a href={`/dashboard/family/choose-slot?child=${child.familyMemberId}`}>
                  Change home slot
                </a>
              </Button>
            )}
            <EndEnrollmentButton child={child} onChanged={onChanged} />
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
          {child.upcomingSessions.length > 0 ? (
            <ul className="space-y-0.5">
              {child.upcomingSessions.map((session) => (
                <li
                  key={session.sessionId}
                  data-testid="upcoming-session-row"
                  className="flex items-center justify-between gap-2 text-xs text-ink-2"
                >
                  <span>{formatDateTime(session.startsAt)}</span>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    disabled={cancellingBookingId === session.bookingId}
                    onClick={() => void handleCancel(session.bookingId)}
                    data-testid="cancel-session"
                    className="h-auto px-2 py-0.5 text-xs"
                  >
                    {cancellingBookingId === session.bookingId ? "Cancelling…" : "Cancel"}
                  </Button>
                </li>
              ))}
            </ul>
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
          {isActive && (
            <button
              type="button"
              onClick={() => void openBillingPortal()}
              disabled={openingPortal}
              className="block text-left text-xs text-ink-muted hover:text-ink hover:underline disabled:opacity-60"
            >
              {openingPortal ? "Opening…" : "Manage billing →"}
            </button>
          )}
          <CreditLines credits={child.credits} />
          {!child.hasWaiverOnFile && (child.membership || child.enrollment) && (
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
      {cancelDialog}
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
        // Tail-of-block shape (issue #601, F6): the backing grant's last
        // session is already booked, so `credits` (spendable balances only)
        // is empty even though the enrollment itself is still active until
        // that last session happens. `creditLine` assumes a real credit —
        // guard the empty case rather than indexing `child.credits[0]`.
        meta={child.credits.length > 0 ? creditLine(child.credits[0]) : "No sessions left to book"}
        action={
          <div className="flex flex-col items-end gap-1.5">
            <Button size="sm" onClick={() => setModalOpen(true)}>
              Book a session
            </Button>
            <EndEnrollmentButton child={child} onChanged={onChanged} />
          </div>
        }
      >
        <div className="mt-1.5 space-y-1">
          {child.enrollment && (
            <p className="text-xs text-ink-2">
              Home slot:{" "}
              <span className="font-medium text-ink">{child.enrollment.templateName}</span> —{" "}
              {formatDayTime(child.enrollment.weekday, child.enrollment.startTime)}
            </p>
          )}
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
// Family-level card — children with none of the four qualifying signals
// ---------------------------------------------------------------------------

/** First token of a `${firstName} ${lastName}` summary name (see
 *  `/api/classes/summary`'s `name` field) — the discover card lists first
 *  names only, never the shared "Test"-style last name. */
function firstNameOf(fullName: string): string {
  return fullName.split(" ")[0] || fullName
}

/** "Ava" / "Ava and Ben" / "Ava, Ben, and Cleo". */
function joinNames(names: string[]): string {
  if (names.length <= 1) return names[0] ?? ""
  if (names.length === 2) return `${names[0]} and ${names[1]}`
  return `${names.slice(0, -1).join(", ")}, and ${names[names.length - 1]}`
}

/** At most ONE of these renders per family, regardless of how many children
 *  fail every other qualifying signal (no membership, no trial, no credits,
 *  no enrollment) — a 4-child family with zero class touchpoints should not
 *  see 4 identical banners. `names` lists every eligible child's first name
 *  so the single card still reads as personal to the family.
 *
 * Aspire-only: `/youth/classes` is Aspire's youth funnel, so the caller only
 * mounts this when `brandId === "aspire"` (fail-closed — an omitted/
 * undefined brandId does NOT show it) — see FamilyClassesCard below. */
function DiscoverCard({ names }: { names: string[] }) {
  return (
    <DashboardCard
      type="class"
      eyebrow="Weekly classes"
      title={joinNames(names)}
      meta="Weekly small-group classes — first class is a free trial."
      action={
        <Button asChild size="sm">
          <a href="/youth/classes" data-testid="discover-classes">
            Discover classes
          </a>
        </Button>
      }
    />
  )
}

// ---------------------------------------------------------------------------
// Top-level island
// ---------------------------------------------------------------------------

interface FamilyClassesCardProps {
  /** Host-derived brand key (`Astro.locals.brandId`, always resolved —
   *  see src/env.d.ts). `/youth/classes` is Aspire-only, so `DiscoverCard`
   *  is gated on this rather than any fetched data: the summary endpoint is
   *  brand-neutral (serves both Aspire and SoccerOne orgs) and has no signal
   *  of its own to gate on. Optional in the type only for callers that
   *  genuinely have no brand context (there are none today) — the gate
   *  itself is `brandId === "aspire"`, FAIL-CLOSED: an omitted/undefined
   *  value hides the card rather than showing it. This deliberately departs
   *  from `PayCard`'s `brandId?: "aspire" | "soccerone"` convention (which
   *  defaults an absent brandId to Aspire's *styling*, a cosmetic no-op on
   *  SoccerOne) — here an absent brandId defaulting "open" would mean a
   *  caller that forgets to thread it silently leaks a link into Aspire's
   *  youth funnel onto a SoccerOne surface. Matches the fail-closed
   *  direction `family.astro`/`start.astro` already use
   *  (`Astro.locals.brandId === "aspire"`). */
  brandId?: "aspire" | "soccerone"
}

export default function FamilyClassesCard({ brandId }: FamilyClassesCardProps = {}) {
  useHydrationBeacon()

  const [phase, setPhase] = useState<"loading" | "error" | "ready">("loading")
  const [children, setChildren] = useState<SummaryChild[]>([])
  const [cheapestMonthlyCents, setCheapestMonthlyCents] = useState<number | null>(null)
  // Org's real cancel cutoff (Task 1's summary widening) — defaults to the
  // same 24h the API falls back to for an org with no rate-card row, so the
  // very first render (before this fetch resolves) never quotes a number
  // that disagrees with what the endpoint would actually enforce.
  const [cancelWindowHours, setCancelWindowHours] = useState<number>(24)
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
        const summaryBody = (await summaryRes.json()) as {
          children: SummaryChild[]
          cancelWindowHours?: number
        }

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
        if (typeof summaryBody.cancelWindowHours === "number") {
          setCancelWindowHours(summaryBody.cancelWindowHours)
        }
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

  // `enrollment !== null` also qualifies on its own — the tail of a
  // credit-backed (block) enrollment (issue #601, F6): the backing grant's
  // last purchased session is already spent (booked), so `credits` filters
  // it out entirely (spendable balances only) and there's no membership or
  // trial-used flag either. Without this the child rendered NO card at
  // all — no visible way to end the enrollment before the block quietly
  // lapses. See CreditChildCard below, which renders for this shape too.
  const qualifying = children.filter(
    (c) => c.membership !== null || c.trialUsed || c.credits.length > 0 || c.enrollment !== null,
  )
  // Children hitting none of the four signals — never shown a per-child card
  // of their own; folded into the single family-level DiscoverCard below
  // instead (Aspire-only, see FamilyClassesCardProps.brandId).
  const discoverable = children.filter((c) => !qualifying.includes(c))
  // Fail-closed: an omitted/undefined brandId hides the card. See
  // FamilyClassesCardProps.brandId's doc comment for why this is
  // `=== "aspire"`, not `!== "soccerone"`.
  const showDiscoverCard = brandId === "aspire" && discoverable.length > 0
  if (qualifying.length === 0 && !showDiscoverCard) return packBanner

  return (
    <div className="space-y-3">
      {packBanner}
      {qualifying.map((c) =>
        c.membership ? (
          <MembershipChildCard
            key={c.familyMemberId}
            child={c}
            cancelWindowHours={cancelWindowHours}
            onChanged={() => setReloadKey((k) => k + 1)}
          />
        ) : c.credits.length > 0 || c.enrollment !== null ? (
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
      {showDiscoverCard && (
        <DiscoverCard names={discoverable.map((c) => firstNameOf(c.name))} />
      )}
    </div>
  )
}
