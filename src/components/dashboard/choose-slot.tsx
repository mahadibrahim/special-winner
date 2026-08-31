"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ErrorBanner } from "@/components/ui/error-banner";
import { EmptyState } from "@/components/ui/empty-state";
import { LoadingSkeleton } from "@/components/ui/loading-skeleton";
import { useHydrationBeacon } from "@/lib/hooks/use-hydration-beacon";
import { DROPIN_WAIVER_TEXT } from "@/lib/dropin/waiver-text";
import { waiverAssentSentence } from "@/lib/consents/waiver-consent-language";

/**
 * Post-checkout home-slot picker — where a freshly-subscribed child's
 * membership lands them (see /api/memberships/subscribe.ts's successUrl for
 * a familyMemberId subscription). Sequence, per the engine-ledger hard
 * requirement that this flow capture the guardian waiver:
 *
 *   1. POST /api/classes/enrollments — creates the child's STANDING weekly
 *      seat in the chosen class-slot template. `no_membership` here means
 *      the subscribe webhook hasn't landed yet (Stripe webhook lag right
 *      after Checkout redirects back) — auto-retried 3x with backoff before
 *      surfacing an error.
 *   2. POST /api/classes/book (no waiver) — books THIS WEEK'S materialized
 *      session immediately. A 422 waiver_required expands the waiver panel
 *      (the shared drop-in waiver text + the guardian consent sentence,
 *      reused from the kiosk/session-page flows — never new legal copy);
 *      resubmitting with the signed waiver both books this week's class AND
 *      establishes waiver-on-file so the materialization cron can auto-book
 *      every future week unattended.
 *
 * Booking (step 2) is best-effort once enrollment (step 1) lands: any
 * booking failure OTHER than waiver_required degrades to a "you're
 * enrolled, we'll pick this up automatically" success state rather than
 * blocking — the durable outcome parents actually came here for is the
 * standing seat, not this exact week's session.
 *
 * ── BLOCK MODE (`?child=X&block=success&slot=Y`) ─────────────────────────
 * This same page is also the success landing for a BLOCK purchase
 * (/api/classes/blocks/purchase's `success_url`). There, step 1 has ALREADY
 * happened: `handleClassBlockPurchaseComplete` created both the pinned
 * `class_credit_grants` row and the credit-backed `class_enrollments` row on
 * `checkout.session.completed`. So block mode:
 *
 *   - LOCKS slot Y. No picker grid, no slot cards — the family already paid
 *     for that specific weekly slot, and offering alternatives here would
 *     invite them to move a seat they bought.
 *   - NEVER POSTs an enrollment. It confirms the webhook's row exists (the
 *     ordinary `/api/classes/summary` fetch this page already makes), and
 *     retries with backoff when it doesn't — a redirect from Stripe Checkout
 *     routinely beats the webhook by a second or two.
 *   - Captures the guardian waiver on the same 422 handshake as above, then
 *     books this week via `POST /api/classes/book { kind: "member" }`. That
 *     endpoint's credit fall-through redeems the pinned block grant
 *     automatically (src/lib/classes/credits.ts) — nothing block-specific is
 *     sent, and no membership is required.
 *   - Degrades to "your seat is confirmed, this week's class will appear
 *     shortly" if the webhook never lands within the retry budget. The
 *     PURCHASE is safe either way; only the immediate booking is at stake.
 */

interface SummaryChild {
  familyMemberId: string;
  name: string;
  membership: {
    tierName: string;
    status: string;
    classAllotmentRemaining: number | null;
  } | null;
  enrollment: {
    id: string;
    templateId: string;
    templateName: string;
    weekday: number;
    startTime: string;
  } | null;
  nextSession: { sessionId: string; startsAt: string; bookingId: string } | null;
  trialUsed: boolean;
}

interface ScheduleSlot {
  templateId: string;
  name: string;
  sportLabel: string | null;
  weekday: number;
  startTime: string;
  durationMins: number;
  minAge: number | null;
  maxAge: number | null;
  locationName: string | null;
  venueName: string | null;
  capacity: number;
  enrolledCount: number;
  spotsLeft: number;
}

interface ScheduleSession {
  id: string;
  templateId: string;
  startsAt: string;
  endsAt: string;
  capacity: number;
  bookedCount: number;
  spotsLeft: number;
}

interface FamilyMemberRow {
  id: string;
  birthDate: string | null;
}

type Phase =
  | "loading"
  | "error"
  | "picking"
  | "enrolling"
  | "payment_settling"
  /** Block mode only — waiting for the purchase webhook to create the seat. */
  | "block_settling"
  | "booking"
  | "waiver"
  | "success";

interface SuccessInfo {
  /** Null only on the block-mode edge case where the purchased template is
   *  no longer on the public schedule — the seat is real, we just can't name
   *  it. */
  slot: ScheduleSlot | null;
  session: ScheduleSession | null;
  /** Set when booking degraded gracefully (e.g. this week's session was
   *  full) — distinct from "no session in the payload at all", which shows
   *  the generic "appears on your dashboard shortly" copy instead. */
  note: string | null;
}

const WEEKDAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function formatDayTime(weekday: number, startTime: string): string {
  const day = WEEKDAY_NAMES[weekday] ?? `Day ${weekday}`;
  const [hourStr, minuteStr] = startTime.slice(0, 5).split(":");
  const hour = Number(hourStr);
  const minute = Number(minuteStr);
  if (Number.isNaN(hour) || Number.isNaN(minute)) return `${day} ${startTime.slice(0, 5)}`;
  const period = hour >= 12 ? "PM" : "AM";
  const hour12 = hour % 12 === 0 ? 12 : hour % 12;
  return `${day} ${hour12}:${String(minute).padStart(2, "0")} ${period}`;
}

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

/** Mirrors ageOnDate in src/lib/classes/book-child.ts exactly — duplicated
 *  here (rather than imported) because that module pulls in server-only
 *  drizzle/db dependencies that can't ship in a client bundle. */
function ageOnDate(birthDate: string, onDate: Date): number {
  const [by, bm, bd] = birthDate.split("-").map(Number);
  let age = onDate.getUTCFullYear() - by;
  const monthDiff = onDate.getUTCMonth() + 1 - bm;
  if (monthDiff < 0 || (monthDiff === 0 && onDate.getUTCDate() < bd)) {
    age -= 1;
  }
  return age;
}

/** Mirrors isAgeIneligible in src/lib/classes/enrollment.ts (inverted to an
 *  "is eligible" predicate) — client-side pre-filter only, the server call
 *  is still the authority. */
function isAgeEligible(slot: ScheduleSlot, age: number | null): boolean {
  if (age === null) return true;
  if (slot.minAge !== null && age < slot.minAge) return false;
  if (slot.maxAge !== null && age > slot.maxAge) return false;
  return true;
}

function humanizeBookError(code: string | undefined, blockMode = false): string {
  // Block mode has no membership and no monthly allotment — a block seat is
  // paid credits pinned to one slot — so the two membership-flavoured
  // messages below would be actively misleading there.
  if (blockMode && (code === "no_membership" || code === "allotment_exhausted")) {
    return "Your seat is paid for — we're still finalising it, and this week's class appears on your dashboard shortly.";
  }
  switch (code) {
    case "session_full":
      return "This week's class is full — you're enrolled, and we'll book you in automatically as soon as a spot opens or for next week.";
    case "session_started":
    case "session_not_scheduled":
      return "This week's class isn't open for booking right now — you're enrolled, and next week's class will book automatically.";
    case "no_membership":
      return "We're still confirming your membership payment for this week's booking — you're enrolled, and it'll pick up automatically once that settles.";
    case "allotment_exhausted":
      return "This month's classes are used up — your first class books when the new month starts, or book a make-up from your dashboard.";
    case "trial_already_used":
    case "member_child_no_trial":
    case "age_ineligible":
      return "You're enrolled — we couldn't confirm this week's class automatically, but check your dashboard shortly.";
    default:
      return "You're enrolled — we couldn't confirm this week's class automatically, but it'll be booked for you shortly.";
  }
}

const NO_MEMBERSHIP_RETRY_DELAYS_MS = [2000, 4000, 8000];

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function parseJson(res: Response): Promise<Record<string, unknown>> {
  try {
    return (await res.json()) as Record<string, unknown>;
  } catch {
    return {};
  }
}

export function ChooseSlot() {
  useHydrationBeacon();

  // window is unavailable during this island's server render — read the
  // query param lazily so the SSR pass doesn't throw, matching the
  // established pattern (see register-experience.tsx's inviteeRef).
  const [childId] = useState<string | null>(() =>
    typeof window !== "undefined"
      ? new URLSearchParams(window.location.search).get("child")
      : null,
  );

  // Block mode: `?block=success&slot=<slotTemplateId>` — see BLOCK MODE in
  // the header comment. Read in the same lazy initializer for the same
  // SSR-safety reason.
  const [blockSlotId] = useState<string | null>(() => {
    if (typeof window === "undefined") return null;
    const params = new URLSearchParams(window.location.search);
    return params.get("block") === "success" ? params.get("slot") : null;
  });
  const blockMode = blockSlotId !== null;

  const [phase, setPhase] = useState<Phase>("loading");
  const [loadError, setLoadError] = useState<string | null>(null);
  const [flowError, setFlowError] = useState<string | null>(null);
  const [settlingAttempt, setSettlingAttempt] = useState(0);

  const [childSummary, setChildSummary] = useState<SummaryChild | null>(null);
  const [childAge, setChildAge] = useState<number | null>(null);
  const [slots, setSlots] = useState<ScheduleSlot[]>([]);
  const [sessions, setSessions] = useState<ScheduleSession[]>([]);

  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null);
  // Set when the child already has a different active enrollment and the
  // parent clicked a different slot — gates the PUT (change-slot) call
  // behind an explicit confirm rather than silently swapping their home
  // class out from under them.
  const [confirmSwitchSlot, setConfirmSwitchSlot] = useState<ScheduleSlot | null>(null);
  const [pendingSlot, setPendingSlot] = useState<ScheduleSlot | null>(null);
  const [pendingSession, setPendingSession] = useState<ScheduleSession | null>(null);
  const [successInfo, setSuccessInfo] = useState<SuccessInfo | null>(null);

  const [waiverAccepted, setWaiverAccepted] = useState(false);
  const [waiverSignerName, setWaiverSignerName] = useState("");
  const [waiverSubmitting, setWaiverSubmitting] = useState(false);

  // Load once on mount — childId is resolved synchronously above (a lazy
  // useState initializer), so this effect's single run picks it up.
  useEffect(() => {
    void loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function loadAll() {
    if (!childId) {
      setLoadError("No child was specified for this link.");
      setPhase("error");
      return;
    }
    setPhase("loading");
    setLoadError(null);
    try {
      const [summaryRes, scheduleRes, familyRes] = await Promise.all([
        fetch("/api/classes/summary"),
        fetch("/api/public/class-schedule"),
        fetch("/api/family-members"),
      ]);
      if (!summaryRes.ok || !scheduleRes.ok || !familyRes.ok) {
        throw new Error("Could not load your class options — please try again.");
      }
      const summaryBody = (await summaryRes.json()) as { children: SummaryChild[] };
      const scheduleBody = (await scheduleRes.json()) as {
        slots: ScheduleSlot[];
        sessions: ScheduleSession[];
      };
      const familyBody = (await familyRes.json()) as { familyMembers: FamilyMemberRow[] };

      const child = summaryBody.children.find((c) => c.familyMemberId === childId);
      if (!child) {
        setLoadError("We couldn't find that child on your account.");
        setPhase("error");
        return;
      }
      const familyRow = familyBody.familyMembers.find((f) => f.id === childId);
      const age =
        familyRow?.birthDate != null ? ageOnDate(familyRow.birthDate, new Date()) : null;

      setChildSummary(child);
      setChildAge(age);
      setSlots(scheduleBody.slots);
      setSessions(scheduleBody.sessions);

      if (blockMode) {
        const boughtSlot = scheduleBody.slots.find((s) => s.templateId === blockSlotId);
        if (!boughtSlot) {
          // The purchase went through against a template the public schedule
          // no longer lists (deactivated between checkout and redirect). The
          // seat is real, so this is a soft landing, not an error page.
          finishSuccess(null, null, "Your payment went through — your seat appears on your dashboard shortly.");
          return;
        }
        await runBlockFlow(boughtSlot, child, scheduleBody.sessions);
        return;
      }

      setPhase("picking");
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Network error — please try again.");
      setPhase("error");
    }
  }

  async function refreshSchedule() {
    try {
      const res = await fetch("/api/public/class-schedule");
      if (res.ok) {
        const body = (await res.json()) as { slots: ScheduleSlot[]; sessions: ScheduleSession[] };
        setSlots(body.slots);
        setSessions(body.sessions);
      }
    } catch {
      // Best-effort refresh only — the caller already has a message to show.
    }
  }

  /**
   * Soonest upcoming session for a template. `from` is passed explicitly by
   * the block flow, which runs INSIDE `loadAll` before `setSessions` has
   * committed — reading the `sessions` state there would always see the
   * empty initial array and silently skip this week's booking.
   */
  function findNextSession(
    templateId: string,
    from: ScheduleSession[] = sessions,
  ): ScheduleSession | null {
    // The schedule endpoint returns sessions sorted ascending by startsAt,
    // so the first match is the soonest upcoming one.
    return from.find((s) => s.templateId === templateId) ?? null;
  }

  /**
   * Enrolls the child in `slot`, OR — when the child already holds a
   * different active enrollment — atomically MOVES the standing seat via
   * `PUT /api/classes/enrollments/:id` instead of POSTing a second one.
   * Two standing enrollments against one membership's allotment is exactly
   * the bug this guards against: the cron would silently fail to auto-book
   * the second slot every week once the shared allotment is spent.
   *
   * Selecting the child's CURRENT slot short-circuits to success with no
   * network call — there's nothing to change.
   */
  async function enrollOrChangeWithRetry(
    slot: ScheduleSlot,
    attempt = 0,
  ): Promise<{ ok: true } | { ok: false; message: string }> {
    const currentEnrollment = childSummary?.enrollment;

    if (currentEnrollment && currentEnrollment.templateId === slot.templateId) {
      return { ok: true };
    }

    let res: Response;
    try {
      res = currentEnrollment
        ? await fetch(`/api/classes/enrollments/${currentEnrollment.id}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ newSlotTemplateId: slot.templateId }),
          })
        : await fetch("/api/classes/enrollments", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ slotTemplateId: slot.templateId, familyMemberId: childId }),
          });
    } catch {
      return { ok: false, message: "Network error — please try again." };
    }
    if (res.ok) return { ok: true };

    const body = await parseJson(res);
    const code = typeof body.error === "string" ? body.error : undefined;

    if (code === "already_enrolled") return { ok: true };

    if (code === "no_membership") {
      if (attempt < NO_MEMBERSHIP_RETRY_DELAYS_MS.length) {
        setPhase("payment_settling");
        setSettlingAttempt(attempt + 1);
        await sleep(NO_MEMBERSHIP_RETRY_DELAYS_MS[attempt]);
        return enrollOrChangeWithRetry(slot, attempt + 1);
      }
      return {
        ok: false,
        message:
          "We're still confirming your membership payment. Give it a minute and try again — contact us if this keeps happening.",
      };
    }

    if (code === "template_full") {
      await refreshSchedule();
      return { ok: false, message: "That class just filled up — pick another time below." };
    }

    if (code === "age_ineligible") {
      return {
        ok: false,
        message: `${childSummary?.name ?? "Your child"} is outside this class's age range — try a different slot below.`,
      };
    }

    // Block families only: the destination slot is priced above the block
    // they paid for, so moving there would silently under-charge. The server
    // sends the human explanation — surface it rather than burying it under
    // the generic retry copy.
    if (code === "rate_mismatch") {
      return {
        ok: false,
        message:
          typeof body.message === "string"
            ? body.message
            : "That class is priced differently from the block you paid for — pick another, or contact us and we'll sort it out.",
      };
    }

    return {
      ok: false,
      message: typeof body.message === "string" ? body.message : "Could not enroll — please try again.",
    };
  }

  /**
   * BLOCK MODE. The webhook already created the seat and the pinned credit
   * grant, so this NEVER enrolls — it only confirms the row landed, then
   * books this week. See BLOCK MODE in the header comment.
   *
   * `child`/`sessions` are passed in rather than read from state: this runs
   * inside `loadAll`, before either `setChildSummary` or `setSessions` has
   * committed.
   */
  async function runBlockFlow(
    slot: ScheduleSlot,
    child: SummaryChild,
    scheduleSessions: ScheduleSession[],
    attempt = 0,
  ): Promise<void> {
    if (child.enrollment?.templateId === slot.templateId) {
      await attemptBooking(slot, undefined, scheduleSessions);
      return;
    }

    // The Stripe redirect routinely beats the webhook. Re-read the summary
    // with the same backoff ladder the membership path uses for its own
    // settle-lag, then degrade rather than blocking on it.
    if (attempt < NO_MEMBERSHIP_RETRY_DELAYS_MS.length) {
      setPhase("block_settling");
      setSettlingAttempt(attempt + 1);
      await sleep(NO_MEMBERSHIP_RETRY_DELAYS_MS[attempt]);
      let refreshed: SummaryChild | undefined;
      try {
        const res = await fetch("/api/classes/summary");
        if (res.ok) {
          const body = (await res.json()) as { children: SummaryChild[] };
          refreshed = body.children.find((c) => c.familyMemberId === childId);
        }
      } catch {
        // Fall through to the next attempt — a transient failure here is
        // indistinguishable from the webhook simply not having landed.
      }
      if (refreshed) setChildSummary(refreshed);
      await runBlockFlow(slot, refreshed ?? child, scheduleSessions, attempt + 1);
      return;
    }

    finishSuccess(
      slot,
      null,
      "Your payment went through and your seat is being finalized — this week's class appears on your dashboard shortly.",
    );
  }

  function finishSuccess(
    slot: ScheduleSlot | null,
    session: ScheduleSession | null,
    note: string | null,
  ) {
    setSuccessInfo({ slot, session, note });
    setPendingSlot(null);
    setPendingSession(null);
    setPhase("success");
  }

  async function attemptBooking(
    slot: ScheduleSlot,
    waiver?: { signedBy: string; consentText: string },
    /** Explicit session list for callers running before `setSessions` has
     *  committed (the block flow) — see findNextSession's comment. */
    sessionsOverride?: ScheduleSession[],
  ) {
    setPhase("booking");
    const nextSession = findNextSession(slot.templateId, sessionsOverride ?? sessions);
    if (!nextSession) {
      // No materialized session in the next 14 days — the enrollment alone
      // is the success outcome; the cron books the first real session once
      // one exists.
      finishSuccess(slot, null, null);
      return;
    }

    let res: Response;
    try {
      res = await fetch("/api/classes/book", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId: nextSession.id,
          familyMemberId: childId,
          kind: "member",
          ...(waiver ? { waiver } : {}),
        }),
      });
    } catch {
      finishSuccess(slot, null, "We couldn't confirm this week's class automatically — check your dashboard shortly.");
      return;
    }

    if (res.ok) {
      finishSuccess(slot, nextSession, null);
      return;
    }

    const body = await parseJson(res);
    const code = typeof body.error === "string" ? body.error : undefined;

    if (code === "waiver_required") {
      setPendingSlot(slot);
      setPendingSession(nextSession);
      setPhase("waiver");
      return;
    }

    if (code === "already_booked") {
      finishSuccess(slot, nextSession, null);
      return;
    }

    // Any other booking failure: the standing enrollment already landed —
    // degrade to a soft success rather than blocking the whole flow on a
    // best-effort immediate booking.
    finishSuccess(slot, null, humanizeBookError(code, blockMode));
  }

  /**
   * Slot-card click handler. When the child already has a DIFFERENT active
   * enrollment, this only opens the confirm-switch prompt — the actual
   * change goes through handleSelectSlot after the parent confirms.
   */
  function requestSelectSlot(slot: ScheduleSlot) {
    if (phase === "enrolling" || phase === "payment_settling" || phase === "booking") return;
    const currentEnrollment = childSummary?.enrollment;
    if (currentEnrollment && currentEnrollment.templateId !== slot.templateId) {
      setConfirmSwitchSlot(slot);
      return;
    }
    void handleSelectSlot(slot);
  }

  async function handleSelectSlot(slot: ScheduleSlot) {
    if (phase === "enrolling" || phase === "payment_settling" || phase === "booking") return;
    setConfirmSwitchSlot(null);
    setSelectedTemplateId(slot.templateId);
    setFlowError(null);
    setSettlingAttempt(0);
    setPhase("enrolling");

    const enrollResult = await enrollOrChangeWithRetry(slot);
    if (!enrollResult.ok) {
      setPhase("picking");
      setFlowError(enrollResult.message);
      setSelectedTemplateId(null);
      return;
    }
    await attemptBooking(slot);
  }

  async function submitWaiver(e: React.FormEvent) {
    e.preventDefault();
    if (!pendingSlot || !pendingSession) return;
    if (!waiverAccepted || waiverSignerName.trim().length === 0) return;
    setWaiverSubmitting(true);
    try {
      await attemptBooking(pendingSlot, {
        signedBy: waiverSignerName.trim(),
        consentText: DROPIN_WAIVER_TEXT,
      });
    } finally {
      setWaiverSubmitting(false);
    }
  }

  // ---------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------

  if (phase === "loading") {
    return (
      <div className="max-w-2xl mx-auto mt-8">
        <LoadingSkeleton variant="card" rows={4} />
      </div>
    );
  }

  if (phase === "error") {
    return (
      <div className="max-w-2xl mx-auto mt-8 space-y-4">
        <ErrorBanner message={loadError} />
        <a href="/dashboard/family" className="text-sm text-ochre font-medium hover:underline">
          Back to your dashboard →
        </a>
      </div>
    );
  }

  if (phase === "success" && successInfo) {
    const { slot, session, note } = successInfo;
    return (
      <div className="max-w-2xl mx-auto mt-8">
        <div className="rounded-xl border border-emerald-300 bg-emerald-50 px-6 py-6 text-emerald-900 space-y-3">
          <div className="flex items-start gap-3">
            <svg xmlns="http://www.w3.org/2000/svg" className="mt-0.5 size-6 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" /><polyline points="22 4 12 14.01 9 11.01" />
            </svg>
            <div>
              <h2 className="font-semibold text-lg">You're all set!</h2>
              <p className="text-sm opacity-90 mt-1">
                {slot ? (
                  <>
                    {childSummary?.name ?? "Your child"}
                    {blockMode ? " has a seat in " : " is enrolled in "}
                    {slot.name} — {formatDayTime(slot.weekday, slot.startTime)}
                    {slot.venueName ? ` at ${slot.venueName}` : ""}
                    {blockMode ? " for the rest of the block" : ""}.
                  </>
                ) : (
                  <>{childSummary?.name ?? "Your child"}'s seat is paid for.</>
                )}
              </p>
            </div>
          </div>
          {session ? (
            <p className="text-sm">First class: {formatDateTime(session.startsAt)}</p>
          ) : note ? (
            <p className="text-sm">{note}</p>
          ) : (
            <p className="text-sm">Your first class appears on your dashboard shortly.</p>
          )}
        </div>
        <a
          href="/dashboard/family"
          className="mt-4 inline-block text-sm text-ochre font-medium hover:underline"
        >
          Go to your family dashboard →
        </a>
      </div>
    );
  }

  if (phase === "waiver" && pendingSlot) {
    const playerName = childSummary?.name ?? "your child";
    return (
      <div className="max-w-2xl mx-auto mt-8">
        <form
          onSubmit={(e) => void submitWaiver(e)}
          className="rounded-xl border border-amber-200 bg-amber-50/60 p-5 space-y-4"
        >
          <div>
            <h2 className="font-semibold text-ink">One more step: sign the guardian waiver</h2>
            <p className="mt-1 text-sm text-ink-2">
              {playerName} {blockMode ? "has a seat in" : "is enrolled in"} {pendingSlot.name} —
              this covers every class they attend from here on, not just this week's.
            </p>
          </div>

          <p className="text-sm text-ink-2 leading-relaxed">{DROPIN_WAIVER_TEXT}</p>

          <div className="flex items-start gap-3">
            <Checkbox
              id="waiver-accept"
              checked={waiverAccepted}
              onCheckedChange={(checked) => setWaiverAccepted(checked === true)}
            />
            <Label htmlFor="waiver-accept" className="text-sm leading-snug cursor-pointer">
              {waiverAssentSentence("guardian", playerName)}
            </Label>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="waiver-signer-name" className="text-sm">
              Parent/guardian signature
            </Label>
            <Input
              id="waiver-signer-name"
              value={waiverSignerName}
              onChange={(e) => setWaiverSignerName(e.target.value)}
              placeholder="Your full name"
              autoComplete="name"
            />
          </div>

          <Button
            type="submit"
            disabled={!waiverAccepted || waiverSignerName.trim().length === 0 || waiverSubmitting}
            className="w-full sm:w-auto"
          >
            {waiverSubmitting ? "Saving…" : "Sign waiver & confirm class"}
          </Button>
        </form>
        {/* The enrollment already stands even without a signature — this is
            an exit for "not right now", never a way to skip the waiver
            requirement for booking itself. */}
        <a
          href="/dashboard/family"
          className="mt-4 inline-block text-sm text-ochre font-medium hover:underline"
        >
          Back to your dashboard — I'll sign this later →
        </a>
      </div>
    );
  }

  if (
    phase === "enrolling" ||
    phase === "payment_settling" ||
    phase === "block_settling" ||
    phase === "booking"
  ) {
    return (
      <div className="max-w-2xl mx-auto mt-8">
        <div className="rounded-xl border border-border bg-cream-2 px-6 py-8 text-center space-y-2">
          <div className="mx-auto size-6 rounded-full border-2 border-ochre border-t-transparent animate-spin" aria-hidden="true" />
          <p className="text-sm text-ink-muted">
            {phase === "payment_settling" || phase === "block_settling"
              ? `Confirming your payment settled… (attempt ${settlingAttempt} of ${NO_MEMBERSHIP_RETRY_DELAYS_MS.length})`
              : phase === "booking"
                ? "Booking your first class…"
                : "Enrolling…"}
          </p>
        </div>
      </div>
    );
  }

  // phase === "picking"
  const eligibleSlots = slots
    .filter((s) => isAgeEligible(s, childAge))
    .sort((a, b) => (a.weekday - b.weekday) || a.startTime.localeCompare(b.startTime));

  return (
    <div className="max-w-3xl mx-auto mt-8 space-y-6">
      <div>
        <h1 className="text-2xl font-display text-ink">
          Pick {childSummary?.name ?? "your child"}'s home class
        </h1>
        <p className="text-sm text-ink-muted mt-1">
          {childSummary?.membership
            ? `${childSummary.membership.tierName} — ${
                childSummary.membership.classAllotmentRemaining != null
                  ? `${childSummary.membership.classAllotmentRemaining} classes left this month`
                  : "membership active"
              }`
            : "Confirming your membership — pick a slot below and we'll take care of the rest."}
        </p>
      </div>

      {childSummary?.enrollment && (
        <div className="rounded-lg border border-border bg-cream-2 px-4 py-3 text-sm text-ink-muted">
          Already enrolled in {childSummary.enrollment.templateName} —{" "}
          {formatDayTime(childSummary.enrollment.weekday, childSummary.enrollment.startTime)}.
          Picking a different slot below switches their home class.
        </div>
      )}

      <ErrorBanner message={flowError} />

      {confirmSwitchSlot ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50/60 p-5 space-y-4">
          <p className="text-sm text-ink-2">
            Switch {childSummary?.name ?? "your child"}'s home class to{" "}
            <strong>{confirmSwitchSlot.name}</strong> (
            {formatDayTime(confirmSwitchSlot.weekday, confirmSwitchSlot.startTime)})?
            {childSummary?.enrollment && (
              <> This replaces their current class, {childSummary.enrollment.templateName}.</>
            )}
          </p>
          {/* Deliberate behaviour, not an oversight (Task 8): changing the
              home slot moves the STANDING weekly seat only. A make-up class
              they already paid for is a booking on a specific session, and
              moving it would either lose that payment or silently re-price
              it — so it stays where it is, and we say so up front. */}
          <p className="text-sm text-ink-muted">
            Any make-up classes you've already paid for stay on their original day — this only
            moves the weekly class.
          </p>
          <div className="flex gap-3">
            <Button type="button" onClick={() => void handleSelectSlot(confirmSwitchSlot)}>
              Switch class
            </Button>
            <Button type="button" variant="outline" onClick={() => setConfirmSwitchSlot(null)}>
              Cancel
            </Button>
          </div>
        </div>
      ) : eligibleSlots.length === 0 ? (
        <EmptyState
          title="No classes yet for this age"
          description="We don't have an open slot in this child's age range right now — check back soon or reach out and we'll help you find one."
        />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {eligibleSlots.map((slot) => {
            const full = slot.spotsLeft === 0;
            const isSelected = selectedTemplateId === slot.templateId;
            return (
              <button
                key={slot.templateId}
                type="button"
                disabled={full}
                onClick={() => requestSelectSlot(slot)}
                className={`text-left rounded-xl border p-4 transition-colors ${
                  full
                    ? "border-border bg-cream-2 opacity-60 cursor-not-allowed"
                    : isSelected
                      ? "border-ochre bg-ochre/5"
                      : "border-border hover:border-ochre/50"
                }`}
              >
                <div className="font-semibold text-ink">{slot.name}</div>
                <div className="text-sm text-ink-muted mt-0.5">
                  {formatDayTime(slot.weekday, slot.startTime)} · {slot.durationMins} min
                </div>
                {(slot.venueName || slot.locationName) && (
                  <div className="text-sm text-ink-muted">
                    {slot.venueName ?? slot.locationName}
                  </div>
                )}
                <div className="text-xs mt-2 font-medium">
                  {full ? (
                    <span className="text-destructive">Class full</span>
                  ) : (
                    <span className="text-emerald-700">{slot.spotsLeft} spots left</span>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
