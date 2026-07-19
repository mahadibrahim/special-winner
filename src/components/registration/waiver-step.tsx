"use client"

import { useState } from "react"
import { Shield, ChevronDown } from "lucide-react"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

export interface WaiverStepProps {
  /** Whether the registrant is the parent/guardian (guest flow or dependent) vs. registering themselves */
  isSelf: boolean
  /** Whether this is a guest registration (affects checkbox label copy) */
  isGuest: boolean
  /**
   * When isGuest is true, the mode of guest registration:
   * "child" = parent registering a child, "adult" = adult registering themselves.
   * Defaults to "child" when omitted for backward compatibility.
   */
  guestMode?: "child" | "adult"
  /** Name of the person being registered */
  registrantName: string
  /** Full name of the child (guest+child flow only, used in checkbox label) */
  guestChildFullName?: string
  waiverAccepted: boolean
  waiverSignature: string
  onWaiverAcceptedChange: (v: boolean) => void
  onWaiverSignatureChange: (v: string) => void
}

export function WaiverStep({
  isSelf,
  isGuest,
  guestMode = "child",
  registrantName,
  guestChildFullName,
  waiverAccepted,
  waiverSignature,
  onWaiverAcceptedChange,
  onWaiverSignatureChange,
}: WaiverStepProps) {
  // The full legal text is collapsed by default so the screen leads with the
  // single required action (agree + sign) rather than a wall of clauses.
  // The terms remain one tap away and the agreement still references them.
  const [termsOpen, setTermsOpen] = useState(false)
  // In guest+adult mode the registrant is registering themselves
  const effectiveIsSelf = isGuest ? guestMode === "adult" : isSelf
  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold text-ink mb-2">Participant Waiver</h3>
        <p className="text-ink-muted text-sm">
          Confirm you've read the waiver and add your signature to continue.
        </p>
      </div>

      {/* Collapsible legal text — concise summary up top, full clauses on tap. */}
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

      {/* Branched waiver body: self vs dependent — applies to both authed and guest paths */}
      <div className="mb-2">
        {effectiveIsSelf ? (
          <p className="text-sm text-ink-muted">
            I, <strong className="text-ink">{registrantName}</strong>, agree to participate in this
            program and accept the terms of the participation waiver.
          </p>
        ) : (
          // child / dependent path — don't render for pure authed-guest-child (handled by checkbox label below)
          !isGuest && (
            <p className="text-sm text-ink-muted">
              I authorize <strong className="text-ink">{registrantName}</strong> to participate in this
              program on my behalf as their parent or legal guardian, and accept the
              terms of the participation waiver.
            </p>
          )
        )}
      </div>

      <div className="space-y-4">
        <div className="flex items-start gap-3">
          <Checkbox
            id="waiver"
            checked={waiverAccepted}
            onCheckedChange={(checked) => onWaiverAcceptedChange(checked === true)}
            className="mt-1 border-border data-[state=checked]:bg-primary data-[state=checked]:border-primary"
          />
          <Label htmlFor="waiver" className="text-sm text-ink-2 cursor-pointer">
            {isGuest && guestMode === "child" ? (
              <>
                I have read, understand, and agree to the terms of this waiver on behalf of{" "}
                <span className="text-ink font-medium">{guestChildFullName ?? ""}</span>.
              </>
            ) : (
              "I agree to the terms above."
            )}
          </Label>
        </div>

        <div className="space-y-2">
          <Label className="text-ink-muted">Digital Signature *</Label>
          <Input
            value={waiverSignature}
            onChange={(e) => onWaiverSignatureChange(e.target.value)}
            placeholder="Type your full legal name"
            className="bg-cream-2 border-border text-ink focus:border-primary placeholder:text-ink-faint"
          />
          <p className="text-xs text-ink-muted">
            By typing your name above, you agree that this constitutes a legal signature.
          </p>
        </div>
      </div>
    </div>
  )
}
