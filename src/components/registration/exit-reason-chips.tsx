"use client"

import { useEffect, useRef, useState } from "react"
import { X } from "lucide-react"
import {
  trackCheckoutAbandonReason,
  type AbandonReason,
  type RegFlow,
  type RegVariant,
} from "@/lib/analytics/events"

const REASONS: { value: AbandonReason; label: string }[] = [
  { value: "just_browsing", label: "Just browsing" },
  { value: "checking_with_team", label: "Checking with my team" },
  { value: "price", label: "Price" },
  { value: "had_questions", label: "Had questions" },
  { value: "something_broke", label: "Something broke" },
]

interface ExitReasonChipsProps {
  seasonId: string
  flow: RegFlow
  variant: RegVariant
  onClose: () => void
}

// One-line optional ask rendered by the wizard right after the user backs out
// of the payment step (once per wizard session). Never blocks anything: one
// tap records a reason and thanks them; the ✕ or ~20s of no interaction
// dismisses it silently. Back ≠ abandonment (people back up to fix typos), so
// the copy stays neutral — analysis separates backed-and-bought later via the
// session's payment_completed.
export function ExitReasonChips({ seasonId, flow, variant, onClose }: ExitReasonChipsProps) {
  const [thanked, setThanked] = useState(false)
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    closeTimer.current = setTimeout(onClose, thanked ? 2_500 : 20_000)
    return () => {
      if (closeTimer.current) clearTimeout(closeTimer.current)
    }
    // Rearm on state flip only — onClose is stable enough for a dismiss timer.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [thanked])

  function handlePick(reason: AbandonReason) {
    if (thanked) return
    trackCheckoutAbandonReason({ reason, seasonId, flow, variant })
    setThanked(true)
  }

  return (
    <div
      data-testid="exit-reason-chips"
      className="mb-4 flex items-start gap-2 rounded-xl border border-border bg-cream-2 p-3 text-sm"
    >
      <div className="flex-1 min-w-0">
        {thanked ? (
          <p className="text-ink">Thanks — noted.</p>
        ) : (
          <>
            <p className="text-ink-2">
              Anything stop you on payment?{" "}
              <span className="text-ink-faint">(optional, one tap)</span>
            </p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {REASONS.map((r) => (
                <button
                  key={r.value}
                  type="button"
                  onClick={() => handlePick(r.value)}
                  className="rounded-full border border-border bg-paper px-3 py-1 text-xs text-ink hover:border-ink-faint transition-colors"
                >
                  {r.label}
                </button>
              ))}
            </div>
          </>
        )}
      </div>
      <button
        type="button"
        onClick={onClose}
        aria-label="Dismiss"
        className="flex-shrink-0 p-1 rounded-lg text-ink-muted hover:text-ink hover:bg-cream-2 transition-colors"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  )
}
