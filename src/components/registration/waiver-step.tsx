"use client"

import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { WaiverText } from "./waiver-text"
import {
  REGISTRATION_WAIVER_ACCEPT_LABEL,
  guestChildWaiverLabelParts,
  wizardWaiverBodyParts,
} from "@/lib/registrations/waiver-text"

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
  // In guest+adult mode the registrant is registering themselves
  const effectiveIsSelf = isGuest ? guestMode === "adult" : isSelf
  const selfBodyParts = wizardWaiverBodyParts("adult")
  const guardianBodyParts = wizardWaiverBodyParts("guardian")
  const guestChildLabelParts = guestChildWaiverLabelParts()
  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold text-ink mb-2">Participant Waiver</h3>
        <p className="text-ink-muted text-sm">
          Confirm you've read the waiver and add your signature to continue.
        </p>
      </div>

      <WaiverText />

      {/* Branched waiver body: self vs dependent — applies to both authed and
          guest paths. The sentence comes from the shared composer, split around
          the name so it can be bolded here while the SERVER records the
          identical plain string (wizardWaiverAssentText). Re-typing it in
          either place is how the consent record and the screen drift apart. */}
      <div className="mb-2">
        {effectiveIsSelf ? (
          <p className="text-sm text-ink-muted">
            {selfBodyParts.before}
            <strong className="text-ink">{registrantName}</strong>
            {selfBodyParts.after}
          </p>
        ) : (
          // child / dependent path — don't render for pure authed-guest-child (handled by checkbox label below)
          !isGuest && (
            <p className="text-sm text-ink-muted">
              {guardianBodyParts.before}
              <strong className="text-ink">{registrantName}</strong>
              {guardianBodyParts.after}
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
                {guestChildLabelParts.before}
                <span className="text-ink font-medium">{guestChildFullName ?? ""}</span>
                {guestChildLabelParts.after}
              </>
            ) : (
              REGISTRATION_WAIVER_ACCEPT_LABEL
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
