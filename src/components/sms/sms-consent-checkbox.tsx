"use client"

import { Checkbox } from "@/components/ui/checkbox"

/**
 * SmsConsentCheckbox — the single source of truth for our 10DLC SMS opt-in
 * capture. Rendered next to every phone-number field where a customer
 * provides their number, so consent is an affirmative act at the point of
 * collection.
 *
 * Carrier requirements (Telnyx 10DLC review, decline of 2026-07-13): the
 * opt-in form must have a checkbox that is UNCHECKED BY DEFAULT and OPTIONAL
 * (consent is not a condition of registration), placed next to the opt-in
 * language. Do not pre-check this box and do not make it required — either
 * change invalidates the consent under TCPA and fails carrier review. The
 * fine print must state: who sends the messages, message types, frequency,
 * that msg & data rates may apply, the STOP and HELP keywords, and link to
 * the Privacy Policy and Terms. Keep this copy in sync with the carrier
 * campaign registration.
 *
 * Controlled component: the parent owns the boolean and threads it to the
 * endpoint that records the opt-in (see src/lib/sms/opt-in.ts).
 */
export function SmsConsentCheckbox({
  checked,
  onCheckedChange,
  id = "sms-consent",
  className = "",
}: {
  checked: boolean
  onCheckedChange: (checked: boolean) => void
  /** Override when two instances could mount in one document. */
  id?: string
  className?: string
}) {
  return (
    <div className={`flex items-start gap-2.5 ${className}`}>
      <Checkbox
        id={id}
        checked={checked}
        onCheckedChange={(v) => onCheckedChange(v === true)}
        className="mt-0.5"
      />
      <div className="space-y-1">
        <label htmlFor={id} className="block text-sm text-ink cursor-pointer">
          Text me schedule updates, cancellations, and reminders
        </label>
        <p className="text-xs leading-relaxed text-ink-faint">
          By checking this box, I agree to receive recurring automated text
          messages from <span className="font-medium">Aspire Sports</span> —
          schedule updates, cancellations, reminders, and coach messages — at
          the number provided. Consent is not a condition of registration. Msg
          frequency varies. Msg &amp; data rates may apply. Reply{" "}
          <span className="font-medium">STOP</span> to opt out,{" "}
          <span className="font-medium">HELP</span> for help. See our{" "}
          <a href="/privacy" className="underline hover:text-ink-muted">Privacy Policy</a>{" "}
          and{" "}
          <a href="/terms" className="underline hover:text-ink-muted">Terms of Service</a>.
        </p>
      </div>
    </div>
  )
}
