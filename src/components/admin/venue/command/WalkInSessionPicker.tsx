"use client"

/**
 * WalkInSessionPicker — sheet modal for starting a walk-in without a pre-selected session.
 *
 * Lists today's walk-in-eligible sessions (kinds: dropin, class, camp).
 * Selecting one renders WalkInFlow for that session inline.
 * Cancel/back returns to the session list.
 */

import { useState } from "react"
import { Clock, Users, MapPin } from "lucide-react"
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import { EmptyState } from "@/components/ui/empty-state"
import { WalkInFlow } from "./WalkInFlow"
import type { VenueTodaySession } from "@/lib/venue/today-types"

// ─── Constants ────────────────────────────────────────────────────────────────

/** Kinds that accept ad-hoc walk-ins from the command bar. */
const WALKIN_KINDS: VenueTodaySession["kind"][] = ["dropin", "class", "camp"]

const KIND_LABEL: Partial<Record<VenueTodaySession["kind"], string>> = {
  dropin: "Drop-in",
  class:  "Class",
  camp:   "Camp",
}

const KIND_DOT: Partial<Record<VenueTodaySession["kind"], string>> = {
  dropin: "bg-teal-500",
  class:  "bg-blue-500",
  camp:   "bg-orange-500",
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatTimeRange(startsAt: string, endsAt: string): string {
  const fmt = (iso: string) =>
    new Date(iso).toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    })
  return `${fmt(startsAt)} – ${fmt(endsAt)}`
}

function spotsLeft(session: VenueTodaySession): string | null {
  if (session.capacity === null) return null
  const left = session.capacity - session.booked
  if (left <= 0) return "Full"
  return `${left} open`
}

// ─── Props ────────────────────────────────────────────────────────────────────

interface Props {
  sessions: VenueTodaySession[]
  locationId: string
  onClose: () => void
}

// ─── Component ────────────────────────────────────────────────────────────────

export function WalkInSessionPicker({ sessions, locationId, onClose }: Props) {
  const [selected, setSelected] = useState<VenueTodaySession | null>(null)

  const eligible = sessions.filter((s) =>
    (WALKIN_KINDS as string[]).includes(s.kind),
  )

  return (
    <Sheet open onOpenChange={(open) => { if (!open) onClose() }}>
      <SheetContent
        side="right"
        className="w-full sm:max-w-md p-0 bg-[#fffdf8] border-l border-[#e4ddcf] flex flex-col gap-0"
      >
        {selected ? (
          /* ── Walk-in form for the chosen session ──────────────────────── */
          <div className="relative flex-1 overflow-hidden">
            <WalkInFlow
              session={selected}
              locationId={locationId}
              onDone={onClose}
              onCancel={() => setSelected(null)}
            />
          </div>
        ) : (
          /* ── Session list ─────────────────────────────────────────────── */
          <>
            <SheetHeader className="px-5 pt-5 pb-4 border-b border-[#e4ddcf] flex-none">
              <div className="text-[10.5px] uppercase tracking-widest font-bold text-teal-700 mb-0.5">
                Walk-in
              </div>
              <SheetTitle className="text-base font-semibold text-[#1c1a17] leading-snug">
                Choose a session
              </SheetTitle>
              <p className="text-xs text-[#8a8175] mt-0.5">
                Select today&apos;s session to add a walk-in participant.
              </p>
            </SheetHeader>

            <div className="flex-1 overflow-y-auto px-4 py-3">
              {eligible.length === 0 ? (
                <EmptyState
                  title="No walk-in sessions today"
                  description="Walk-ins are available for drop-in, class, and camp sessions. None are scheduled today."
                  className="mt-6"
                />
              ) : (
                <ul className="space-y-2">
                  {eligible.map((session) => {
                    const left = spotsLeft(session)
                    const isFull = left === "Full"
                    const dotClass = KIND_DOT[session.kind] ?? "bg-stone-400"
                    const kindLabel = KIND_LABEL[session.kind] ?? session.kind

                    return (
                      <li key={session.id}>
                        <button
                          type="button"
                          onClick={() => !isFull && setSelected(session)}
                          disabled={isFull}
                          className={`
                            w-full text-left border rounded-xl px-4 py-3 transition-shadow
                            ${isFull
                              ? "border-[#e4ddcf] bg-[#f6f1e7] opacity-60 cursor-not-allowed"
                              : "border-[#e4ddcf] bg-[#fffdf8] hover:border-[#4b463e] hover:shadow-sm focus:outline-none focus:ring-2 focus:ring-ink/20"
                            }
                          `}
                        >
                          {/* Title row */}
                          <div className="flex items-start justify-between gap-2 mb-1.5">
                            <div className="flex items-center gap-2 min-w-0">
                              <span
                                className={`flex-none w-2 h-2 rounded-full mt-0.5 ${dotClass}`}
                                aria-hidden="true"
                              />
                              <span className="font-semibold text-[13.5px] text-[#1c1a17] truncate">
                                {session.title}
                              </span>
                            </div>
                            <span
                              className={`flex-none text-[10.5px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded ${
                                isFull
                                  ? "bg-rose-100 text-rose-700"
                                  : "bg-[#f0ece3] text-[#8a8175]"
                              }`}
                            >
                              {kindLabel}
                            </span>
                          </div>

                          {/* Meta row */}
                          <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-[#4b463e]">
                            <span className="flex items-center gap-1">
                              <Clock className="w-3 h-3 text-[#8a8175]" />
                              {formatTimeRange(session.startsAt, session.endsAt)}
                            </span>
                            <span className="flex items-center gap-1">
                              <MapPin className="w-3 h-3 text-[#8a8175]" />
                              {session.spaceName}
                            </span>
                            {left !== null && (
                              <span
                                className={`flex items-center gap-1 font-medium ${
                                  isFull ? "text-rose-600" : "text-[#4b463e]"
                                }`}
                              >
                                <Users className="w-3 h-3" />
                                {left}
                                {session.capacity !== null &&
                                  ` · ${session.booked}/${session.capacity}`}
                              </span>
                            )}
                            {left === null && session.booked > 0 && (
                              <span className="flex items-center gap-1">
                                <Users className="w-3 h-3 text-[#8a8175]" />
                                {session.booked} booked
                              </span>
                            )}
                          </div>
                        </button>
                      </li>
                    )
                  })}
                </ul>
              )}
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  )
}
