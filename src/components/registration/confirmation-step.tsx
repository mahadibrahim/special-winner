"use client"

import { CheckCircle2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { CompletionForm } from "./completion-form"

interface ConfirmationStepProps {
  seasonName: string
  registrantDisplayName: string
  /** True when the customer registered themselves (adult self path). */
  isSelf?: boolean
  /** Season id — threaded to `CompletionForm` for its analytics event. Only
   *  required when `waiverSigned` is false; optional so v1 call sites don't
   *  need to change. */
  seasonId?: string
  /** The just-completed registration's id. Only required when
   *  `waiverSigned` is false — the wizard tracks it as `activeRegistrationId`
   *  through the payment flow. */
  registrationId?: string | null
  /** False for the v2 (adult-locked) flow, which defers waiver signing +
   *  DOB collection to a post-payment completion step rendered here. v1
   *  registrations sign the waiver before payment, so this defaults true
   *  and the completion form never renders for them. */
  waiverSigned?: boolean
  /** True when the v2 minimal guest flow never collected a birth date. */
  needsBirthDate?: boolean
}

export function ConfirmationStep({
  seasonName,
  registrantDisplayName,
  isSelf = false,
  seasonId,
  registrationId,
  waiverSigned = true,
  needsBirthDate = false,
}: ConfirmationStepProps) {
  return (
    <div className="text-center py-8">
      <div className="w-16 h-16 rounded-full bg-green-500/20 flex items-center justify-center mx-auto mb-4">
        <CheckCircle2 className="w-8 h-8 text-green-500" />
      </div>
      <h3 className="text-xl font-semibold text-ink mb-2">Your spot is locked!</h3>
      <p className="text-ink-muted mb-6">
        {isSelf || !registrantDisplayName
          ? `You're registered for ${seasonName}.`
          : `${registrantDisplayName} is registered for ${seasonName}.`}{" "}
        You'll receive a confirmation email shortly. Once divisions are set,
        we'll email your team &amp; schedule before kickoff.
      </p>
      <div className="flex justify-center gap-3">
        <Button asChild variant="outline" className="border-border text-ink hover:bg-cream-2">
          <a href="/dashboard">Go to Dashboard</a>
        </Button>
        <Button asChild className="bg-primary hover:bg-primary/90">
          <a href="/programs">Register Another</a>
        </Button>
      </div>

      {!waiverSigned && registrationId && seasonId && (
        <div className="mt-8 pt-8 border-t border-border text-left">
          <h3 className="text-lg font-semibold text-ink mb-4 text-center">
            You're in — finish before game 1
          </h3>
          <CompletionForm
            registrationId={registrationId}
            seasonId={seasonId}
            needsBirthDate={needsBirthDate}
            via="confirm_screen"
          />
        </div>
      )}
    </div>
  )
}
