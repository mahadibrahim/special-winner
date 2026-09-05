"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import {
  trackTrialModalOpened,
  trackTrialBookingAttempted,
  trackTrialWaiverShown,
  trackTrialBooked,
  trackTrialFullOfferShown,
  trackTrialFullOfferAccepted,
  trackTrialBlocked,
  trackTrialGuestFormShown,
  trackTrialGuestSubmitted,
  trackTrialGuestExistingAccount,
  type TrialBlockedReason,
} from "@/lib/analytics/events"
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { ErrorBanner } from "@/components/ui/error-banner"
import { LoadingSkeleton } from "@/components/ui/loading-skeleton"
import { useHydrationBeacon } from "@/lib/hooks/use-hydration-beacon"
import { EmptyNotifyForm } from "@/components/landing/empty-notify-form"
import { DROPIN_WAIVER_TEXT } from "@/lib/dropin/waiver-text"
import { waiverAssentSentence } from "@/lib/consents/waiver-consent-language"
import { ChildPicker, type ChildPickerMember } from "@/components/youth/child-picker"
import { TurnstileWidget, type TurnstileWidgetHandle } from "@/components/auth/turnstile-widget"

/**
 * Free-trial booking modal for /youth/classes. Mounts as its own island —
 * it never receives props from class-schedule.tsx. Instead it listens for
 * the `youth:trial-requested` CustomEvent (`detail: { templateId }`) that
 * island's "Book a free trial" CTAs dispatch on `window` (see that file's
 * header comment for the contract) and owns the entire modal/flow itself.
 *
 * HANDSHAKE for the first-click race: class-schedule.tsx is a separate
 * client:load island; hydration order between two independent islands on
 * the same page is not guaranteed, so a click there can fire
 * `youth:trial-requested` before this component has mounted and attached
 * its window listener (observed live — the very first click was silently
 * dropped). class-schedule.tsx's `requestTrial` stashes the templateId on
 * `window.__youthTrialPending` BEFORE dispatching; the mount effect below
 * consumes (and clears) that value once, as a backstop, in addition to
 * listening for the live event.
 *
 * Sequence:
 *  1. Event fires (or `__youthTrialPending` is found on mount) → cheap auth
 *     probe via `GET /api/auth/me` (same endpoint Navigation uses). Either
 *     way (spec 2026-09-05: guest phases replace the old hard-redirect)
 *     the modal opens and fetches `/api/public/class-schedule` FRESH (never
 *     threaded from the dispatching island, per the brief) to resolve the
 *     slot + its next upcoming session(s) for the requested templateId.
 *     Unauthed routes to `guest_form` instead of `picking` once that
 *     resolves (`no_sessions` still wins for either branch when the
 *     template has nothing upcoming).
 *  1b. GUEST BRANCH (`guestMode`): `guest_form` collects parent name/email +
 *     child name/DOB + the COPPA checkbox + a Turnstile token inline —
 *     never a bounce to `/signin`. A client-side age pre-check (a local
 *     `ageOnDate` copy of the server's, run against the earliest upcoming
 *     session) blocks obviously-ineligible kids before they even reach the
 *     waiver, but the server is still the authority (see `age_ineligible`
 *     below). "Continue" moves to `guest_waiver` (same waiver copy/markup
 *     as the authed `waiver` phase); its submit is `submitGuestBooking`,
 *     which POSTs `/api/classes/guest-trial` (Task 3's endpoint — it
 *     creates the guest account, kid, and booking in one call, or emails a
 *     sign-in link and returns `existing_account` if the email already has
 *     one). The "Already have an account? Sign in instead" escape hatch
 *     stashes `PENDING_KEY` and takes the old redirect path for parents who
 *     would rather sign in than fill the form. Cross-device resume: the
 *     `existing_account` email's magic link lands back on
 *     `/youth/classes?trial=<templateId>#schedule`; the mount effect reads
 *     that query param (after the `__youthTrialPending`/sessionStorage
 *     checks, so only one auto-open ever fires) and reopens the modal —
 *     now authed, so it takes the normal picking path.
 *     Turnstile tokens are single-use server-side, so the widget is kept
 *     MOUNTED and VISIBLE (never `display:none`, never a zero-size
 *     container — a real Cloudflare challenge needs to be something a
 *     parent can actually see and solve) across `guest_form` →
 *     `guest_waiver` → `session_full_offer`, and through the `booking`
 *     phase that bridges between them (`submitGuestBooking` sets that phase
 *     synchronously before its first `await`). Every failure path in
 *     `submitGuestBooking` resets it and clears the stored token so the
 *     next submit always carries a fresh one; `guest_waiver`'s submit and
 *     `session_full_offer`'s confirm are both disabled without a live
 *     token, so a stale/expired one blocks the button instead of guaranteeing
 *     a 403. Because the widget's ideal visual slot differs per phase
 *     (above "Continue" + the sign-in escape hatch in `guest_form`; a
 *     compact block above the submit button in `guest_waiver` and
 *     `session_full_offer`) while still being ONE React element that must
 *     never unmount, each phase's fields and primary-action markup are
 *     split into separate top-level `DialogContent` children ordered via
 *     inline `style={{ order }}` (fields: 1, the shared widget: 2, primary
 *     action: 3) rather than nested inside one JSX fragment — DOM/CSS order
 *     controls the visual position, not React tree position, so the widget
 *     itself sits in one stable conditional slot (`guestTurnstileActive`)
 *     the whole time. This is the one deliberate deviation from the
 *     brief's inline snippet, which showed the widget nested directly
 *     inside `guest_form`'s markup.
 *  2. Child picker (`child-picker.tsx`, shared with Task 6):
 *     `participantKind="dependent"` — self rows are hard-excluded (see that
 *     file's header comment: a self row's `parentUserId` is null, so
 *     `createChildClassBooking`'s ownership lookup can never match it and
 *     booking always 404s `child_not_found`). Age-filtered against the
 *     slot's minAge/maxAge.
 *  3. `POST /api/classes/book { sessionId, familyMemberId, kind: "trial" }`.
 *     Attempt-then-prompt waiver: a 422 `waiver_required` expands the
 *     guardian waiver panel (same `DROPIN_WAIVER_TEXT` /
 *     `waiverAssentSentence` source choose-slot.tsx uses — never new legal
 *     copy) and resubmits with the signature.
 *  4. Success panel: class name, date/time, venue, a confirmation-email
 *     note, "Add another player" (resets to the child picker for the same
 *     slot) and Close.
 *
 * Error copy (exact strings per the task brief):
 *  - `member_child_no_trial` → "Your member kids already have classes
 *    included — book a make-up instead"; links to /dashboard/family.
 *  - `trial_already_used` → "Trial already used — join to keep coming";
 *    links to #pricing.
 *  - `child_not_found` → backstop copy (should not occur given the
 *    `participantKind="dependent"` exclusion above, but the server is the
 *    real authority on ownership): "We couldn't match that player to your
 *    account — refresh and try again."
 *  - `session_full` → NEVER auto-books an unrequested date — a trial is
 *    one-per-child-ever, so silently spending it on a date the parent
 *    didn't choose would be wrong. Instead surfaces an explicit offer
 *    ("This week's class is full — book {next date} instead?") for the
 *    template's following-week session, if the schedule payload has one;
 *    only books on the parent's confirm. No next session → "This class is
 *    full this week."
 *  - `age_ineligible` → inline on the picker (belt-and-suspenders; the
 *    picker already disables ineligible children client-side).
 *
 * Re-entrancy: a monotonic `generationRef` counter is bumped on every
 * `closeModal()` and every `openForTemplate()` call. Any async
 * continuation (the auth probe, the schedule fetch, a booking POST) checks
 * its captured generation against `generationRef.current` after each
 * `await` and bails without touching state if it's stale — this is what
 * stops a booking request that's still in flight when the parent closes
 * the modal from later reopening it via a delayed `setPhase`, and also
 * resolves the double-open race if two `youth:trial-requested` events fire
 * in quick succession.
 */

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

type Phase =
  | "closed"
  | "loading"
  | "load_error"
  | "picking"
  | "no_sessions"
  | "booking"
  | "waiver"
  | "session_full_offer"
  | "success"
  | "guest_form"
  | "guest_waiver"
  | "guest_existing"

type FlowErrorCode = "member_child_no_trial" | "trial_already_used" | "generic"

interface FlowError {
  code: FlowErrorCode
  message: string
}

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
    weekday: "long",
    month: "long",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  })
}

async function parseJson(res: Response): Promise<Record<string, unknown>> {
  try {
    return (await res.json()) as Record<string, unknown>
  } catch {
    return {}
  }
}

/**
 * Client-side copy of `ageOnDate` from `src/lib/classes/book-child.ts` —
 * same year-math, kept in sync manually. Used only for the guest form's
 * pre-submit age check (a UX nicety that avoids a round trip to the
 * server for an obviously-ineligible kid); the server's copy is the real
 * authority and is checked again on submit regardless.
 */
function ageOnDate(birthDate: string, onDate: Date): number {
  const [by, bm, bd] = birthDate.split("-").map(Number)
  let age = onDate.getUTCFullYear() - by
  const monthDiff = onDate.getUTCMonth() + 1 - bm
  if (monthDiff < 0 || (monthDiff === 0 && onDate.getUTCDate() < bd)) {
    age -= 1
  }
  return age
}

const SIGNIN_REDIRECT =
  "/signin?redirect=" + encodeURIComponent("/youth/classes#schedule")

/** sessionStorage key carrying the template a signed-out parent tried to
 *  book, so the modal REOPENS itself after the sign-in round-trip instead
 *  of dropping them back at the schedule with nothing open. */
const PENDING_KEY = "youth:trial-pending"

/** Cheap client-side shape check for the guest email field — catches an
 *  obvious typo before it reaches the server's zod `.email()` validation
 *  (which returns a 422 `invalid_body` this component can't usefully
 *  narrow further; see `submitGuestBooking`'s `invalid_body` branch). Not
 *  meant to be a complete email validator. */
const GUEST_EMAIL_SHAPE_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export default function TrialBooking() {
  useHydrationBeacon()

  const [phase, setPhase] = useState<Phase>("closed")
  const [templateId, setTemplateId] = useState<string | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [flowError, setFlowError] = useState<FlowError | null>(null)

  const [slot, setSlot] = useState<ScheduleSlot | null>(null)
  // All upcoming sessions for this template, ascending by start time (the
  // schedule endpoint's `sessions` list already sorts this way). The first
  // (earliest) one is always the initial attempt.
  const [templateSessions, setTemplateSessions] = useState<ScheduleSession[]>([])

  const [selectedChild, setSelectedChild] = useState<ChildPickerMember | null>(null)
  const [bookedSession, setBookedSession] = useState<ScheduleSession | null>(null)

  // The session a `waiver_required` response is FOR — set whenever
  // attemptBooking transitions to the "waiver" phase, so submitWaiver
  // retries against the exact session that asked for the waiver rather
  // than assuming it's always the earliest one. Matters once
  // session_full_offer is in play: the offered (following-week) session
  // can itself come back waiver_required, and submitWaiver must resubmit
  // against THAT session, not templateSessions[0].
  const [pendingSession, setPendingSession] = useState<ScheduleSession | null>(null)

  // The child a paused waiver/session_full_offer sub-flow is FOR — set by
  // attemptBooking from its explicit `child` parameter (never from
  // `selectedChild`; see attemptBooking's doc comment on the stale-closure
  // bug this guards against). submitWaiver and confirmOfferedSession use
  // THIS, not `selectedChild`, as the authoritative child for their retry.
  const [pendingChild, setPendingChild] = useState<ChildPickerMember | null>(null)

  // The session_full offer: the following-week session being proposed, and
  // the waiver (if one was already signed on the attempt that hit
  // session_full) to resubmit on confirm — never re-prompt for a waiver
  // that's already been signed in this same flow.
  const [offeredSession, setOfferedSession] = useState<ScheduleSession | null>(null)
  const [offeredWaiver, setOfferedWaiver] = useState<{ signedBy: string; consentText: string } | undefined>(
    undefined,
  )

  const [waiverAccepted, setWaiverAccepted] = useState(false)
  const [waiverSignerName, setWaiverSignerName] = useState("")

  // Guest-flow state (spec 2026-09-05). `guestMode` is set once per
  // `openForTemplate` call from the auth probe result and never toggles
  // mid-flow. The rest mirror the guest-trial endpoint's request body.
  const [guestMode, setGuestMode] = useState(false)
  const [guestParentFirst, setGuestParentFirst] = useState("")
  const [guestParentLast, setGuestParentLast] = useState("")
  const [guestEmail, setGuestEmail] = useState("")
  const [guestChildFirst, setGuestChildFirst] = useState("")
  const [guestChildLast, setGuestChildLast] = useState("")
  const [guestChildDob, setGuestChildDob] = useState("")
  const [guestCoppaConsent, setGuestCoppaConsent] = useState(false)
  const [guestTurnstileToken, setGuestTurnstileToken] = useState("")
  // Exposes .reset() — see the header comment's Turnstile paragraph for why
  // this widget stays mounted (hidden via CSS) across guest_form,
  // guest_waiver, and session_full_offer instead of only rendering inside
  // guest_form's own markup.
  const turnstileRef = useRef<TurnstileWidgetHandle>(null)

  // Monotonic generation counter — see the header comment's "Re-entrancy"
  // section. A ref (not state) because it must be readable synchronously
  // from within async continuations without waiting on a re-render.
  const generationRef = useRef(0)

  const isOpen = phase !== "closed"

  // Defensive body-scroll lock. Radix's Dialog is `modal` by default and
  // normally locks scroll itself, but the controller observed the page
  // still scrolling behind the backdrop on this page — investigated and
  // left unresolved which of this app's global layout styles is defeating
  // react-remove-scroll's target detection; enforcing it directly here is
  // simpler and robust regardless of the root cause.
  useEffect(() => {
    if (!isOpen) return
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = "hidden"
    return () => {
      document.body.style.overflow = previousOverflow
    }
  }, [isOpen])

  const openForTemplate = useCallback(async (id: string, opts?: { resume?: boolean }) => {
    const myGeneration = ++generationRef.current
    trackTrialModalOpened({ templateId: id })

    let authed = false
    try {
      const meRes = await fetch("/api/auth/me", { credentials: "same-origin" })
      const me = meRes.ok ? await meRes.json() : { user: null }
      authed = Boolean(me?.user)
    } catch {
      authed = false
    }
    if (myGeneration !== generationRef.current) return // superseded meanwhile

    // Guest mode (spec 2026-09-05): no more hard bounce. Load the same
    // schedule payload and collect email + kid + waiver inline. The
    // `resume` flag no longer gates anything here (the redirect it used to
    // guard is gone) — it only documents that this open came from the
    // sign-in-round-trip / cross-device-link backstops rather than a fresh
    // click, which matters to the mount effect's dedupe, not to this
    // function's behavior.
    setGuestMode(!authed)

    setTemplateId(id)
    setLoadError(null)
    setFlowError(null)
    setSelectedChild(null)
    setBookedSession(null)
    setPendingSession(null)
    setPendingChild(null)
    setOfferedSession(null)
    setOfferedWaiver(undefined)
    setWaiverAccepted(false)
    setWaiverSignerName("")
    setGuestParentFirst("")
    setGuestParentLast("")
    setGuestEmail("")
    setGuestChildFirst("")
    setGuestChildLast("")
    setGuestChildDob("")
    setGuestCoppaConsent(false)
    setGuestTurnstileToken("")
    setPhase("loading")

    try {
      const res = await fetch("/api/public/class-schedule")
      if (!res.ok) throw new Error("bad status")
      const body = (await res.json()) as { slots: ScheduleSlot[]; sessions: ScheduleSession[] }
      if (myGeneration !== generationRef.current) return
      const foundSlot = body.slots.find((s) => s.templateId === id)
      if (!foundSlot) {
        setLoadError("This class isn't available right now — refresh the page and try again.")
        setPhase("load_error")
        return
      }
      const sessionsForTemplate = body.sessions
        .filter((s) => s.templateId === id)
        .sort((a, b) => a.startsAt.localeCompare(b.startsAt))
      setSlot(foundSlot)
      setTemplateSessions(sessionsForTemplate)
      if (sessionsForTemplate.length === 0) {
        setPhase("no_sessions")
      } else if (!authed) {
        trackTrialGuestFormShown({ templateId: id })
        setPhase("guest_form")
      } else {
        setPhase("picking")
      }
    } catch {
      if (myGeneration !== generationRef.current) return
      setLoadError("Couldn't load this class — please try again.")
      setPhase("load_error")
    }
  }, [])

  useEffect(() => {
    function handleTrialRequested(e: Event) {
      const detail = (e as CustomEvent<{ templateId?: string }>).detail
      if (!detail?.templateId) return
      void openForTemplate(detail.templateId)
    }
    window.addEventListener("youth:trial-requested", handleTrialRequested)

    // Handshake backstop — see the header comment. Consume-and-clear once
    // on mount so a click that fired before this listener was attached
    // still opens the modal.
    const pendingTemplateId = window.__youthTrialPending
    if (pendingTemplateId) {
      window.__youthTrialPending = undefined
      void openForTemplate(pendingTemplateId)
    } else {
      // Sign-in round-trip resume: a signed-out click stashed its template
      // before redirecting to /signin. Consume-and-clear so the modal
      // reopens exactly once on the way back.
      let stored: string | null = null
      try {
        stored = sessionStorage.getItem(PENDING_KEY)
        if (stored) sessionStorage.removeItem(PENDING_KEY)
      } catch {
        stored = null
      }
      if (stored) {
        void openForTemplate(stored, { resume: true })
      } else {
        // Cross-device / cross-session resume: the guest-trial endpoint's
        // "existing_account" email links back to
        // `/youth/classes?trial=<templateId>#schedule` — this is that
        // landing point. By now the parent has followed the magic link and
        // is authed, so this resolves through the normal (non-guest)
        // picking path. Consume-and-clear (strip the query param from the
        // URL) so a refresh doesn't silently re-open the modal and
        // re-fire trial_modal_opened.
        const url = new URL(window.location.href)
        const trialParam = url.searchParams.get("trial")
        if (trialParam) {
          url.searchParams.delete("trial")
          window.history.replaceState(null, "", url.pathname + url.search + url.hash)
          void openForTemplate(trialParam, { resume: true })
        }
      }
    }

    return () => window.removeEventListener("youth:trial-requested", handleTrialRequested)
  }, [openForTemplate])

  function closeModal() {
    generationRef.current += 1
    setPhase("closed")
  }

  /**
   * `child` is an explicit parameter — NEVER read `selectedChild` (state)
   * inside this function. Root-cause bug (controller live-testing,
   * reproduced): `attemptBooking` is a plain closure created fresh each
   * render; when `handleSelectChild` calls `setSelectedChild(member)` and
   * then immediately invokes `attemptBooking`, the state update hasn't
   * committed yet — `attemptBooking`'s closure over `selectedChild` is
   * frozen to whatever it was at the START of that render (null on the
   * very first pick in a fresh modal, or the PREVIOUSLY selected child on
   * any pick after the first). That produced two failures: the first
   * click in a fresh modal silently no-op'd on a `!selectedChild` guard
   * (no spinner, no request — just an unexplained no-op), and a second
   * click booked the FIRST child's id while the UI had already visually
   * moved on to the second. Passing `child` as a parameter sidesteps
   * React's state-commit timing entirely — it's an ordinary JS value
   * captured by value at the call site, always correct.
   */
  const blocked = (reason: TrialBlockedReason) =>
    trackTrialBlocked({ templateId: templateId ?? "", reason })

  async function attemptBooking(
    session: ScheduleSession,
    child: ChildPickerMember,
    waiver: { signedBy: string; consentText: string } | undefined,
    myGeneration: number,
  ) {
    setPhase("booking")
    setFlowError(null)
    trackTrialBookingAttempted({ templateId: templateId ?? "" })

    let res: Response
    try {
      res = await fetch("/api/classes/book", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId: session.id,
          familyMemberId: child.id,
          kind: "trial",
          ...(waiver ? { waiver } : {}),
        }),
      })
    } catch {
      if (myGeneration !== generationRef.current) return
      blocked("network")
      setFlowError({ code: "generic", message: "Network error — please try again." })
      setPhase("picking")
      return
    }

    if (myGeneration !== generationRef.current) return // modal closed/reopened while this was in flight

    if (res.ok) {
      trackTrialBooked({ templateId: templateId ?? "", alreadyBooked: false })
      setBookedSession(session)
      setPhase("success")
      return
    }

    const body = await parseJson(res)
    if (myGeneration !== generationRef.current) return

    const code = typeof body.error === "string" ? body.error : undefined

    if (code === "waiver_required") {
      trackTrialWaiverShown({ templateId: templateId ?? "" })
      setPendingSession(session)
      setPendingChild(child)
      setPhase("waiver")
      return
    }

    if (code === "already_booked") {
      trackTrialBooked({ templateId: templateId ?? "", alreadyBooked: true })
      setBookedSession(session)
      setPhase("success")
      return
    }

    if (code === "session_full") {
      // Never auto-book an unrequested date — a trial is one-per-child-
      // ever, so silently spending it on a date the parent didn't choose
      // is exactly the wrong failure mode. Surface an explicit offer
      // instead; only book on confirm (see confirmOfferedSession).
      const idx = templateSessions.findIndex((s) => s.id === session.id)
      const next = idx >= 0 ? templateSessions[idx + 1] : undefined
      if (next) {
        trackTrialFullOfferShown({ templateId: templateId ?? "" })
        setOfferedSession(next)
        setOfferedWaiver(waiver)
        setPendingChild(child)
        setPhase("session_full_offer")
        return
      }
      blocked("session_full_no_alternative")
      setFlowError({ code: "generic", message: "This class is full this week." })
      setPhase("picking")
      return
    }

    if (code === "member_child_no_trial") {
      blocked("member_child_no_trial")
      setFlowError({
        code: "member_child_no_trial",
        message: "Your member kids already have classes included — book a make-up instead",
      })
      setPhase("picking")
      return
    }

    if (code === "trial_already_used") {
      blocked("trial_already_used")
      setFlowError({
        code: "trial_already_used",
        message: "Trial already used — join to keep coming",
      })
      setPhase("picking")
      return
    }

    if (code === "child_not_found") {
      blocked("child_not_found")
      // Backstop only — should not occur given ChildPicker's
      // participantKind="dependent" exclusion of self rows. Surfacing
      // rather than silently failing in case ownership ever legitimately
      // changes mid-flow (e.g. the player was removed on another tab).
      setFlowError({
        code: "generic",
        message: "We couldn't match that player to your account — refresh and try again.",
      })
      setPhase("picking")
      return
    }

    if (code === "age_ineligible") {
      blocked("age_ineligible")
      setFlowError({
        code: "generic",
        message: `${child.firstName} is outside this class's age range — pick another player above.`,
      })
      setPhase("picking")
      return
    }

    blocked("generic")
    setFlowError({
      code: "generic",
      message: typeof body.message === "string" ? body.message : "Could not book this class — please try again.",
    })
    setPhase("picking")
  }

  const canContinueGuestForm =
    guestParentFirst.trim().length > 0 &&
    guestParentLast.trim().length > 0 &&
    GUEST_EMAIL_SHAPE_RE.test(guestEmail.trim()) &&
    guestChildFirst.trim().length > 0 &&
    guestChildLast.trim().length > 0 &&
    guestChildDob.length > 0 &&
    guestCoppaConsent &&
    guestTurnstileToken.length > 0

  /**
   * Client-side age pre-check against the earliest upcoming session (the
   * same one `submitGuestBooking` targets by default) — belt-and-suspenders
   * only; the server re-checks on submit and is the real authority (see
   * `age_ineligible` in `submitGuestBooking`).
   */
  function handleGuestContinue() {
    if (!slot) return
    const targetSession = templateSessions[0]
    if (!targetSession) return
    setFlowError(null)
    const age = ageOnDate(guestChildDob, new Date(targetSession.startsAt))
    const tooYoung = slot.minAge !== null && age < slot.minAge
    const tooOld = slot.maxAge !== null && age > slot.maxAge
    if (tooYoung || tooOld) {
      blocked("age_ineligible")
      setFlowError({
        code: "generic",
        message: `${guestChildFirst.trim() || "This child"} is outside this class's age range.`,
      })
      return
    }
    setWaiverSignerName(`${guestParentFirst} ${guestParentLast}`.trim())
    trackTrialWaiverShown({ templateId: templateId ?? "" })
    setPhase("guest_waiver")
  }

  /**
   * Guest submit — POSTs `/api/classes/guest-trial` (Task 3). Mirrors
   * `attemptBooking`'s re-entrancy discipline (every await checks its
   * captured `myGeneration`) but has no waiver_required round trip: the
   * waiver is collected up front and sent on this single request.
   */
  async function submitGuestBooking(session: ScheduleSession, myGeneration: number) {
    setPhase("booking")
    trackTrialGuestSubmitted({ templateId: templateId ?? "" })
    trackTrialBookingAttempted({ templateId: templateId ?? "" })

    let res: Response
    try {
      res = await fetch("/api/classes/guest-trial", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId: session.id,
          turnstileToken: guestTurnstileToken,
          parent: {
            firstName: guestParentFirst.trim(),
            lastName: guestParentLast.trim(),
            email: guestEmail.trim(),
          },
          child: {
            firstName: guestChildFirst.trim(),
            lastName: guestChildLast.trim(),
            birthDate: guestChildDob,
          },
          parentalConsent: true,
          waiver: { signedBy: waiverSignerName.trim(), consentText: DROPIN_WAIVER_TEXT },
        }),
      })
    } catch {
      if (myGeneration !== generationRef.current) return
      blocked("network")
      setFlowError({ code: "generic", message: "Network error — please try again." })
      setPhase("guest_waiver")
      return
    }
    if (myGeneration !== generationRef.current) return
    const body = await parseJson(res)
    if (myGeneration !== generationRef.current) return

    if (res.ok && body.status === "booked") {
      trackTrialBooked({ templateId: templateId ?? "", alreadyBooked: false })
      setBookedSession(session)
      setPhase("success")
      return
    }
    if (res.ok && body.status === "existing_account") {
      trackTrialGuestExistingAccount({ templateId: templateId ?? "" })
      setPhase("guest_existing")
      return
    }

    const code = typeof body.error === "string" ? body.error : undefined

    // Every non-success response has already spent this attempt's Turnstile
    // token server-side — siteverify consumes a token on the FIRST
    // verification call regardless of whether the booking itself then
    // succeeds — except `rate_limited` from the earlier per-IP burst gate,
    // which fires before Turnstile is even checked. Resetting unconditionally
    // on every failure is harmless in that one case and required in every
    // other, so it's simpler than trying to distinguish server-side reasons
    // here. The widget stays mounted (see header comment) so this actually
    // reaches a live instance.
    setGuestTurnstileToken("")
    turnstileRef.current?.reset()

    if (code === "rate_limited") {
      blocked("rate_limited")
      setFlowError({
        code: "generic",
        message: "Too many attempts — please try again in a few minutes.",
      })
      setPhase("guest_waiver")
      return
    }
    if (code === "turnstile_failed") {
      blocked("turnstile_failed")
      setFlowError({ code: "generic", message: "We couldn't verify you're human — please retry." })
      setPhase("guest_waiver")
      return
    }
    if (code === "session_full") {
      const idx = templateSessions.findIndex((s) => s.id === session.id)
      const next = idx >= 0 ? templateSessions[idx + 1] : undefined
      if (next) {
        trackTrialFullOfferShown({ templateId: templateId ?? "" })
        setOfferedSession(next)
        setPhase("session_full_offer")
        return
      }
      blocked("session_full_no_alternative")
      setFlowError({ code: "generic", message: "This class is full this week." })
      setPhase("guest_form")
      return
    }
    if (code === "trial_already_used") {
      blocked("trial_already_used")
      setFlowError({
        code: "trial_already_used",
        message:
          "Looks like this player has already had their free trial — sign in to the account you used before.",
      })
      setPhase("guest_form")
      return
    }
    if (code === "age_ineligible") {
      blocked("age_ineligible")
      setFlowError({
        code: "generic",
        message: `${guestChildFirst.trim()} is outside this class's age range.`,
      })
      setPhase("guest_form")
      return
    }
    if (code === "invalid_body") {
      // The client-side email shape check in canContinueGuestForm should
      // catch most of what would trip this — the server (zod) is still
      // authoritative, so this is a backstop, not the primary defense.
      blocked("generic")
      setFlowError({
        code: "generic",
        message:
          "Something in the form didn't validate — double-check the email address and birth date, then try again.",
      })
      setPhase("guest_form")
      return
    }
    blocked("generic")
    setFlowError({
      code: "generic",
      message: typeof body.message === "string" ? body.message : "Could not book this class — please try again.",
    })
    setPhase("guest_form")
  }

  function handleSelectChild(member: ChildPickerMember) {
    // Bump BEFORE starting the new attempt — invalidates any attemptBooking
    // still in flight for a PREVIOUSLY selected child. Without this, picking
    // child B while child A's request is still pending let A's late
    // response (e.g. waiver_required) drive the phase after selectedChild
    // had already moved on to B — reproduced live (controller finding).
    const myGeneration = ++generationRef.current
    setSelectedChild(member)
    setFlowError(null)
    setPendingSession(null)
    setPendingChild(null)
    setOfferedSession(null)
    setOfferedWaiver(undefined)
    const targetSession = templateSessions[0]
    if (!targetSession) return
    // `member` is passed directly — see attemptBooking's doc comment on
    // why this must never be `selectedChild` (the state var).
    void attemptBooking(targetSession, member, undefined, myGeneration)
  }

  async function submitWaiver(e: React.FormEvent) {
    e.preventDefault()
    if (!waiverAccepted || waiverSignerName.trim().length === 0) return
    // Retry against the exact session AND child this waiver_required
    // response was for — never `selectedChild`; see pendingSession's and
    // pendingChild's doc comments.
    if (!pendingSession || !pendingChild) return
    await attemptBooking(
      pendingSession,
      pendingChild,
      { signedBy: waiverSignerName.trim(), consentText: DROPIN_WAIVER_TEXT },
      generationRef.current,
    )
  }

  /**
   * Plain click handler, not a `<form onSubmit>` — the waiver fields, the
   * shared Turnstile widget, and this submit button live in three separate
   * top-level DialogContent children (CSS `order` positions them, not DOM
   * nesting; see guestTurnstileActive's doc comment), so they can't share
   * one `<form>` element.
   */
  async function submitGuestWaiver() {
    if (!waiverAccepted || waiverSignerName.trim().length === 0) return
    // Gate on a live token exactly like the session_full_offer confirm —
    // Turnstile tokens are single-use, so an empty/stale one here would be a
    // guaranteed 403 round trip instead of a disabled button.
    if (!guestTurnstileToken) return
    // Guests always target the earliest upcoming session on first submit —
    // there's no waiver_required round trip to pin a specific pendingSession
    // to (the waiver is collected up front and sent in the same request).
    const targetSession = templateSessions[0]
    if (!targetSession) return
    await submitGuestBooking(targetSession, generationRef.current)
  }

  /**
   * Enter-to-submit for guest inputs that live outside a `<form>` — the
   * fields/widget/primary-action split (see guestTurnstileActive's doc
   * comment) means these buttons can't rely on native form-submit-on-Enter.
   * Mirrors the inline onKeyDown-calls-the-action pattern already used for
   * team-create.tsx's discount code input, but adds the no-modifiers guard
   * and an explicit `enabled` check mirroring the corresponding button's
   * `disabled` condition, so Enter never fires a submit the button itself
   * wouldn't allow.
   */
  function submitOnEnter(
    e: React.KeyboardEvent<HTMLInputElement>,
    enabled: boolean,
    action: () => void,
  ) {
    if (e.key !== "Enter" || e.shiftKey || e.ctrlKey || e.metaKey || e.altKey || !enabled) return
    e.preventDefault()
    action()
  }

  function confirmOfferedSession() {
    if (!offeredSession) return
    const session = offeredSession
    if (guestMode) {
      // Turnstile tokens are single-use — the token that got us here was
      // already spent by the attempt that hit session_full, and
      // submitGuestBooking's failure path already reset the widget and
      // cleared guestTurnstileToken, so gate on a fresh one having arrived
      // before firing the tracking call or the request.
      if (!guestTurnstileToken) return
      trackTrialFullOfferAccepted({ templateId: templateId ?? "" })
      setOfferedSession(null)
      void submitGuestBooking(session, generationRef.current)
      return
    }
    // Signed-in path unchanged: same `!pendingChild` guard, same relative
    // position of the tracking call, as before the guest branch existed.
    if (!pendingChild) return
    trackTrialFullOfferAccepted({ templateId: templateId ?? "" })
    const waiver = offeredWaiver
    const child = pendingChild
    setOfferedSession(null)
    setOfferedWaiver(undefined)
    void attemptBooking(session, child, waiver, generationRef.current)
  }

  function declineOfferedSession() {
    setOfferedSession(null)
    setOfferedWaiver(undefined)
    setPendingChild(null)
    setFlowError(null)
    setPhase(guestMode ? "guest_form" : "picking")
  }

  function resetToPicker() {
    // Only reachable from the authed success panel ("Add another player" is
    // hidden in guest mode), but set defensively so this stays correct by
    // construction even if that ever changes.
    setGuestMode(false)
    setSelectedChild(null)
    setBookedSession(null)
    setPendingSession(null)
    setPendingChild(null)
    setOfferedSession(null)
    setOfferedWaiver(undefined)
    setFlowError(null)
    setWaiverAccepted(false)
    setWaiverSignerName("")
    setPhase(templateSessions.length === 0 ? "no_sessions" : "picking")
  }

  function scrollToPricing() {
    closeModal()
    document.getElementById("pricing")?.scrollIntoView({ behavior: "smooth" })
  }

  /** Shared `flowError` banner markup — used by the authed picking/booking
   *  panel and by both guest panels (guest_form, guest_waiver). */
  function renderFlowError() {
    if (!flowError) return null
    return (
      <div className="rounded-lg border border-amber-200 bg-amber-50/60 p-3 text-sm text-ink-2 space-y-1.5">
        <p>{flowError.message}</p>
        {flowError.code === "member_child_no_trial" && (
          <a href="/dashboard/family" className="inline-block font-medium text-ochre hover:underline">
            Go to your dashboard →
          </a>
        )}
        {flowError.code === "trial_already_used" && (
          <button
            type="button"
            onClick={scrollToPricing}
            className="inline-block font-medium text-ochre hover:underline"
          >
            See pricing →
          </button>
        )}
      </div>
    )
  }

  /** True while a guest phase that needs a live, VISIBLE Turnstile widget
   *  instance is active — see the header comment's Turnstile paragraph.
   *  Includes "booking": `submitGuestBooking` sets that phase synchronously
   *  before its first `await`, so omitting it would unmount the widget (and
   *  null `turnstileRef.current`) for the entire request/response round
   *  trip, turning every `.reset()` on a failure path into a silent no-op —
   *  exactly the bug this fixes. The widget's visual slot (via CSS `order`,
   *  see the render below) differs per phase, but the React element itself
   *  never unmounts across this whole set. */
  const guestTurnstileActive =
    guestMode &&
    (phase === "guest_form" ||
      phase === "guest_waiver" ||
      phase === "session_full_offer" ||
      phase === "booking")

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && closeModal()}>
      {/* Height-capped + its own scroll region as a whole-dialog safety net
          (e.g. long waiver text on a small viewport) — ChildPicker's list
          is the PRIMARY scroll region for the "30+ children" case (see that
          file), so this outer scroll should rarely engage in practice. */}
      <DialogContent className="bg-paper border-cream-3 text-ink max-w-md max-h-[85vh] overflow-y-auto">
        {phase === "loading" && (
          <>
            <DialogTitle className="text-ink">Booking your free trial</DialogTitle>
            <DialogDescription className="text-ink-muted">
              Loading this class's details…
            </DialogDescription>
            <LoadingSkeleton variant="card" rows={2} />
          </>
        )}

        {phase === "load_error" && (
          <>
            <DialogTitle className="text-ink">Couldn't load this class</DialogTitle>
            <DialogDescription className="text-ink-muted">
              Something went wrong fetching this class's details.
            </DialogDescription>
            <ErrorBanner message={loadError} />
            <Button
              type="button"
              variant="outline"
              onClick={() => templateId && void openForTemplate(templateId)}
            >
              Try again
            </Button>
          </>
        )}

        {phase === "no_sessions" && slot && (
          <>
            <DialogTitle className="text-ink">{slot.name}</DialogTitle>
            <DialogDescription className="text-ink-muted">
              No upcoming class time is scheduled right now — leave your email and we&#39;ll tell
              you the moment one opens.
            </DialogDescription>
            {/* Never a dead end: the capture matches the finder empty-state
                pattern (audience parent, source names this surface). */}
            <EmptyNotifyForm audience="parent" source="trial-no-sessions" />
            <Button type="button" variant="outline" onClick={closeModal}>
              Close
            </Button>
          </>
        )}

        {(phase === "picking" || phase === "booking") && slot && !guestMode && (
          <>
            <DialogTitle className="text-ink">Book a free trial — {slot.name}</DialogTitle>
            <DialogDescription className="text-ink-muted">
              {formatDayTime(slot.weekday, slot.startTime)}
              {slot.venueName || slot.locationName ? ` · ${slot.venueName ?? slot.locationName}` : ""}
            </DialogDescription>

            {renderFlowError()}

            {/* relative + overlay so the "booking" phase is visibly busy —
                controller live-testing found the modal looked like an idle
                picker while a request was in flight (natively-disabled
                buttons alone read as identical to the idle state). */}
            <div className="relative">
              <ChildPicker
                ageRange={{ minAge: slot.minAge, maxAge: slot.maxAge }}
                selectedId={selectedChild?.id ?? null}
                onSelect={handleSelectChild}
                disabled={phase === "booking"}
                participantKind="dependent"
              />
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

        {/* Guest equivalent of the "booking" spinner above — no ChildPicker
            to overlay (there's no child selection step in the guest flow),
            so this is its own small panel. */}
        {phase === "booking" && guestMode && slot && (
          <>
            <DialogTitle className="text-ink">Booking your free trial</DialogTitle>
            <DialogDescription className="text-ink-muted">Just a moment…</DialogDescription>
            <div
              className="flex items-center justify-center gap-2 rounded-lg bg-paper/85 p-6 text-sm font-medium text-ink-2"
              role="status"
              aria-live="polite"
            >
              <div
                className="size-4 rounded-full border-2 border-ochre border-t-transparent animate-spin"
                aria-hidden="true"
              />
              Booking…
            </div>
          </>
        )}

        {phase === "session_full_offer" && slot && offeredSession && (
          <>
            <DialogTitle className="text-ink">This week's class is full</DialogTitle>
            <DialogDescription className="text-ink-2">
              Book {formatDateTime(offeredSession.startsAt)} instead?
            </DialogDescription>
            {renderFlowError()}
          </>
        )}

        {/* Split from the fragment above/below via CSS `order` (not DOM
            position) so the shared Turnstile widget — rendered once, order 2,
            near the bottom of this file — can sit visually between them
            without ever unmounting. See guestTurnstileActive's doc comment. */}
        {phase === "session_full_offer" && slot && offeredSession && (
          <div className="flex gap-3" style={{ order: 3 }}>
            <Button
              type="button"
              onClick={confirmOfferedSession}
              disabled={guestMode && !guestTurnstileToken}
            >
              Book that class
            </Button>
            <Button type="button" variant="outline" onClick={declineOfferedSession}>
              Back
            </Button>
          </div>
        )}

        {phase === "waiver" && slot && (
          <form onSubmit={(e) => void submitWaiver(e)} className="space-y-4">
            <DialogTitle className="text-ink">One more step: sign the guardian waiver</DialogTitle>
            <DialogDescription className="text-ink-2">
              {/* pendingChild, not selectedChild — this is the exact child
                  the paused waiver_required response is for; see
                  attemptBooking's doc comment. */}
              {(pendingChild ? `${pendingChild.firstName} ${pendingChild.lastName}` : "Your player")}{" "}
              is trying {slot.name} — this covers their free trial class.
            </DialogDescription>

            <p className="text-sm text-ink-2 leading-relaxed rounded-lg border border-amber-200 bg-amber-50/60 p-3">
              {DROPIN_WAIVER_TEXT}
            </p>

            <div className="flex items-start gap-3">
              <Checkbox
                id="trial-waiver-accept"
                checked={waiverAccepted}
                onCheckedChange={(checked) => setWaiverAccepted(checked === true)}
              />
              <Label htmlFor="trial-waiver-accept" className="text-sm leading-snug cursor-pointer">
                {waiverAssentSentence(
                  "guardian",
                  pendingChild ? `${pendingChild.firstName} ${pendingChild.lastName}` : undefined,
                )}
              </Label>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="trial-waiver-signer-name" className="text-sm">
                Parent/guardian signature
              </Label>
              <Input
                id="trial-waiver-signer-name"
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
              Sign waiver & book trial
            </Button>
          </form>
        )}

        {phase === "guest_form" && slot && (
          <>
            <DialogTitle className="text-ink">Book a free trial — {slot.name}</DialogTitle>
            <DialogDescription className="text-ink-muted">
              {formatDayTime(slot.weekday, slot.startTime)}
              {slot.venueName || slot.locationName ? ` · ${slot.venueName ?? slot.locationName}` : ""}
            </DialogDescription>

            {renderFlowError()}
          </>
        )}

        {/* Split from the title/description/error above and the Continue +
            escape-hatch below via CSS `order` (not DOM position) so the
            shared Turnstile widget — rendered once, order 2, near the bottom
            of this file — can sit visually between "fields" and "primary
            action" without ever unmounting. See guestTurnstileActive's doc
            comment. */}
        {phase === "guest_form" && slot && (
          <div className="space-y-4" style={{ order: 1 }}>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="guest-parent-first" className="text-sm">
                  Your first name
                </Label>
                <Input
                  id="guest-parent-first"
                  value={guestParentFirst}
                  onChange={(e) => setGuestParentFirst(e.target.value)}
                  autoComplete="given-name"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="guest-parent-last" className="text-sm">
                  Your last name
                </Label>
                <Input
                  id="guest-parent-last"
                  value={guestParentLast}
                  onChange={(e) => setGuestParentLast(e.target.value)}
                  autoComplete="family-name"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="guest-email" className="text-sm">
                Your email
              </Label>
              <Input
                id="guest-email"
                type="email"
                value={guestEmail}
                onChange={(e) => setGuestEmail(e.target.value)}
                onKeyDown={(e) => submitOnEnter(e, canContinueGuestForm, handleGuestContinue)}
                autoComplete="email"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="guest-child-first" className="text-sm">
                  Child's first name
                </Label>
                <Input
                  id="guest-child-first"
                  value={guestChildFirst}
                  onChange={(e) => setGuestChildFirst(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="guest-child-last" className="text-sm">
                  Child's last name
                </Label>
                <Input
                  id="guest-child-last"
                  value={guestChildLast}
                  onChange={(e) => setGuestChildLast(e.target.value)}
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="guest-child-dob" className="text-sm">
                Child's date of birth
              </Label>
              <Input
                id="guest-child-dob"
                type="date"
                value={guestChildDob}
                max={new Date().toISOString().slice(0, 10)}
                onChange={(e) => setGuestChildDob(e.target.value)}
              />
            </div>

            <div className="flex items-start gap-3">
              <Checkbox
                id="guest-coppa"
                checked={guestCoppaConsent}
                onCheckedChange={(c) => setGuestCoppaConsent(c === true)}
              />
              <Label htmlFor="guest-coppa" className="text-sm leading-snug cursor-pointer">
                I am this child's parent or legal guardian and I consent to Aspire
                collecting their information for this class. Required by federal law
                (COPPA) for participants under 13.
              </Label>
            </div>
          </div>
        )}

        {phase === "guest_form" && slot && (
          <div className="space-y-3" style={{ order: 3 }}>
            <Button
              type="button"
              onClick={handleGuestContinue}
              disabled={!canContinueGuestForm}
              className="w-full sm:w-auto"
            >
              Continue
            </Button>

            <div>
              <button
                type="button"
                className="text-sm text-ink-muted underline"
                onClick={() => {
                  try {
                    sessionStorage.setItem(PENDING_KEY, templateId ?? "")
                  } catch {
                    /* storage unavailable — the parent just re-clicks after signin */
                  }
                  window.location.href = SIGNIN_REDIRECT
                }}
              >
                Already have an account? Sign in instead
              </button>
            </div>
          </div>
        )}

        {phase === "guest_waiver" && slot && (
          <>
            <DialogTitle className="text-ink">One more step: sign the guardian waiver</DialogTitle>
            <DialogDescription className="text-ink-2">
              {guestChildFirst.trim() || "Your player"} {guestChildLast.trim()} is trying{" "}
              {slot.name} — this covers their free trial class.
            </DialogDescription>

            {renderFlowError()}
          </>
        )}

        {/* Split via CSS `order` — see guestTurnstileActive's doc comment. */}
        {phase === "guest_waiver" && slot && (
          <div className="space-y-4" style={{ order: 1 }}>
            <p className="text-sm text-ink-2 leading-relaxed rounded-lg border border-amber-200 bg-amber-50/60 p-3">
              {DROPIN_WAIVER_TEXT}
            </p>

            <div className="flex items-start gap-3">
              <Checkbox
                id="guest-waiver-accept"
                checked={waiverAccepted}
                onCheckedChange={(checked) => setWaiverAccepted(checked === true)}
              />
              <Label htmlFor="guest-waiver-accept" className="text-sm leading-snug cursor-pointer">
                {waiverAssentSentence(
                  "guardian",
                  `${guestChildFirst.trim()} ${guestChildLast.trim()}`.trim() || undefined,
                )}
              </Label>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="guest-waiver-signer-name" className="text-sm">
                Parent/guardian signature
              </Label>
              <Input
                id="guest-waiver-signer-name"
                value={waiverSignerName}
                onChange={(e) => setWaiverSignerName(e.target.value)}
                onKeyDown={(e) =>
                  submitOnEnter(
                    e,
                    waiverAccepted && waiverSignerName.trim().length > 0 && Boolean(guestTurnstileToken),
                    () => void submitGuestWaiver(),
                  )
                }
                placeholder="Your full name"
                autoComplete="name"
              />
            </div>
          </div>
        )}

        {phase === "guest_waiver" && slot && (
          <div style={{ order: 3 }}>
            <Button
              type="button"
              onClick={() => void submitGuestWaiver()}
              disabled={!waiverAccepted || waiverSignerName.trim().length === 0 || !guestTurnstileToken}
              className="w-full sm:w-auto"
            >
              Sign waiver & book trial
            </Button>
          </div>
        )}

        {phase === "guest_existing" && slot && (
          <>
            <DialogTitle className="text-ink">You already have an account</DialogTitle>
            <DialogDescription className="text-ink-muted">
              We just emailed you a sign-in link. Open it and we&#39;ll bring you
              straight back to book {slot.name} — your pick is saved.
            </DialogDescription>
            <Button type="button" variant="outline" onClick={closeModal}>
              Close
            </Button>
          </>
        )}

        {/* Turnstile widget for the guest flow — kept MOUNTED and VISIBLE
            (never display:none, never zero-size) across guest_form,
            guest_waiver, session_full_offer, AND the "booking" phase that
            bridges between them (submitGuestBooking sets phase "booking"
            synchronously before its first await). See guestTurnstileActive's
            doc comment: unmounting it on any of these transitions would null
            out turnstileRef.current exactly when a retry needs .reset() to
            mint a fresh (single-use) token — this is a real Cloudflare
            widget, so it also needs to stay visible for a parent to
            interact with if a challenge ever requires it (a hidden
            container can't present one). Visual position is CSS `order`
            (order: 2, between each phase's "fields" content at order 1 and
            its primary action at order 3), not DOM nesting, since the same
            element must survive across fragments that render completely
            different surrounding content. */}
        {guestTurnstileActive && (
          <div className="space-y-1.5" style={{ order: 2 }}>
            <TurnstileWidget
              ref={turnstileRef}
              onToken={setGuestTurnstileToken}
              onError={() => {
                // Token expiry ALSO fires this (turnstile-widget.tsx wires
                // expired-callback to onError, not just render failures) —
                // clear the stale token so the gated buttons above/below
                // honestly reflect "no valid token" and the visible widget
                // lets the parent re-solve. Never emit trial_blocked here:
                // that reason is reserved for the server's actual 403, not
                // a client-side expiry/render hiccup.
                setGuestTurnstileToken("")
              }}
            />
          </div>
        )}

        {phase === "success" && slot && bookedSession && (
          <>
            <DialogTitle className="text-ink">You're all set!</DialogTitle>
            <DialogDescription className="text-ink-muted">
              {guestMode
                ? `${guestChildFirst.trim()}'s`
                : selectedChild
                  ? `${selectedChild.firstName}'s`
                  : "Your player's"}{" "}
              free trial is booked.
            </DialogDescription>
            <div className="rounded-xl border border-emerald-300 bg-emerald-50 px-5 py-5 text-emerald-900 space-y-2">
              <p className="font-semibold">{slot.name}</p>
              <p className="text-sm">{formatDateTime(bookedSession.startsAt)}</p>
              {(slot.venueName || slot.locationName) && (
                <p className="text-sm">{slot.venueName ?? slot.locationName}</p>
              )}
              <p className="text-sm opacity-90">Confirmation email on its way.</p>
            </div>
            <div className="flex gap-3">
              {/* Guest success hides this: their booking is live, but the
                  picker path assumes an authed child-fetch. */}
              {!guestMode && (
                <Button type="button" variant="outline" onClick={resetToPicker}>
                  Add another player
                </Button>
              )}
              <Button type="button" onClick={closeModal}>
                Close
              </Button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
