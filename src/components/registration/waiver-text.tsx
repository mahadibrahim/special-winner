"use client"

import { useState } from "react"
import { Shield, ChevronDown } from "lucide-react"

/**
 * The Aspire Sports Participation Waiver legal copy — collapsed by default so
 * the screen leads with the single required action (agree + sign) rather
 * than a wall of clauses. The terms remain one tap away.
 *
 * This is the ONLY place this legal text lives. Both `waiver-step.tsx`
 * (pre-payment v1 flow) and `completion-form.tsx` (post-payment v2
 * completion flow) render this component rather than forking the copy —
 * changing the waiver means editing exactly this file.
 */
export function WaiverText() {
  const [termsOpen, setTermsOpen] = useState(false)
  return (
    <div className="rounded-xl bg-cream-2 border border-border overflow-hidden">
      <button
        type="button"
        onClick={() => setTermsOpen((o) => !o)}
        aria-expanded={termsOpen}
        className="w-full flex items-center gap-2 px-4 py-3 text-left"
      >
        <Shield className="w-4 h-4 text-primary flex-shrink-0" />
        <span className="font-medium text-ink text-sm flex-1">
          Aspire Sports Participation Waiver
        </span>
        <span className="text-xs text-ink-muted mr-1">
          {termsOpen ? "Hide" : "Read full terms"}
        </span>
        <ChevronDown
          className={`w-4 h-4 text-ink-muted transition-transform ${termsOpen ? "rotate-180" : ""}`}
        />
      </button>
      {!termsOpen && (
        <p className="px-4 pb-3 -mt-1 text-xs text-ink-muted">
          Covers assumption of risk, emergency medical authorization, release
          of liability, and the code of conduct.
        </p>
      )}
      {termsOpen && (
        <div className="px-4 pb-4 max-h-64 overflow-y-auto border-t border-border pt-3 text-sm text-ink-muted space-y-3">
          <p>
            By signing this waiver, I acknowledge and agree to the following terms and conditions
            for participation in Aspire Sports programs:
          </p>
          <p>
            <strong className="text-ink">1. Assumption of Risk:</strong> I understand that participation in
            sports activities involves inherent risks, including but not limited to physical
            injury, illness, and exposure to communicable diseases. I voluntarily assume all
            such risks.
          </p>
          <p>
            <strong className="text-ink">2. Medical Authorization:</strong> In the event of an emergency, I
            authorize Aspire Sports staff to seek and consent to medical treatment for the
            participant if I cannot be reached.
          </p>
          <p>
            <strong className="text-ink">3. Release of Liability:</strong> I release and hold harmless Aspire
            Sports, its coaches, volunteers, and facilities from any claims arising from
            participation in the program.
          </p>
          <p>
            <strong className="text-ink">4. Code of Conduct:</strong> I agree that the participant will adhere
            to all program rules and demonstrate good sportsmanship at all times.
          </p>
          <p className="text-xs text-ink-faint">
            Photo and video use is handled separately below.
          </p>
        </div>
      )}
    </div>
  )
}
