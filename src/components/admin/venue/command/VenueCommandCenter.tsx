"use client"

/**
 * VenueCommandCenter — top-level React island for /admin/venue.
 *
 * Layout (per approved command-center-layout.html mockup):
 *   Desktop (>820px): CommandSearchBar spanning full width, then Now strip spanning
 *                     full width, then 2-column grid: ScheduleCalendar (1.7fr) left /
 *                     NeedsAttentionQueue (1fr) right.
 *   Mobile (≤820px): single-column stack in order:
 *                     Search bar → Now strip → Needs-attention queue → ScheduleCalendar.
 *
 * Data flow:
 *   useVenueToday polls /api/admin/venue/today every 7 s while visible.
 *   On stale data (>2× poll interval without update) a "updated Ns ago" stamp
 *   is shown but last-good data stays visible.
 *
 * Panel interactions:
 *   CommandSearchBar → onOpenPerson → opens PersonCard slide-over.
 *   PersonCard family row → onOpenPerson → re-targets the PersonCard.
 *   CommandSearchBar → onWalkIn → stub (walk-in requires a session; use the open-slot
 *     rows in ActivityDetailPanel, or open a session first from the calendar).
 *   CommandSearchBar → onFindBooking → opens FindBookingPanel (today's confirmed bookings search).
 *   Clicking a calendar ActivityBlock / NowStrip card → open ActivityDetailPanel.
 *   Walk-ins are started from the ActivityDetailPanel's roster panel (open-slot
 *   "+ add walk-in" rows), not from a direct calendar cell click.
 *   Clicking a NeedsAttentionQueue action → routed via attentionActionTarget()
 *   (src/lib/venue/attention-action.ts): opens the session detail panel when
 *   sessionId is present, else navigates to /messages or /admin/refund-requests.
 *   Items with no reachable target (waiver/photo/ref without a session) render
 *   no action button.
 *   ActivityDetailPanel roster row name → opens PersonCard for that person.
 */

import { useState, useCallback } from "react"
import { Zap } from "lucide-react"
import { useVenueToday } from "@/lib/hooks/use-venue-today"
import { groupAttention } from "@/lib/venue/group-attention"
import { attentionActionTarget } from "@/lib/venue/attention-action"
import { formatAgo } from "@/lib/venue/format-ago"
import { useHydrationBeacon } from "@/lib/hooks/use-hydration-beacon"
import { formatStripDate, parseStripDate } from "@/lib/admin/week-strip"
import { ErrorBanner } from "@/components/ui/error-banner"
import { LoadingSkeleton } from "@/components/ui/loading-skeleton"
import { EmptyState } from "@/components/ui/empty-state"
import { NowStrip } from "./NowStrip"
import { ScheduleCalendar } from "./ScheduleCalendar"
import { NeedsAttentionQueue } from "./NeedsAttentionQueue"
import { ActivityDetailPanel } from "./ActivityDetailPanel"
import { CommandSearchBar } from "./CommandSearchBar"
import { PersonCard, type PersonCardTarget } from "@/components/admin/person/PersonCard"
import { WalkInSessionPicker } from "./WalkInSessionPicker"
import { FindBookingPanel } from "./FindBookingPanel"
import { StartPickupGame } from "./StartPickupGame"
import { PickupRollCall } from "./PickupRollCall"
import type { VenueAttentionItem, VenueTodaySession } from "@/lib/venue/today-types"

// ─── Helpers ──────────────────────────────────────────────────────────────────

type View = "day" | "week"

function addDays(dateStr: string, delta: number): string {
  const d = parseStripDate(dateStr)
  if (!d) return dateStr
  d.setUTCDate(d.getUTCDate() + delta)
  return formatStripDate(d)
}

function addWeeks(dateStr: string, delta: number): string {
  return addDays(dateStr, delta * 7)
}

// ─── Props ────────────────────────────────────────────────────────────────────

interface Props {
  locationId: string
  date: string
}

// ─── Component ────────────────────────────────────────────────────────────────

export function VenueCommandCenter({ locationId, date: initialDate }: Props) {
  useHydrationBeacon()

  // ── View / navigation state ────────────────────────────────────────────────
  const [view, setView]     = useState<View>("day")
  const [date, setDate]     = useState(initialDate)

  const handlePrev = useCallback(() => {
    setDate((d) => (view === "week" ? addWeeks(d, -1) : addDays(d, -1)))
  }, [view])

  const handleNext = useCallback(() => {
    setDate((d) => (view === "week" ? addWeeks(d, 1) : addDays(d, 1)))
  }, [view])

  // Reset to today when toggling to day view or when Today button clicked
  const handleView = useCallback((v: View) => {
    setView(v)
    // Keep current date when switching to week so the week containing current
    // day is shown; only day→day "Today" button resets date.
  }, [])

  const handleToday = useCallback(() => {
    setDate(formatStripDate(new Date()))
    setView("day")
  }, [])

  // ── Data ───────────────────────────────────────────────────────────────────
  const { data, isLoading, isStale, lastUpdatedAt, nowTick, error } = useVenueToday({
    date,
    locationId,
  })

  // ── Panel state ────────────────────────────────────────────────────────────
  const [openSessionId, setOpenSessionId] = useState<string | null>(null)

  const openSession: VenueTodaySession | undefined = data?.sessions.find(
    (s) => s.id === openSessionId,
  )

  const handleOpenActivity = useCallback((sessionId: string) => {
    setOpenSessionId(sessionId)
  }, [])

  const handleClosePanel = useCallback(() => {
    setOpenSessionId(null)
  }, [])

  // ── Walk-in session picker state ───────────────────────────────────────────
  const [walkInPickerOpen, setWalkInPickerOpen] = useState(false)

  // ── Find-booking panel state ───────────────────────────────────────────────
  const [findBookingOpen, setFindBookingOpen] = useState(false)

  // ── Start-pickup-game panel state ──────────────────────────────────────────
  const [startPickupOpen, setStartPickupOpen] = useState(false)

  // ── Active pickup roll-call state ──────────────────────────────────────────
  const [pickupRollCall, setPickupRollCall] = useState<{
    sessionId: string
    sessionTitle: string
  } | null>(null)

  // ── PersonCard state ───────────────────────────────────────────────────────
  const [personTarget, setPersonTarget] = useState<PersonCardTarget | null>(null)

  const handleOpenPerson = useCallback((target: PersonCardTarget) => {
    setPersonTarget(target)
  }, [])

  const handleClosePerson = useCallback(() => {
    setPersonTarget(null)
  }, [])

  // ── Walk-in handler — opens the session picker ────────────────────────────
  // Opens WalkInSessionPicker which lists today's eligible sessions (dropin /
  // class / camp) and launches WalkInFlow for the one the staff member selects.
  const handleWalkIn = useCallback(() => {
    setWalkInPickerOpen(true)
  }, [])

  // ── Find-booking handler ───────────────────────────────────────────────────
  const handleFindBooking = useCallback(() => {
    setFindBookingOpen(true)
  }, [])

  // ── Start-pickup-game handler ──────────────────────────────────────────────
  const handleStartPickup = useCallback(() => {
    setStartPickupOpen(true)
  }, [])

  // ── Pickup created: close the create form, open the roll call ─────────────
  const handlePickupCreated = useCallback(
    (sessionId: string, title: string) => {
      setStartPickupOpen(false)
      setPickupRollCall({ sessionId, sessionTitle: title })
    },
    [],
  )

  // ── Attention action handler ────────────────────────────────────────────────
  const handleAttentionAction = useCallback((item: VenueAttentionItem) => {
    const target = attentionActionTarget(item)
    if (!target) return
    if (target.type === "session") {
      setOpenSessionId(target.sessionId)
    } else {
      window.location.href = target.href
    }
  }, [])

  // ── Derived data ───────────────────────────────────────────────────────────
  const attentionGroups = data ? groupAttention(data.attention) : []
  const locationName    = data?.locationName ?? "Venue"
  const staleSecs       = lastUpdatedAt !== null ? Math.floor((nowTick - lastUpdatedAt) / 1000) : null

  // ── Initial skeleton ───────────────────────────────────────────────────────
  if (isLoading && !data) {
    return (
      <div className="max-w-[1240px] mx-auto px-4 py-5">
        <LoadingSkeleton />
      </div>
    )
  }

  // ── Hard error (no data at all) ─────────────────────────────────────────────
  if (error && !data) {
    return (
      <div className="max-w-[1240px] mx-auto px-4 py-5">
        <ErrorBanner message={error.message} />
      </div>
    )
  }

  return (
    <div className="max-w-[1240px] mx-auto px-4 sm:px-5 py-4 pb-16">
      {/* ── Command search bar ────────────────────────────────────────────── */}
      <div className="-mx-4 sm:-mx-5 -mt-4 mb-4">
        <CommandSearchBar
          onOpenPerson={handleOpenPerson}
          onWalkIn={handleWalkIn}
          onFindBooking={handleFindBooking}
        />
      </div>

      {/* ── Page header ───────────────────────────────────────────────────── */}
      <div className="flex items-start justify-between gap-4 flex-wrap mb-4">
        <div>
          <div className="text-[11px] tracking-[0.18em] uppercase font-bold text-[#8a8175]">
            {locationName}
          </div>
          <h1 className="text-2xl font-semibold text-[#1c1a17] mt-0.5 mb-0 flex items-center gap-2 flex-wrap">
            Today
            {isStale ? (
              /* Stale indicator — honest freshness signal, no pulse animation */
              <span className="inline-flex items-center gap-1.5 text-xs font-bold text-amber-700 ml-1">
                <span className="w-2 h-2 rounded-full bg-amber-500" />
                STALE
                {staleSecs !== null && (
                  <span className="text-amber-700">· updated {formatAgo(staleSecs)} ago</span>
                )}
              </span>
            ) : (
              /* Live pulse indicator */
              <span className="inline-flex items-center gap-1.5 text-xs font-bold text-emerald-700 ml-1">
                <span
                  className="w-2 h-2 rounded-full bg-emerald-600 animate-ping-sm"
                  style={{
                    animation: "venue-pulse 2s infinite",
                  }}
                />
                LIVE
                {staleSecs !== null && (
                  <span className="text-emerald-700">· updated {formatAgo(staleSecs)} ago</span>
                )}
              </span>
            )}
          </h1>
        </div>

        {/* ── Header actions ─────────────────────────────────────────────── */}
        <div className="flex items-center gap-2 flex-wrap mt-1">
          <button
            type="button"
            onClick={handleStartPickup}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-teal-300 bg-teal-50 text-teal-800 text-[12.5px] font-bold hover:bg-teal-100 hover:border-teal-400 transition-colors"
          >
            <Zap className="size-3.5" />
            Start pickup game
          </button>
        </div>
      </div>

      {/* Stale banner (soft — keeps showing data) */}
      {isStale && data && (
        <div className="mb-3 px-3 py-2 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-800 font-medium">
          Connection may be slow — showing last known data.
        </div>
      )}

      {/* ── Now / Next strip ──────────────────────────────────────────────── */}
      <div className="mb-4">
        {data ? (
          <NowStrip sessions={data.sessions} timezone={data.timezone} onOpenActivity={handleOpenActivity} />
        ) : (
          <EmptyState
            title="No sessions loaded"
            description="Sessions will appear here once the schedule loads."
            className="bg-[#fffdf8] border border-[#e4ddcf] rounded-2xl"
          />
        )}
      </div>

      {/*
        ── Body grid ──────────────────────────────────────────────────────────
        Desktop: calendar (1.7fr) left / attention (1fr) right.
        Mobile (≤820px via inline style): single column, attention ABOVE calendar
        so floor staff see the action queue first.

        We use CSS custom media via inline style rather than Tailwind because the
        breakpoint (820px) is exact per the approved mockup.
      */}
      <style>{`
        @keyframes venue-pulse {
          0%   { box-shadow: 0 0 0 0 rgba(47,125,79,.5); }
          70%  { box-shadow: 0 0 0 7px rgba(47,125,79,0); }
          100% { box-shadow: 0 0 0 0 rgba(47,125,79,0); }
        }
        .vcc-grid {
          display: grid;
          grid-template-columns: 1.7fr 1fr;
          grid-template-rows: auto;
          gap: 18px;
          align-items: start;
        }
        .vcc-calendar  { grid-column: 1; grid-row: 1; }
        .vcc-attention { grid-column: 2; grid-row: 1; }
        @media (max-width: 820px) {
          .vcc-grid {
            grid-template-columns: 1fr;
          }
          /* Attention comes BEFORE calendar on mobile */
          .vcc-attention { order: 1; }
          .vcc-calendar  { order: 2; }
        }
      `}</style>

      <div className="vcc-grid">
        {/* ── Schedule calendar (left on desktop) ───────────────────────── */}
        <div className="vcc-calendar bg-[#fffdf8] border border-[#e4ddcf] rounded-2xl overflow-hidden">
          {data ? (
            <ScheduleCalendar
              payload={data}
              view={view}
              onView={handleView}
              onPrev={handlePrev}
              onNext={handleNext}
              onToday={handleToday}
              onOpenActivity={handleOpenActivity}
            />
          ) : (
            <div className="p-4">
              <LoadingSkeleton />
            </div>
          )}
        </div>

        {/* ── Needs-attention queue (right on desktop) ───────────────────── */}
        <div className="vcc-attention">
          <NeedsAttentionQueue
            groups={attentionGroups}
            onAction={handleAttentionAction}
          />
        </div>
      </div>

      {/* ── Activity detail panel (slide-over) ────────────────────────────── */}
      {openSession && (
        <ActivityDetailPanel
          session={openSession}
          locationId={locationId}
          timezone={data?.timezone ?? "America/New_York"}
          onClose={handleClosePanel}
          onOpenPerson={handleOpenPerson}
          onAction={() => {
            /* polling refetches automatically */
          }}
        />
      )}

      {/* ── Person 360 card (slide-over) ───────────────────────────────────── */}
      <PersonCard
        target={personTarget}
        onClose={handleClosePerson}
        onWalkIn={(sessionId) => {
          // If triggered from a PersonCard that already has a session context,
          // open that session's detail panel (which hosts the WalkInFlow).
          if (sessionId) {
            setOpenSessionId(sessionId)
          } else {
            handleWalkIn()
          }
        }}
        onOpenPerson={handleOpenPerson}
      />

      {/* ── Walk-in session picker (sheet) ─────────────────────────────────── */}
      {walkInPickerOpen && data && (
        <WalkInSessionPicker
          sessions={data.sessions}
          locationId={locationId}
          onClose={() => setWalkInPickerOpen(false)}
        />
      )}

      {/* ── Find booking panel (sheet) ──────────────────────────────────────── */}
      {findBookingOpen && (
        <FindBookingPanel onClose={() => setFindBookingOpen(false)} />
      )}

      {/* ── Start pickup game (sheet) ───────────────────────────────────────── */}
      {startPickupOpen && data && (
        <StartPickupGame
          spaces={data.spaces}
          onCreated={handlePickupCreated}
          onCancel={() => setStartPickupOpen(false)}
        />
      )}

      {/* ── Pickup roll call (full-panel overlay) ──────────────────────────── */}
      {pickupRollCall && (
        <PickupRollCall
          sessionId={pickupRollCall.sessionId}
          sessionTitle={pickupRollCall.sessionTitle}
          onClose={() => setPickupRollCall(null)}
        />
      )}
    </div>
  )
}
