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
import { DROPIN_WAIVER_TEXT } from "@/lib/dropin/waiver-text"
import { waiverAssentSentence } from "@/lib/consents/waiver-consent-language"
import { ChildPicker, type ChildPickerMember } from "@/components/youth/child-picker"

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
 *     probe via `GET /api/auth/me` (same endpoint Navigation uses).
 *     Unauthed → hard redirect to `/signin?redirect=/youth/classes#schedule`.
 *     Authed → open the modal and fetch `/api/public/class-schedule` FRESH
 *     (never threaded from the dispatching island, per the brief) to
 *     resolve the slot + its next upcoming session(s) for the requested
 *     templateId.
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

const SIGNIN_REDIRECT =
  "/signin?redirect=" + encodeURIComponent("/youth/classes#schedule")

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

  const openForTemplate = useCallback(async (id: string) => {
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

    if (!authed) {
      window.location.href = SIGNIN_REDIRECT
      return
    }

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
      setPhase(sessionsForTemplate.length === 0 ? "no_sessions" : "picking")
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

  function confirmOfferedSession() {
    if (!offeredSession || !pendingChild) return
    trackTrialFullOfferAccepted({ templateId: templateId ?? "" })
    const session = offeredSession
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
    setPhase("picking")
  }

  function resetToPicker() {
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
              No upcoming class time is scheduled right now — check back soon.
            </DialogDescription>
            <Button type="button" variant="outline" onClick={closeModal}>
              Close
            </Button>
          </>
        )}

        {(phase === "picking" || phase === "booking") && slot && (
          <>
            <DialogTitle className="text-ink">Book a free trial — {slot.name}</DialogTitle>
            <DialogDescription className="text-ink-muted">
              {formatDayTime(slot.weekday, slot.startTime)}
              {slot.venueName || slot.locationName ? ` · ${slot.venueName ?? slot.locationName}` : ""}
            </DialogDescription>

            {flowError && (
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
            )}

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

        {phase === "session_full_offer" && slot && offeredSession && (
          <>
            <DialogTitle className="text-ink">This week's class is full</DialogTitle>
            <DialogDescription className="text-ink-2">
              Book {formatDateTime(offeredSession.startsAt)} instead?
            </DialogDescription>
            <div className="flex gap-3">
              <Button type="button" onClick={confirmOfferedSession}>
                Book that class
              </Button>
              <Button type="button" variant="outline" onClick={declineOfferedSession}>
                Back
              </Button>
            </div>
          </>
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

        {phase === "success" && slot && bookedSession && (
          <>
            <DialogTitle className="text-ink">You're all set!</DialogTitle>
            <DialogDescription className="text-ink-muted">
              {selectedChild ? `${selectedChild.firstName}'s` : "Your player's"} free trial is booked.
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
              <Button type="button" variant="outline" onClick={resetToPicker}>
                Add another player
              </Button>
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
