"use client"

/**
 * FindBookingPanel — Sheet slide-over for searching today's confirmed bookings.
 *
 * Debounced input → GET /api/admin/booking-search?q=<query>
 * Shows a result list (name, timeLabel, waiver/checked-in chips) using the same
 * StatusChip pattern as ActivityDetailPanel.
 *
 * States:
 *   - idle / short query   → prompt to type at least 2 characters
 *   - loading              → spinner
 *   - no matches           → "No bookings found" empty message
 *   - results              → scrollable result list
 */

import { useEffect, useState } from "react"
import { Search, Loader2, CalendarCheck2, Flag } from "lucide-react"
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import { Input } from "@/components/ui/input"

// ─── Types ────────────────────────────────────────────────────────────────────

type BookingResult = {
  kind: "drop_in_booking" | "field_rental"
  targetId: string
  name: string
  timeLabel: string
  waiverSigned: boolean
  checkedIn: boolean
}

// ─── Props ────────────────────────────────────────────────────────────────────

interface Props {
  onClose: () => void
}

// ─── Chip (mirrors ActivityDetailPanel StatusChip) ────────────────────────────

interface ChipProps {
  ok: boolean
  okLabel: string
  badLabel: string
}

function StatusChip({ ok, okLabel, badLabel }: ChipProps) {
  if (ok) {
    return (
      <span className="text-[10.5px] font-bold rounded px-1.5 py-0.5 bg-emerald-50 text-emerald-700 border border-emerald-200">
        {okLabel}
      </span>
    )
  }
  return (
    <span className="text-[10.5px] font-bold rounded px-1.5 py-0.5 bg-amber-50 text-amber-700 border border-amber-200">
      {badLabel}
    </span>
  )
}

// ─── Result row ───────────────────────────────────────────────────────────────

function ResultRow({ result }: { result: BookingResult }) {
  const isRental = result.kind === "field_rental"
  return (
    <div className="flex items-start gap-3 px-4 py-3 border-b border-[#e4ddcf] last:border-b-0">
      {/* Icon */}
      <div className="mt-0.5 flex-shrink-0 w-7 h-7 rounded-full bg-[#f5f0e8] flex items-center justify-center">
        {isRental ? (
          <Flag className="h-3.5 w-3.5 text-[#6b5e4e]" />
        ) : (
          <CalendarCheck2 className="h-3.5 w-3.5 text-[#6b5e4e]" />
        )}
      </div>

      {/* Text + chips */}
      <div className="flex-1 min-w-0">
        <div className="text-[13px] font-semibold text-[#1c1a17] leading-tight truncate">
          {result.name}
        </div>
        <div className="text-[11.5px] text-[#8a8175] mt-0.5 truncate">
          {result.timeLabel}
        </div>
        <div className="flex gap-1.5 mt-1.5 flex-wrap">
          <StatusChip ok={result.waiverSigned} okLabel="Waiver" badLabel="No waiver" />
          <StatusChip ok={result.checkedIn} okLabel="Here" badLabel="Not in" />
        </div>
      </div>
    </div>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

export function FindBookingPanel({ onClose }: Props) {
  const [q, setQ] = useState("")
  const [debounced, setDebounced] = useState("")
  const [results, setResults] = useState<BookingResult[] | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Debounce input
  useEffect(() => {
    const t = setTimeout(() => setDebounced(q.trim()), 300)
    return () => clearTimeout(t)
  }, [q])

  // Fetch on debounced change
  useEffect(() => {
    let alive = true
    if (debounced.length < 2) {
      setResults(null)
      setIsLoading(false)
      setError(null)
      return
    }
    setIsLoading(true)
    setError(null)
    fetch(`/api/admin/booking-search?q=${encodeURIComponent(debounced)}`)
      .then(async (r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        return (await r.json()) as { results: BookingResult[] }
      })
      .then((body) => {
        if (!alive) return
        setResults(body.results)
      })
      .catch((err) => {
        if (!alive) return
        console.error("[FindBookingPanel] search failed:", err)
        setError("Search failed — please try again.")
      })
      .finally(() => {
        if (alive) setIsLoading(false)
      })
    return () => {
      alive = false
    }
  }, [debounced])

  const isShortQuery = q.trim().length > 0 && q.trim().length < 2
  const isIdle = q.trim().length === 0

  return (
    <Sheet open onOpenChange={(open) => { if (!open) onClose() }}>
      <SheetContent
        side="right"
        className="w-full sm:max-w-[420px] bg-[#fffdf8] border-l border-[#e4ddcf] flex flex-col p-0 gap-0"
      >
        {/* Header */}
        <SheetHeader className="px-4 pt-4 pb-3 border-b border-[#e4ddcf]">
          <SheetTitle className="text-[15px] font-semibold text-[#1c1a17]">
            Find booking
          </SheetTitle>
          <p className="text-[12px] text-[#8a8175] mt-0.5">
            Search today&apos;s confirmed drop-in bookings and field rentals.
          </p>
        </SheetHeader>

        {/* Search input */}
        <div className="px-4 py-3 border-b border-[#e4ddcf]">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-[#8a8175]" />
            <Input
              autoFocus
              placeholder="Name or last 4 of phone…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              className="pl-8 text-[13px] bg-white border-[#d4cdc2] focus:border-[#b0a898] rounded-lg h-9"
            />
          </div>
        </div>

        {/* Results area */}
        <div className="flex-1 overflow-y-auto">
          {/* Loading */}
          {isLoading && (
            <div className="flex items-center gap-2 px-4 py-4 text-[12px] text-[#8a8175]">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Searching…
            </div>
          )}

          {/* Error */}
          {!isLoading && error && (
            <div className="px-4 py-4 text-[12px] text-rose-700">{error}</div>
          )}

          {/* Idle (nothing typed) */}
          {!isLoading && !error && isIdle && (
            <div className="px-4 py-6 text-center text-[12px] text-[#8a8175]">
              Start typing a name or phone number.
            </div>
          )}

          {/* Short query */}
          {!isLoading && !error && isShortQuery && (
            <div className="px-4 py-6 text-center text-[12px] text-[#8a8175]">
              Keep going — at least 2 characters.
            </div>
          )}

          {/* No results */}
          {!isLoading && !error && !isIdle && !isShortQuery && results !== null && results.length === 0 && (
            <div className="px-4 py-6 text-center text-[12px] text-[#8a8175]">
              No bookings found for &ldquo;{debounced}&rdquo; today.
            </div>
          )}

          {/* Result list */}
          {!isLoading && !error && results !== null && results.length > 0 && (
            <div>
              <div className="px-4 pt-3 pb-1.5 text-[10.5px] font-bold text-[#8a8175] uppercase tracking-wider">
                {results.length} {results.length === 1 ? "match" : "matches"}
              </div>
              {results.map((r) => (
                <ResultRow key={`${r.kind}-${r.targetId}`} result={r} />
              ))}
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  )
}
