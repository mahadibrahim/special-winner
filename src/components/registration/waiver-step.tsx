"use client"

import { Shield } from "lucide-react"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

export interface WaiverStepProps {
  /** Whether the registrant is the parent/guardian (guest flow or dependent) vs. registering themselves */
  isSelf: boolean
  /** Whether this is a guest registration (affects checkbox label copy) */
  isGuest: boolean
  /** Name of the person being registered */
  registrantName: string
  /** Full name of the child (guest flow only, used in checkbox label) */
  guestChildFullName?: string
  waiverAccepted: boolean
  waiverSignature: string
  lookingForTeam: boolean
  onWaiverAcceptedChange: (v: boolean) => void
  onWaiverSignatureChange: (v: string) => void
  onLookingForTeamChange: (v: boolean) => void
}

export function WaiverStep({
  isSelf,
  isGuest,
  registrantName,
  guestChildFullName,
  waiverAccepted,
  waiverSignature,
  lookingForTeam,
  onWaiverAcceptedChange,
  onWaiverSignatureChange,
  onLookingForTeamChange,
}: WaiverStepProps) {
  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold text-ink mb-2">Participant Waiver</h3>
        <p className="text-ink-muted text-sm">
          Please read and sign the waiver to continue with registration.
        </p>
      </div>

      <div className="p-4 rounded-xl bg-cream-2 border border-border max-h-64 overflow-y-auto">
        <h4 className="font-medium text-ink mb-3 flex items-center gap-2">
          <Shield className="w-4 h-4 text-primary" />
          Aspire Sports Participation Waiver
        </h4>
        <div className="text-sm text-ink-muted space-y-3">
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
            <strong className="text-ink">3. Photo/Video Release:</strong> I grant permission for Aspire Sports
            to use photographs and video recordings of the participant for promotional purposes.
          </p>
          <p>
            <strong className="text-ink">4. Release of Liability:</strong> I release and hold harmless Aspire
            Sports, its coaches, volunteers, and facilities from any claims arising from
            participation in the program.
          </p>
          <p>
            <strong className="text-ink">5. Code of Conduct:</strong> I agree that the participant will adhere
            to all program rules and demonstrate good sportsmanship at all times.
          </p>
        </div>
      </div>

      {/* Branched waiver body: self vs dependent (guest path handled via checkbox label) */}
      {!isGuest && (
        <div className="mb-2">
          {isSelf ? (
            <p className="text-sm text-ink-muted">
              I, <strong className="text-ink">{registrantName}</strong>, agree to participate in this
              program and accept the terms of the participation waiver.
            </p>
          ) : (
            <p className="text-sm text-ink-muted">
              I authorize <strong className="text-ink">{registrantName}</strong> to participate in this
              program on my behalf as their parent or legal guardian, and accept the
              terms of the participation waiver.
            </p>
          )}
        </div>
      )}

      <div className="space-y-4">
        <div className="flex items-start gap-3">
          <Checkbox
            id="waiver"
            checked={waiverAccepted}
            onCheckedChange={(checked) => onWaiverAcceptedChange(checked === true)}
            className="mt-1 border-border data-[state=checked]:bg-primary data-[state=checked]:border-primary"
          />
          <Label htmlFor="waiver" className="text-sm text-ink-2 cursor-pointer">
            {isGuest ? (
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

        {isSelf && !isGuest && (
          <div className="mt-4 flex items-start gap-2">
            <Checkbox
              id="looking-for-team"
              checked={lookingForTeam}
              onCheckedChange={(v) => onLookingForTeamChange(v === true)}
              className="mt-0.5 border-border data-[state=checked]:bg-primary data-[state=checked]:border-primary"
            />
            <Label htmlFor="looking-for-team" className="text-sm leading-tight text-ink-2 cursor-pointer">
              I'm not registering with a team — please place me with one.
            </Label>
          </div>
        )}
      </div>
    </div>
  )
}
