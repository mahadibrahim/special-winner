"use client"

/**
 * StartPickupGame — Sheet quick-create form for launching an ad-hoc pickup session.
 *
 * Fields:
 *   label           text, required — display name for the session
 *   space           dropdown from the venue's bookable spaces, required
 *   capacity        number, optional — max players (server default: 30)
 *   walkUpRate      dollars → cents, optional — leave blank for free
 *   duration        minutes, optional — default 120
 *
 * On submit: POST /api/admin/pickup/start → calls onCreated(sessionId, label).
 * On cancel: calls onCancel().
 * Inline ErrorBanner on failure (including 409 conflict, which still returns sessionId).
 */

import { useState, useCallback } from "react"
import { Zap, Loader2 } from "lucide-react"
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import { Input } from "@/components/ui/input"
import { ErrorBanner } from "@/components/ui/error-banner"

// ─── Props ────────────────────────────────────────────────────────────────────

interface Props {
  spaces: { id: string; name: string }[]
  onCreated: (sessionId: string, title: string) => void
  onCancel: () => void
}

// ─── Component ────────────────────────────────────────────────────────────────

export function StartPickupGame({ spaces, onCreated, onCancel }: Props) {
  // ── Form fields ──────────────────────────────────────────────────────────
  const [label, setLabel]         = useState("")
  const [spaceId, setSpaceId]     = useState(spaces[0]?.id ?? "")
  const [capacity, setCapacity]   = useState("")
  const [rateStr, setRateStr]     = useState("")
  const [duration, setDuration]   = useState("120")

  // ── Submission state ─────────────────────────────────────────────────────
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError]               = useState<string | null>(null)

  // ── Submit ───────────────────────────────────────────────────────────────
  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault()
      setError(null)

      if (!spaceId) {
        setError("Select a space to continue.")
        return
      }

      const trimmedLabel = label.trim()
      if (!trimmedLabel) {
        setError("Label is required.")
        return
      }

      // Build body
      const body: Record<string, unknown> = {
        spaceId,
        label: trimmedLabel,
      }

      const parsedCapacity = capacity.trim() ? parseInt(capacity, 10) : undefined
      if (parsedCapacity !== undefined) {
        if (isNaN(parsedCapacity) || parsedCapacity < 1) {
          setError("Capacity must be a positive number.")
          return
        }
        body.capacity = parsedCapacity
      }

      const parsedRate = rateStr.trim() ? parseFloat(rateStr) : null
      if (parsedRate !== null) {
        if (isNaN(parsedRate) || parsedRate < 0) {
          setError("Walk-up rate must be a non-negative amount.")
          return
        }
        body.walkUpRateCents = Math.round(parsedRate * 100)
      } else {
        body.walkUpRateCents = null
      }

      const parsedDuration = duration.trim() ? parseInt(duration, 10) : 120
      if (isNaN(parsedDuration) || parsedDuration < 1) {
        setError("Duration must be a positive number of minutes.")
        return
      }
      body.durationMinutes = parsedDuration

      setIsSubmitting(true)
      try {
        const res = await fetch("/api/admin/pickup/start", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        })

        const json = await res.json().catch(() => ({}))

        if (!res.ok && res.status !== 409) {
          setError(
            (json as { error?: string }).error ??
              `Request failed (${res.status})`,
          )
          return
        }

        // 201 or 409 (block conflict — session was still created)
        const sessionId = (json as { sessionId?: string }).sessionId
        if (!sessionId) {
          setError("Unexpected server response — no session ID returned.")
          return
        }

        onCreated(sessionId, trimmedLabel)
      } catch (err) {
        setError(err instanceof Error ? err.message : "Network error — try again.")
      } finally {
        setIsSubmitting(false)
      }
    },
    [label, spaceId, capacity, rateStr, duration, onCreated],
  )

  return (
    <Sheet open onOpenChange={(open) => { if (!open) onCancel() }}>
      <SheetContent
        side="right"
        className="w-full sm:max-w-md p-0 bg-[#fffdf8] border-l border-[#e4ddcf] flex flex-col gap-0"
      >
        {/* ── Header ─────────────────────────────────────────────────────── */}
        <SheetHeader className="px-5 pt-5 pb-4 border-b border-[#e4ddcf] flex-none">
          <div className="text-[10.5px] uppercase tracking-widest font-bold text-teal-700 mb-0.5">
            Pickup game
          </div>
          <SheetTitle className="text-base font-semibold text-[#1c1a17] leading-snug">
            Start a pickup game
          </SheetTitle>
          <p className="text-xs text-[#8a8175] mt-0.5">
            Opens immediately — walk-ups can join as they arrive.
          </p>
        </SheetHeader>

        {/* ── Form ───────────────────────────────────────────────────────── */}
        <form
          onSubmit={handleSubmit}
          className="flex-1 overflow-y-auto px-5 py-4 flex flex-col gap-4"
        >
          {/* Label */}
          <div>
            <label
              htmlFor="spg-label"
              className="block text-[11px] font-bold text-[#4b463e] mb-1"
            >
              Label <span className="text-rose-500">*</span>
            </label>
            <Input
              id="spg-label"
              autoFocus
              placeholder="e.g. Sunday Soccer Pickup"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              required
              disabled={isSubmitting}
              className="bg-white border-[#d4cdc2] focus:border-[#b0a898] rounded-lg h-9 text-[13px]"
            />
          </div>

          {/* Space */}
          <div>
            <label
              htmlFor="spg-space"
              className="block text-[11px] font-bold text-[#4b463e] mb-1"
            >
              Space <span className="text-rose-500">*</span>
            </label>
            {spaces.length === 0 ? (
              <p className="text-xs text-[#8a8175]">
                No spaces available for this location.
              </p>
            ) : (
              <select
                id="spg-space"
                value={spaceId}
                onChange={(e) => setSpaceId(e.target.value)}
                required
                disabled={isSubmitting}
                className="w-full border border-[#d4cdc2] rounded-lg px-3 py-2 bg-white text-[13px] text-[#1c1a17] focus:outline-none focus:border-[#b0a898] focus:ring-1 focus:ring-[#b0a898]/30 disabled:opacity-60 h-9"
              >
                {spaces.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            )}
          </div>

          {/* Capacity + Walk-up rate side by side */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label
                htmlFor="spg-capacity"
                className="block text-[11px] font-bold text-[#4b463e] mb-1"
              >
                Capacity
              </label>
              <Input
                id="spg-capacity"
                type="number"
                min={1}
                step={1}
                placeholder="30"
                value={capacity}
                onChange={(e) => setCapacity(e.target.value)}
                disabled={isSubmitting}
                className="bg-white border-[#d4cdc2] focus:border-[#b0a898] rounded-lg h-9 text-[13px]"
              />
              <p className="text-[10.5px] text-[#8a8175] mt-0.5">Leave blank for 30</p>
            </div>

            <div>
              <label
                htmlFor="spg-rate"
                className="block text-[11px] font-bold text-[#4b463e] mb-1"
              >
                Walk-up rate ($)
              </label>
              <Input
                id="spg-rate"
                type="number"
                min={0}
                step={0.01}
                placeholder="0.00"
                value={rateStr}
                onChange={(e) => setRateStr(e.target.value)}
                disabled={isSubmitting}
                className="bg-white border-[#d4cdc2] focus:border-[#b0a898] rounded-lg h-9 text-[13px]"
              />
              <p className="text-[10.5px] text-[#8a8175] mt-0.5">Leave blank for free</p>
            </div>
          </div>

          {/* Duration */}
          <div>
            <label
              htmlFor="spg-duration"
              className="block text-[11px] font-bold text-[#4b463e] mb-1"
            >
              Duration (minutes)
            </label>
            <Input
              id="spg-duration"
              type="number"
              min={1}
              step={1}
              placeholder="120"
              value={duration}
              onChange={(e) => setDuration(e.target.value)}
              disabled={isSubmitting}
              className="bg-white border-[#d4cdc2] focus:border-[#b0a898] rounded-lg h-9 text-[13px] w-32"
            />
          </div>

          {/* Error */}
          {error && (
            <ErrorBanner message={error} onDismiss={() => setError(null)} />
          )}

          {/* Actions */}
          <div className="flex gap-3 pt-1 mt-auto">
            <button
              type="button"
              onClick={onCancel}
              disabled={isSubmitting}
              className="flex-1 px-4 py-2 rounded-lg border border-[#d4cdc2] text-[13.5px] font-medium text-[#4b463e] bg-[#fffdf8] hover:bg-[#f5f0e8] disabled:opacity-50 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting || !label.trim() || !spaceId}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-[#1c1a17] text-[#fffdf8] text-[13.5px] font-bold hover:bg-[#2e2b26] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  Starting…
                </>
              ) : (
                <>
                  <Zap className="size-4" />
                  Start game
                </>
              )}
            </button>
          </div>
        </form>
      </SheetContent>
    </Sheet>
  )
}
