"use client"

import { useCallback, useEffect, useState } from "react"
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
 * Sequence:
 *  1. Event fires → cheap auth probe via `GET /api/auth/me` (same endpoint
 *     Navigation uses). Unauthed → hard redirect to
 *     `/signin?redirect=/youth/classes#schedule`. Authed → open the modal
 *     and fetch `/api/public/class-schedule` FRESH (never threaded from the
 *     dispatching island, per the brief) to resolve the slot + its next
 *     upcoming session(s) for the requested templateId.
 *  2. Child picker (`child-picker.tsx`, shared with Task 6): age-filtered
 *     against the slot's minAge/maxAge.
 *  3. `POST /api/classes/book { sessionId, familyMemberId, kind: "trial" }`.
 *     Attempt-then-prompt waiver: a 422 `waiver_required` expands the
 *     guardian waiver panel (same `DROPIN_WAIVER_TEXT` /
 *     `waiverAssentSentence` source choose-slot.tsx uses — never new legal
 *     copy) and resubmits with the signature.
 *  4. Success panel: class name, date/time, venue, a confirmation-email
 *     note, "Add another player" (resets to the child picker for the same
 *     slot) and Close.
 *
 * Error copy (binding, from the task brief):
 *  - `member_child_no_trial` → member kids already have classes included;
 *    links to /dashboard/family.
 *  - `trial_already_used` → trial's used; links to #pricing.
 *  - `session_full` → auto-retries the template's following-week session
 *    (present in the schedule payload's `sessions` list) if one exists;
 *    otherwise "This class is full this week."
 *  - `age_ineligible` → inline on the picker (belt-and-suspenders; the
 *    picker already disables ineligible children client-side).
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
  // schedule endpoint's `sessions` list already sorts this way).
  const [templateSessions, setTemplateSessions] = useState<ScheduleSession[]>([])
  const [sessionIndex, setSessionIndex] = useState(0)

  const [selectedChild, setSelectedChild] = useState<ChildPickerMember | null>(null)
  const [bookedSession, setBookedSession] = useState<ScheduleSession | null>(null)

  const [waiverAccepted, setWaiverAccepted] = useState(false)
  const [waiverSignerName, setWaiverSignerName] = useState("")

  const openForTemplate = useCallback(async (id: string) => {
    let authed = false
    try {
      const meRes = await fetch("/api/auth/me", { credentials: "same-origin" })
      const me = meRes.ok ? await meRes.json() : { user: null }
      authed = Boolean(me?.user)
    } catch {
      authed = false
    }
    if (!authed) {
      window.location.href = SIGNIN_REDIRECT
      return
    }

    setTemplateId(id)
    setLoadError(null)
    setFlowError(null)
    setSelectedChild(null)
    setBookedSession(null)
    setWaiverAccepted(false)
    setWaiverSignerName("")
    setSessionIndex(0)
    setPhase("loading")

    try {
      const res = await fetch("/api/public/class-schedule")
      if (!res.ok) throw new Error("bad status")
      const body = (await res.json()) as { slots: ScheduleSlot[]; sessions: ScheduleSession[] }
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
    return () => window.removeEventListener("youth:trial-requested", handleTrialRequested)
  }, [openForTemplate])

  function closeModal() {
    setPhase("closed")
  }

  async function attemptBooking(
    session: ScheduleSession,
    waiver?: { signedBy: string; consentText: string },
  ) {
    if (!selectedChild) return
    setPhase("booking")
    setFlowError(null)

    let res: Response
    try {
      res = await fetch("/api/classes/book", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId: session.id,
          familyMemberId: selectedChild.id,
          kind: "trial",
          ...(waiver ? { waiver } : {}),
        }),
      })
    } catch {
      setFlowError({ code: "generic", message: "Network error — please try again." })
      setPhase("picking")
      return
    }

    if (res.ok) {
      setBookedSession(session)
      setPhase("success")
      return
    }

    const body = await parseJson(res)
    const code = typeof body.error === "string" ? body.error : undefined

    if (code === "waiver_required") {
      setPhase("waiver")
      return
    }

    if (code === "already_booked") {
      setBookedSession(session)
      setPhase("success")
      return
    }

    if (code === "session_full") {
      const idx = templateSessions.findIndex((s) => s.id === session.id)
      const next = idx >= 0 ? templateSessions[idx + 1] : undefined
      if (next) {
        setSessionIndex(idx + 1)
        await attemptBooking(next, waiver)
        return
      }
      setFlowError({ code: "generic", message: "This class is full this week." })
      setPhase("picking")
      return
    }

    if (code === "member_child_no_trial") {
      setFlowError({
        code: "member_child_no_trial",
        message: "Member kids already have classes included — book a make-up from your dashboard",
      })
      setPhase("picking")
      return
    }

    if (code === "trial_already_used") {
      setFlowError({
        code: "trial_already_used",
        message: "This player's free trial is used — join below to keep coming",
      })
      setPhase("picking")
      return
    }

    if (code === "age_ineligible") {
      setFlowError({
        code: "generic",
        message: `${selectedChild.firstName} is outside this class's age range — pick another player above.`,
      })
      setPhase("picking")
      return
    }

    setFlowError({
      code: "generic",
      message: typeof body.message === "string" ? body.message : "Could not book this class — please try again.",
    })
    setPhase("picking")
  }

  function handleSelectChild(member: ChildPickerMember) {
    setSelectedChild(member)
    setFlowError(null)
    const targetSession = templateSessions[sessionIndex]
    if (!targetSession) return
    void attemptBooking(targetSession)
  }

  async function submitWaiver(e: React.FormEvent) {
    e.preventDefault()
    if (!selectedChild || !waiverAccepted || waiverSignerName.trim().length === 0) return
    const targetSession = templateSessions[sessionIndex]
    if (!targetSession) return
    await attemptBooking(targetSession, {
      signedBy: waiverSignerName.trim(),
      consentText: DROPIN_WAIVER_TEXT,
    })
  }

  function resetToPicker() {
    setSelectedChild(null)
    setBookedSession(null)
    setFlowError(null)
    setWaiverAccepted(false)
    setWaiverSignerName("")
    setSessionIndex(0)
    setPhase(templateSessions.length === 0 ? "no_sessions" : "picking")
  }

  function scrollToPricing() {
    closeModal()
    document.getElementById("pricing")?.scrollIntoView({ behavior: "smooth" })
  }

  const isOpen = phase !== "closed"

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && closeModal()}>
      <DialogContent className="bg-paper border-cream-3 text-ink max-w-md">
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

            <ChildPicker
              ageRange={{ minAge: slot.minAge, maxAge: slot.maxAge }}
              selectedId={selectedChild?.id ?? null}
              onSelect={handleSelectChild}
              disabled={phase === "booking"}
            />

            {phase === "booking" && (
              <div className="flex items-center justify-center gap-2 py-2 text-sm text-ink-muted">
                <div
                  className="size-4 rounded-full border-2 border-ochre border-t-transparent animate-spin"
                  aria-hidden="true"
                />
                Booking…
              </div>
            )}
          </>
        )}

        {phase === "waiver" && slot && (
          <form onSubmit={(e) => void submitWaiver(e)} className="space-y-4">
            <DialogTitle className="text-ink">One more step: sign the guardian waiver</DialogTitle>
            <DialogDescription className="text-ink-2">
              {(selectedChild ? `${selectedChild.firstName} ${selectedChild.lastName}` : "Your player")}{" "}
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
                  selectedChild ? `${selectedChild.firstName} ${selectedChild.lastName}` : undefined,
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
