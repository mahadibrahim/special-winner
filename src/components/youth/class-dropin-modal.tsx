"use client"

import { useEffect, useRef, useState } from "react"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import { ErrorBanner } from "@/components/ui/error-banner"
import { ChildPicker, type ChildPickerMember } from "@/components/youth/child-picker"
import { DROPIN_WAIVER_TEXT } from "@/lib/dropin/waiver-text"
import { waiverAssentSentence } from "@/lib/consents/waiver-consent-language"
import { formatCents } from "@/lib/classes/ladder-model"

/**
 * The DROP-IN DOOR: booking ONE class on /youth/classes without a
 * membership, a pack or a block. Opened by class-schedule.tsx's per-slot
 * "Book <date> · $X" button (the caller does the `/api/auth/me` probe and
 * bounces signed-out visitors to /signin, so this modal only ever opens for
 * an authed parent).
 *
 * Order of attempts — deliberately "free first, paid second", so a family who
 * already holds something never gets charged twice:
 *
 *  1. `POST /api/classes/book { kind: "member" }`. That endpoint spends a
 *     membership allotment OR a pack/block credit transparently (see
 *     src/lib/classes/credits.ts) and returns `paymentMethod`. A visitor with
 *     nothing to spend gets 403 `no_membership` — the ordinary case here.
 *  2. 403 `no_membership` → the GUARDIAN WAIVER (unless one is already on
 *     file — see below), then the paid drop-in checkout,
 *     `POST /api/dropin/bookings { sessionId, familyMemberId,
 *     waiverAccepted, waiverName }` → redirect to `checkoutUrl`. The price
 *     needs no second confirmation (the button already advertised it) but the
 *     signature does: book-child.ts returns `no_membership` BEFORE its
 *     waiver-on-file check, so a first-time family never reaches step 4 and
 *     would otherwise be charged for a minor's class with no guardian release
 *     on record — landing `waiverSigned: false` and the adult self-waiver
 *     framing on the confirmation surface. This is the PRIMARY path for
 *     first-time families, so it is the one that must not skip consent.
 *
 *     A family who ALREADY holds a valid annual waiver skips the panel:
 *     `ChildPicker` is mounted with `includeWaiverStatus`, so each child
 *     carries `waiverOnFile` from the canonical org-scoped predicate, and a
 *     covered child goes straight to payment with NO waiver fields. The
 *     booking endpoint re-checks the same predicate server-side (the flag is
 *     a UX probe, never the authority) and stamps the resulting booking "On
 *     file (annual waiver)". Asking a covered family to re-sign on every
 *     single drop-in was the friction this removes — and each re-signature
 *     also appended a redundant row to the consents audit log.
 *  3. 402 `allotment_exhausted` (a member who has used this month up) → a
 *     confirm step showing the REAL `memberRateCents` from the response
 *     before taking the same paid path. Never charge a member a price they
 *     weren't shown. Confirming then takes the SAME waiver decision as step 2,
 *     on the same `waiverOnFile` flag.
 *
 *     This used to skip the waiver outright, reasoning that reaching
 *     `allotment_exhausted` proved a signature was already on file. Waivers
 *     EXPIRE now (365 days), so that no longer follows: a family enrolled 14
 *     months ago has spent allotments every month AND has a lapsed waiver —
 *     exactly the long-standing member the expiry rule exists to re-ask. They
 *     are also the last people who should be charged with no live release on
 *     record, so this is a confirm-price → sign → pay sequence, not a
 *     confirm-price → pay one.
 *  4. 422 `waiver_required` → guardian waiver panel; resubmitting carries the
 *     signature, which both books this class and puts the waiver on file.
 *
 * Steps 2/3 reuse `family-classes-card.tsx`'s `payForClass` fetch shape and
 * its response-shape handling verbatim, including the two distinct error
 * envelopes that endpoint emits (nested `{error:{code,message}}` vs flat
 * `{error:"code", message}`) — swallowing the flat one hides the specific,
 * actionable "This class is missing its pricing" copy.
 *
 * Re-entrancy: a monotonic `generationRef`, bumped on every open and close,
 * invalidates a request still in flight after the modal moved on — the same
 * stale-closure guard trial-booking.tsx documents, and re-checked after EVERY
 * await (including the body read, which is its own suspension point).
 */

export interface DropInSlot {
  templateId: string
  name: string
  minAge: number | null
  maxAge: number | null
  venueName: string | null
  locationName: string | null
  sessionRateCents: number | null
}

export interface DropInSession {
  id: string
  startsAt: string
  spotsLeft: number
}

type Phase = "picking" | "booking" | "waiver" | "confirm_paid" | "paying" | "success"

export function formatSessionDateTime(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    weekday: "short",
    month: "short",
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

function humanizeBookError(code: string | undefined, message: unknown): string {
  switch (code) {
    case "session_full":
      return "This class just filled up — try another date below."
    case "session_started":
    case "session_not_scheduled":
      return "This class isn't open for booking any more — try another date below."
    case "already_booked":
      return "This child is already booked for that class."
    case "age_ineligible":
      return "This class is outside that child's age range — try another class."
    case "class_rate_not_configured":
      return "This class is missing its pricing — contact the front desk."
    default:
      return typeof message === "string" ? message : "Could not book this class — please try again."
  }
}

export function ClassDropInModal({
  open,
  slot,
  session,
  onClose,
}: {
  open: boolean
  slot: DropInSlot | null
  session: DropInSession | null
  onClose: () => void
}) {
  const [phase, setPhase] = useState<Phase>("picking")
  const [selectedChild, setSelectedChild] = useState<ChildPickerMember | null>(null)
  const [flowError, setFlowError] = useState<string | null>(null)
  /** Set by the 402 path — the member rate the parent must be shown before
   *  we send them to a payment page. */
  const [paidRateCents, setPaidRateCents] = useState<number | null>(null)
  /** `paymentMethod` off a successful free booking, so the success copy can
   *  say WHICH thing was spent rather than a bare "booked". */
  const [paidWith, setPaidWith] = useState<string | null>(null)

  const [waiverAccepted, setWaiverAccepted] = useState(false)
  const [waiverSignerName, setWaiverSignerName] = useState("")
  /** What happens once the waiver is signed: re-attempt the free booking
   *  (the 422 path) or go straight to the paid checkout carrying the
   *  signature (the 403 no-membership path). */
  const [waiverPurpose, setWaiverPurpose] = useState<"book" | "pay">("book")

  const generationRef = useRef(0)

  // Reset every time the modal opens for a (possibly different) session —
  // otherwise the previous booking's success/error state flashes first. The
  // WAIVER fields are reset too: its assent sentence names a specific child,
  // so a box left ticked from the last child would read as consent given for
  // this one.
  useEffect(() => {
    if (!open) return
    generationRef.current += 1
    setPhase("picking")
    setSelectedChild(null)
    setFlowError(null)
    setPaidRateCents(null)
    setPaidWith(null)
    setWaiverAccepted(false)
    setWaiverSignerName("")
    setWaiverPurpose("book")
  }, [open, session?.id])

  function handleClose() {
    generationRef.current += 1
    onClose()
  }

  async function attemptBook(
    child: ChildPickerMember,
    waiver?: { signedBy: string; consentText: string },
  ) {
    if (!session) return
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
          familyMemberId: child.id,
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

    const body = await parseJson(res)
    if (myGeneration !== generationRef.current) return

    if (res.ok) {
      setPaidWith(typeof body.paymentMethod === "string" ? body.paymentMethod : null)
      setPhase("success")
      return
    }

    const code = typeof body.error === "string" ? body.error : undefined

    if (code === "waiver_required") {
      setWaiverPurpose("book")
      setPhase("waiver")
      return
    }
    if (code === "already_booked") {
      setPaidWith(null)
      setPhase("success")
      return
    }
    if (res.status === 403 && code === "no_membership") {
      // The ordinary drop-in case: nothing to spend, so pay the price the
      // button already advertised — no extra price confirmation. But this is
      // a MINOR's class and book-child.ts bails out here BEFORE its
      // waiver-on-file check, so the guardian release has to be captured
      // now UNLESS one is already on file; otherwise we'd either take money
      // with no signature on record, or make a covered family sign again
      // every single time they book.
      if (waiver) {
        // Already signed a moment ago in this same flow (the 422 path came
        // first) — carry it through rather than asking twice.
        await payForClass(child, myGeneration, waiver.signedBy)
        return
      }
      await payOrCollectWaiver(child, myGeneration)
      return
    }
    if (res.status === 402 && code === "allotment_exhausted") {
      setPaidRateCents(typeof body.memberRateCents === "number" ? body.memberRateCents : null)
      setPhase("confirm_paid")
      return
    }

    setFlowError(humanizeBookError(code, body.message))
    setPhase("picking")
  }

  /**
   * The ONE place the modal decides "straight to payment, or collect a
   * guardian signature first?" — shared by both paid entry points (403
   * `no_membership` and the 402 `allotment_exhausted` confirm step) so they
   * can never drift into disagreeing about who has to sign.
   *
   * Covered → pay with NO waiver fields; the booking endpoint re-checks the
   * same canonical predicate server-side and stamps the booking "On file
   * (annual waiver)". The flag is a UX probe, never the authority.
   *
   * Only strict `true` skips. `undefined` (caller forgot `includeWaiverStatus`,
   * or the probe never ran) and `false` both mean ASK — a missing answer must
   * degrade to collecting consent, never to taking money without it.
   */
  async function payOrCollectWaiver(child: ChildPickerMember, myGeneration: number) {
    if (child.waiverOnFile === true) {
      await payForClass(child, myGeneration)
      return
    }
    setWaiverPurpose("pay")
    setPhase("waiver")
  }

  /** Paid drop-in checkout — same fetch + response handling as
   *  family-classes-card.tsx's `payForClass`, plus the guardian signature
   *  when one was just captured (`waiverSignedBy`). The endpoint takes
   *  `waiverAccepted` + `waiverName` and records the release on the booking
   *  row; omitting them leaves `waiverSigned: false`, which is what the
   *  no-membership path used to do. */
  async function payForClass(
    child: ChildPickerMember,
    myGeneration: number,
    waiverSignedBy?: string,
  ) {
    if (!session) return
    setPhase("paying")
    setFlowError(null)
    try {
      const res = await fetch("/api/dropin/bookings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId: session.id,
          familyMemberId: child.id,
          ...(waiverSignedBy ? { waiverAccepted: true, waiverName: waiverSignedBy } : {}),
        }),
      })
      if (myGeneration !== generationRef.current) return
      const body = await parseJson(res)
      if (myGeneration !== generationRef.current) return

      if (!res.ok) {
        // Two error shapes come off this endpoint: nested
        // `{ error: { code, message } }` and flat `{ error: "<code>", message }`
        // (class_rate_not_configured). Read the human message from either.
        const err = body.error as { message?: string } | string | undefined
        const nestedMessage = typeof err === "object" && err?.message ? err.message : null
        const flatMessage =
          typeof err === "string" && typeof body.message === "string" ? body.message : null
        setFlowError(nestedMessage ?? flatMessage ?? "Could not start payment — please try again.")
        setPhase("picking")
        return
      }
      if (body.paymentRequired === true) {
        if (typeof body.checkoutUrl === "string" && body.checkoutUrl.length > 0) {
          window.location.href = body.checkoutUrl
          return
        }
        // paymentRequired without a usable url is malformed — never fall
        // through to a false success.
        setFlowError("Could not start payment — please try again.")
        setPhase("picking")
        return
      }
      if (body.paymentRequired === false) {
        setPaidWith(null)
        setPhase("success")
        return
      }
      setFlowError("Could not start payment — please try again.")
      setPhase("picking")
    } catch {
      if (myGeneration !== generationRef.current) return
      setFlowError("Network error — please try again.")
      setPhase("picking")
    }
  }

  function submitWaiver(e: React.FormEvent) {
    e.preventDefault()
    if (!selectedChild || !waiverAccepted || waiverSignerName.trim().length === 0) return
    const signedBy = waiverSignerName.trim()
    if (waiverPurpose === "pay") {
      // No membership and no credit: the signature rides along with the paid
      // booking so the row lands `waiverSigned: true`.
      void payForClass(selectedChild, generationRef.current, signedBy)
      return
    }
    void attemptBook(selectedChild, { signedBy, consentText: DROPIN_WAIVER_TEXT })
  }

  function handleSelectChild(member: ChildPickerMember) {
    generationRef.current += 1
    setSelectedChild(member)
    setFlowError(null)
    // Consent is PER CHILD: the assent sentence below names whoever is
    // selected, so a box left ticked (and a name left typed) for the previous
    // child must not be carried over as consent given for this one.
    setWaiverAccepted(false)
    setWaiverSignerName("")
    setWaiverPurpose("book")
    // `member` is passed through, never read back from state — the state
    // update above has not committed yet inside this handler's closure.
    void attemptBook(member)
  }

  const childName = selectedChild
    ? `${selectedChild.firstName} ${selectedChild.lastName}`.trim()
    : "your child"
  const when = session ? formatSessionDateTime(session.startsAt) : ""

  return (
    <Dialog open={open} onOpenChange={(o) => !o && handleClose()}>
      <DialogContent className="bg-paper border-cream-3 text-ink max-w-md max-h-[85vh] overflow-y-auto">
        {slot && session && (
          <>
            {(phase === "picking" || phase === "booking") && (
              <>
                <DialogTitle className="text-ink">Book {slot.name}</DialogTitle>
                <DialogDescription className="text-ink-muted">
                  {when}
                  {slot.venueName || slot.locationName
                    ? ` · ${slot.venueName ?? slot.locationName}`
                    : ""}
                  {slot.sessionRateCents
                    ? ` · ${formatCents(slot.sessionRateCents)} for this one class`
                    : ""}
                  . Pick which child it's for — if they already have a membership, pack or block
                  credit, we'll use that instead of charging you.
                </DialogDescription>

                <ErrorBanner message={flowError} />

                <div className="relative">
                  <ChildPicker
                    ageRange={{ minAge: slot.minAge, maxAge: slot.maxAge }}
                    selectedId={selectedChild?.id ?? null}
                    onSelect={handleSelectChild}
                    disabled={phase === "booking"}
                    participantKind="dependent"
                    // Drives the 403 branch's waiver-panel skip in
                    // `attemptBook` — see the comment there.
                    includeWaiverStatus
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

            {phase === "waiver" && (
              <form onSubmit={submitWaiver} className="space-y-4">
                <DialogTitle className="text-ink">
                  One more step: sign the guardian waiver
                </DialogTitle>
                <DialogDescription className="text-ink-2">
                  {childName} is booking {when} — this covers every class they attend from here on,
                  not just this one.
                  {waiverPurpose === "pay"
                    ? " Sign it here and we'll take you straight to payment."
                    : ""}
                </DialogDescription>

                <p className="text-sm text-ink-2 leading-relaxed rounded-lg border border-amber-200 bg-amber-50/60 p-3">
                  {DROPIN_WAIVER_TEXT}
                </p>

                <div className="flex items-start gap-3">
                  <Checkbox
                    id="dropin-waiver-accept"
                    checked={waiverAccepted}
                    onCheckedChange={(checked) => setWaiverAccepted(checked === true)}
                  />
                  <Label
                    htmlFor="dropin-waiver-accept"
                    className="text-sm leading-snug cursor-pointer"
                  >
                    {waiverAssentSentence("guardian", childName)}
                  </Label>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="dropin-waiver-signer-name" className="text-sm">
                    Parent/guardian signature
                  </Label>
                  <Input
                    id="dropin-waiver-signer-name"
                    value={waiverSignerName}
                    onChange={(e) => setWaiverSignerName(e.target.value)}
                    placeholder="Your full name"
                    autoComplete="name"
                  />
                </div>

                <ErrorBanner message={flowError} />

                <Button
                  type="submit"
                  disabled={!waiverAccepted || waiverSignerName.trim().length === 0}
                  className="w-full sm:w-auto"
                >
                  {waiverPurpose === "pay" ? "Sign waiver & continue to payment" : "Sign waiver & book class"}
                </Button>
              </form>
            )}

            {phase === "confirm_paid" && (
              <>
                <DialogTitle className="text-ink">This month's classes are used up</DialogTitle>
                <DialogDescription className="text-ink-2">
                  {childName}'s monthly allotment is spent. Pay{" "}
                  {formatCents(paidRateCents) ?? "the class rate"} for this one class instead?
                </DialogDescription>
                <ErrorBanner message={flowError} />
                <div className="flex gap-3">
                  <Button
                    type="button"
                    onClick={() => {
                      // Price is confirmed; the waiver decision still applies
                      // (an exhausted allotment no longer implies a live
                      // signature — see step 3 in the header comment).
                      if (selectedChild) {
                        void payOrCollectWaiver(selectedChild, generationRef.current)
                      }
                    }}
                  >
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
                <DialogTitle className="sr-only">Redirecting to payment</DialogTitle>
                <div
                  className="mx-auto size-6 rounded-full border-2 border-ochre border-t-transparent animate-spin"
                  aria-hidden="true"
                />
                <p className="text-sm text-ink-muted">Redirecting to payment…</p>
              </div>
            )}

            {phase === "success" && (
              <>
                <DialogTitle className="text-ink">You're all set!</DialogTitle>
                <DialogDescription className="text-ink-muted">
                  {childName} is booked into {slot.name} on {when}
                  {paidWith === "pack_credit"
                    ? " — no charge, we used one of their class credits."
                    : paidWith === "member_allotment"
                      ? " — no charge, that's one of this month's membership classes."
                      : "."}
                </DialogDescription>
                <div className="flex gap-3">
                  <Button type="button" onClick={handleClose}>
                    Close
                  </Button>
                  <a
                    href="/dashboard/family"
                    className="inline-flex items-center text-sm text-ochre font-medium hover:underline"
                  >
                    See it on your dashboard →
                  </a>
                </div>
              </>
            )}
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
